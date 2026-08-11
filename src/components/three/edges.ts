'use client'

/**
 * Feature edges: the dark lines that make the machine read as machined.
 *
 * Deriving them with THREE.EdgesGeometry costs about 3.5 seconds of blocking
 * main-thread work on this assembly — it allocates a string per triangle edge,
 * roughly a million of them — and it used to happen during the first render,
 * so the page froze solid while the model appeared. On a phone that is several
 * times worse.
 *
 * They are a pure function of the geometry, so `npm run convert-model` bakes
 * them into public/models/rov-edges.bin and this loads that instead: the same
 * lines, at no CPU cost. The file carries a triangle count per part, checked
 * against the geometry actually loaded — if the bake is stale or missing, the
 * edges are derived here after all, but spread across idle callbacks a part at
 * a time so the page still never locks up.
 */

import { useEffect, useState } from 'react'
import * as THREE from 'three'

export const EDGES_URL = '/models/rov-edges.bin'

/** Must match THRESHOLD_DEG in scripts/build-edges.mjs. */
export const EDGE_THRESHOLD = 26

type BakedPart = { id: string; offset: number; count: number; tris: number }
type Baked = Map<string, { positions: Float32Array; tris: number }>

/**
 * One fetch per page, however many canvases ask. Cached as the promise rather
 * than the result so concurrent callers share the in-flight request.
 */
let bakedRequest: Promise<Baked | null> | null = null

function parseBaked(buffer: ArrayBuffer): Baked | null {
  const view = new DataView(buffer)
  if (buffer.byteLength < 8) return null
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )
  if (magic !== 'OOE1') return null

  const headerLength = view.getUint32(4, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))) as {
    origin: [number, number, number]
    scale: number
    parts: BakedPart[]
  }

  const body = new Int16Array(buffer, 8 + headerLength)
  const out: Baked = new Map()

  for (const part of header.parts) {
    const positions = new Float32Array(part.count * 3)
    const start = part.offset * 3
    // Quantised on a grid over the model's own bounding box; undo it back into
    // raw CAD millimetres, which is the space the solids arrive in too.
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = body[start + i] * header.scale + header.origin[0]
      positions[i + 1] = body[start + i + 1] * header.scale + header.origin[1]
      positions[i + 2] = body[start + i + 2] * header.scale + header.origin[2]
    }
    out.set(part.id, { positions, tris: part.tris })
  }

  return out
}

function loadBaked(): Promise<Baked | null> {
  if (!bakedRequest) {
    bakedRequest = fetch(EDGES_URL)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((buffer) => (buffer ? parseBaked(buffer) : null))
      .catch((error) => {
        // Falling back is survivable, so this must never throw — but it must
        // not be silent either: a malformed bake and an absent one look
        // identical from the outside, and one of them is a bug.
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[edges] could not read the baked edges:', error)
        }
        return null
      })
  }
  return bakedRequest
}

/** Starts the download early, alongside the model itself. */
export function preloadEdges() {
  if (typeof window !== 'undefined') void loadBaked()
}

type IdleHandle = { cancel: () => void }

/** requestIdleCallback where it exists, a timeout where it does not. */
function onIdle(run: () => void): IdleHandle {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run(), { timeout: 500 })
    return { cancel: () => cancelIdleCallback(id) }
  }
  const id = setTimeout(run, 24)
  return { cancel: () => clearTimeout(id) }
}

/**
 * Edge geometry per part, in the model's final space.
 *
 * Returns what is ready so far and re-renders as more arrives, so the solids
 * are on screen from the first frame and the lines land when they land.
 *
 * `normalise` is the same transform the solids get — the bake is stored in raw
 * CAD coordinates so it stays valid no matter how the site chooses to frame
 * the model.
 */
export function useFeatureEdges(
  geometries: Map<string, THREE.BufferGeometry>,
  normalise: THREE.Matrix4,
  /** Parts denser than this are drawn without edges; at that density they read as noise. */
  budget: number,
): Map<string, THREE.BufferGeometry> {
  const [edges, setEdges] = useState<Map<string, THREE.BufferGeometry>>(new Map())

  useEffect(() => {
    let cancelled = false
    let idle: IdleHandle | null = null
    const built = new Map<string, THREE.BufferGeometry>()

    const wanted = Array.from(geometries.entries()).filter(([, geometry]) => {
      const index = geometry.getIndex()
      const count = index ? index.count : geometry.getAttribute('position').count
      return count / 3 < budget
    })

    const publish = () => {
      if (!cancelled) setEdges(new Map(built))
    }

    loadBaked().then((baked) => {
      if (cancelled) return

      // Derive whatever the bake cannot account for, one part per idle slot.
      const derive = (queue: [string, THREE.BufferGeometry][]) => {
        const step = () => {
          if (cancelled) return
          const next = queue.shift()
          if (!next) {
            publish()
            return
          }
          const [id, geometry] = next
          built.set(id, new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD))
          publish()
          idle = onIdle(step)
        }
        idle = onIdle(step)
      }

      const missing: [string, THREE.BufferGeometry][] = []

      for (const [id, geometry] of wanted) {
        const bake = baked?.get(id)
        const index = geometry.getIndex()
        const triangles = (index ? index.count : geometry.getAttribute('position').count) / 3
        // A part whose triangle count has moved is a part whose edges have
        // moved: the bake is out of date, so derive this one instead.
        if (!bake || Math.abs(bake.tris - triangles) > 0.5) {
          missing.push([id, geometry])
          continue
        }
        const edge = new THREE.BufferGeometry()
        edge.setAttribute('position', new THREE.BufferAttribute(bake.positions.slice(), 3))
        edge.applyMatrix4(normalise)
        built.set(id, edge)
      }

      publish()
      if (missing.length > 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[edges] deriving ${missing.map(([id]) => id).join(', ')} in the browser — ` +
              `run \`npm run convert-model\` to bake them`,
          )
        }
        derive(missing)
      }
    })

    return () => {
      cancelled = true
      idle?.cancel()
      built.forEach((geometry) => geometry.dispose())
    }
  }, [geometries, normalise, budget])

  return edges
}

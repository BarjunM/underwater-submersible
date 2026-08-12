'use client'

/**
 * The job, in one loop: the machine runs the pipe, stops, sweeps its light
 * over the spot, and moves on.
 *
 * Every element reads the same normalised clock (see mission.ts), so the whole
 * sequence stays in step and can be restarted from anywhere. Where it stops
 * moves every loop, so it never runs the same patrol twice.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { parts } from '@/lib/content'
import { useTheme } from '@/lib/theme'
import { DRACO_PATH, GLB_URL, partIdFor, unpack } from './RovModel'
import {
  COLOUR,
  cycleOf,
  PIPE,
  rovHeading,
  rovSpeed,
  rovX,
  scanStrength,
  timeOf,
  view,
} from './mission'

/**
 * The two colours the theme decides: the water (fog, matching the page) and
 * the trace (the scan ring) — light on both, see below.
 */
/* Must track --ink and --bone in globals.css: the fog fades the far end of the
   pipe into the page itself, so a stale value shows up as a seam. */
const WATER = { dark: '#0e0f0c', light: '#f7f3e8' }
/*
 * The trace does NOT flip with the theme, and the water does.
 *
 * The fog is the page, so it has to be whatever the page is. But the scan
 * ring is drawn on the pipe, and the pipe is near black on
 * both themes — inking them for the print put dark marks on a black pipe,
 * where they simply were not there. What they contrast with is the pipe.
 */
const TRACE = { dark: '#f2efe1', light: '#f7f3e8' }

/* ------------------------------------------------------------------- pipe */

/**
 * The pipe, drawn flat.
 *
 * Not a lit render — an unlit fill, one value, no gradient across it and no
 * haze on its ends. A strip a hundred pixels tall cannot show off a shaded
 * cylinder; all the lighting bought was a soft grey smear that had to be
 * fought to stay legible against either page. As a solid black form on the
 * print, and its inverse on the negative, it reads instantly at any size, and
 * it costs one draw call with no shading maths behind it.
 */
/**
 * Surface for the pipe, drawn rather than fetched.
 *
 * A flat fill reads as a bar; real pipe reads as pipe because it is not one
 * even value. This is a small canvas of multiplicative greys — mostly white,
 * which changes nothing, with darker weld seams at intervals and a wash of
 * mottling and lengthwise streaking over the top. Because it multiplies the
 * material colour it works unchanged on both themes: it darkens the black
 * pipe on the print and the grey one on the negative by the same proportion.
 *
 * Procedural on purpose. An image would be another request, another asset to
 * ship and another thing to keep in step with the palette; this is a few
 * hundred bytes of code and one 256×64 texture built once.
 */
function usePipeTexture() {
  return useMemo(() => {
    // The canvas element does not exist during prerender. Nothing draws then
    // either, so a null map is the right answer rather than a guard everywhere.
    if (typeof document === 'undefined') return null

    const w = 256
    const h = 64
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)

    // Deterministic, so the pipe is the same pipe on every load.
    let seed = 20260811
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    // Lengthwise streaking — the grain of a rolled and welded tube.
    for (let i = 0; i < 150; i++) {
      const y = Math.floor(rnd() * h)
      const len = 20 + rnd() * 180
      ctx.fillStyle = `rgba(0,0,0,${0.10 + rnd() * 0.16})`
      ctx.fillRect(rnd() * w, y, len, 1)
    }

    // Mottling, so it is not just stripes.
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.14})`
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2)
    }

    // Girth welds. Two soft bands rather than a hard line — a seam on a wet
    // pipe is a change in the surface, not a drawn rule.
    for (const cx of [w * 0.5]) {
      const band = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0)
      band.addColorStop(0, 'rgba(0,0,0,0)')
      band.addColorStop(0.5, 'rgba(0,0,0,0.42)')
      band.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = band
      ctx.fillRect(cx - 6, 0, 12, h)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    // Along the pipe only. Repeating around the circumference would tile the
    // seam into a ring of seams.
    texture.repeat.set(7, 1)
    texture.anisotropy = 4
    return texture
  }, [])
}

function Pipe({ light }: { light: boolean }) {
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(PIPE.radius, PIPE.radius, PIPE.draw, 64, 1, true)
    g.rotateZ(Math.PI / 2)
    return g
  }, [])

  const texture = usePipeTexture()

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => texture?.dispose(), [texture])

  const body = light ? COLOUR.pipe.light : COLOUR.pipe.dark

  return (
    <group>
      {/* fog={false}: haze is a depth cue, and there is no depth being
          described here — it would only wash the ends of a flat shape.

          Front faces only. The cylinder is open-ended, so drawing its back
          wall meant looking straight through the pipe at its own far side.
          Nothing here is ever seen from inside. */}
      <mesh geometry={geometry}>
        <meshBasicMaterial color={body} map={texture} side={THREE.FrontSide} fog={false} />
      </mesh>
    </group>
  )
}

/* -------------------------------------------------------------------- rov */

/** The parts of the machine you can see from outside. Everything else —
 *  boards, battery, wiring, fasteners — is sealed inside the hull, which
 *  makes it free to leave out: two thirds of the model's triangles never
 *  enter this scene. */
const EXTERNAL: { id: string; material: { color: string; metal: number; rough: number } }[] =
  parts.filter((part) => ['shell', 'thrusters', 'props', 'sensor', 'lens'].includes(part.id))

/**
 * The real CAD, working.
 *
 * Same GLB as the hero — already parsed and cached by the loader. The motion
 * is a job, not a transit: the path dwells over each live defect, the hull
 * dips toward the pipe to inspect, pitches with its own way through the
 * water, and carries a work light that plays across the surface beneath it.
 */
function MissionRov({ light }: { light: boolean }) {
  const { scene } = useGLTF(GLB_URL, DRACO_PATH)
  const group = useRef<THREE.Group>(null)
  const lamp = useRef<THREE.PointLight>(null)
  const dip = useRef(0)

  const geometries = useMemo(() => {
    scene.updateMatrixWorld(true)

    const found = new Map<string, THREE.BufferGeometry>()
    const bounds = new THREE.Box3()
    const wanted = new Set(EXTERNAL.map((part) => part.id))

    /*
     * Walked, not looked up by name.
     *
     * getObjectByName(id) worked while the encoder put the part name on the
     * mesh itself. The current one names a parent and hangs an unnamed mesh
     * off it, so every lookup returned a Group with no geometry, every part
     * was skipped, and the machine quietly vanished from the band — no error,
     * just an empty pipe. Matching on the nearest named ancestor is how the
     * hero has always done it and does not care which way round they sit.
     */
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      const id = partIdFor(mesh)
      if (!id || !wanted.has(id) || found.has(id)) return

      const geometry = mesh.geometry.clone()
      // Same reason as the hero: quantised integer attributes cannot be run
      // through applyMatrix4 as they arrive. See unpack.
      unpack(geometry)
      geometry.applyMatrix4(mesh.matrixWorld)
      // Fusion is Z-up, three.js is Y-up — same bake as the hero.
      geometry.rotateX(-Math.PI / 2)
      geometry.computeBoundingBox()
      if (geometry.boundingBox) bounds.union(geometry.boundingBox)
      found.set(id, geometry)
    })

    // Centre the assembly and size it to the pipe: hull length ≈ 2.4 units
    // against a pipe of radius 1 — believable for a 425 mm machine on a
    // large-bore main, and small enough to stay clear of the overlays.
    const size = new THREE.Vector3()
    const centre = new THREE.Vector3()
    bounds.getSize(size)
    bounds.getCenter(centre)
    const scale = size.x > 0 ? 2.4 / size.x : 1

    for (const geometry of Array.from(found.values())) {
      geometry.translate(-centre.x, -centre.y, -centre.z)
      geometry.scale(scale, scale, scale)
    }

    return found
  }, [scene])

  useEffect(
    () => () => Array.from(geometries.values()).forEach((g) => g.dispose()),
    [geometries],
  )

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime()
    const t = timeOf(elapsed)
    const cycle = cycleOf(elapsed)
    const node = group.current
    if (!node) return

    const x = rovX(t, cycle)
    // One number now drives the whole stop: how far into a sweep it is. It
    // settles the machine toward the pipe, brightens the lamp and opens the
    // scan ring, so all three move together instead of each testing the clock.
    const sweep = scanStrength(t)
    const speed = rovSpeed(t, cycle)

    /*
     * The machine rides the same band as the pipe, but is not squashed by it:
     * `span` moves it along the squeezed stretch while its own size stays
     * uniform, and `thin` sets how far above the pipe "just above" is.
     */
    node.position.x = x * view.span
    node.scale.setScalar(view.thin * 1.7)

    // Settling toward the pipe over a defect, damped so arrivals read as a
    // deliberate descent rather than a bounce.
    dip.current = THREE.MathUtils.damp(dip.current, sweep * 0.28, 3.5, delta)
    const hover =
      1.62 - dip.current + Math.sin(elapsed * 0.9) * 0.05 + Math.sin(elapsed * 2.3) * 0.015
    node.position.y = hover * view.thin
    node.position.z = 0.35 * view.thin

    // Bank into the turn rather than snapping around.
    const heading = rovHeading(t, cycle)
    node.rotation.y = THREE.MathUtils.damp(node.rotation.y, heading > 0 ? 0 : Math.PI, 3, delta)
    // Pitch with the work: nose-down under way, level in the hover.
    node.rotation.z = Math.sin(elapsed * 0.7) * 0.025 - heading * 0.09 * speed
    node.rotation.x = Math.sin(elapsed * 0.5) * 0.02

    // The work light brightens as it settles over a defect.
    if (lamp.current) {
      const wanted = 0.22 + 1.9 * sweep
      lamp.current.intensity = THREE.MathUtils.damp(
        lamp.current.intensity,
        light ? wanted * 0.45 : wanted,
        4,
        delta,
      )
      /*
       * A light's radius is world-space and is not scaled by its parents, so
       * shrinking the scene into the band left a lamp reaching seven units
       * across a pipe a fifth of a unit thick — one blown pool of light with
       * no falloff visible in it. Scaled by hand to keep the proportion the
       * scene was lit at.
       */
      lamp.current.distance = 7 * view.thin
    }
  })

  return (
    <group ref={group}>
      {EXTERNAL.map(({ id, material }) => {
        const geometry = geometries.get(id)
        if (!geometry) return null
        return (
          <mesh key={id} geometry={geometry}>
            <meshStandardMaterial
              color={material.color}
              metalness={material.metal}
              roughness={material.rough}
              envMapIntensity={0.7}
            />
          </mesh>
        )
      })}

      {/* Work light, warm against the cool water. */}
      <pointLight
        ref={lamp}
        position={[0.35, -0.4, 0.5]}
        color="#ffd9a3"
        intensity={0.35}
        distance={7}
        decay={2}
      />
    </group>
  )
}

/* ------------------------------------------------------------- scan ring */

/** A band of light around the pipe, tracking the machine. The read-head. */
function ScanRing({ trace }: { trace: string }) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime()
    const t = timeOf(elapsed)
    const node = ref.current
    if (!node) return
    node.position.x = rovX(t, cycleOf(elapsed))
    const material = node.material as THREE.MeshBasicMaterial
    const on = scanStrength(t) * 0.85
    material.opacity = THREE.MathUtils.damp(material.opacity, on, 5, delta)
    node.scale.setScalar(1 + Math.sin(elapsed * 6) * 0.012)
  })

  return (
    <mesh ref={ref} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[PIPE.radius * 1.03, 0.016, 8, 64]} />
      <meshBasicMaterial color={trace} transparent opacity={0} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ motes */

/** Suspended sediment. Sells "underwater" without a single bubble sprite. */
/* ------------------------------------------------------------------ scene */

export function MissionScene() {
  const theme = useTheme()
  const light = theme === 'light'
  const trace = light ? TRACE.light : TRACE.dark
  const water = light ? WATER.light : WATER.dark
  const band = useRef<THREE.Group>(null)

  // The camera works out how the scene has to sit in the band; applying it is
  // one group scale. Y and Z thin the pipe, X squeezes the working stretch
  // into whatever length is actually on screen.
  useFrame(() => {
    if (band.current) band.current.scale.set(view.span, view.thin, view.thin)
  })

  return (
    <>
      {/*
        The machine is the only lit thing down here now — the pipe under it is
        drawn flat — so this rig exists to model one small white object well,
        not to describe a cylinder. Key from above and slightly front, a cool
        fill opposite to keep its shaded side from going to a silhouette.
      */}
      <ambientLight intensity={light ? 0.75 : 0.5} color="#9fb0a4" />
      <directionalLight position={[2, 9, 7]} intensity={light ? 2.2 : 2.9} color="#f2efe1" />
      <directionalLight position={[-4, -2, 4]} intensity={0.55} color="#61707a" />
      {/* Range is re-derived from the camera distance each frame (see FitPipe).
          The pipe opts out of it — see Pipe — so this now only softens the
          machine as it works toward the far end of its run. */}
      <fog attach="fog" args={[water, 18, 46]} />

      <group ref={band}>
        <Pipe light={light} />
        <ScanRing trace={trace} />
      </group>
      <Suspense fallback={null}>
        <MissionRov light={light} />
      </Suspense>
    </>
  )
}

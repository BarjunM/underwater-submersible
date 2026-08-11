'use client'

/**
 * The machine.
 *
 * Two sources behind one interface:
 *   - /models/rov-outer.glb if it exists (the real CAD, converted), with
 *     /models/rov-inner.glb following once the machine is opened up
 *   - otherwise a procedural stand-in with the same named parts
 *
 * Availability is probed with a HEAD request at mount, so converting the CAD
 * swaps the real model in without a code change.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { parts, STACK } from '@/lib/content'
import { EDGE_OPACITY, polylines, Surface } from './Surface'
import { EDGE_THRESHOLD, preloadEdges, useFeatureEdges } from './edges'
import { useTheme } from '@/lib/theme'
import {
  buildBattery,
  buildCompute,
  buildFasteners,
  buildSensor,
  buildShell,
  buildThrusters,
  buildTube,
} from './proceduralRov'

/*
 * The machine arrives in two pieces.
 *
 * Two thirds of the assembly's triangles are inside the shell — the boards,
 * the loom, seventy-three fasteners — and none of it is on screen until
 * someone opens the machine up. Loading it before the first frame cost 1.8MB
 * and most of the decode for something nobody was looking at yet.
 *
 * So the outer file is the one on the critical path, and the interior is
 * fetched during the first idle moment after it and only *drawn* once the
 * disassembly actually starts. By the time the shell opens it is normally
 * already there.
 */
export const GLB_URL = '/models/rov-outer.glb'
export const INNER_URL = '/models/rov-inner.glb'

/** Which parts live in which file — must match SHELLS in convert-model.mjs. */
export const INNER_PARTS = new Set([
  'screws',
  'compute',
  'autopilot',
  'wiring',
  'package',
  'battery',
  'foam',
])

/**
 * The converted model is Draco-compressed, so it needs a decoder. Self-hosted
 * from /public/draco rather than pulled off Google's CDN — no third-party
 * request, and it still works offline.
 */
export const DRACO_PATH = '/draco/'

/**
 * Above this, extracting feature edges costs more than it returns: the parts
 * that dense are wiring and fasteners, whose edges read as noise anyway.
 */
const EDGE_BUDGET = 120_000

type PartsProps = {
  explode: React.MutableRefObject<number>
  /** Parts the viewer has switched off, so the shell can be stripped away. */
  hidden?: ReadonlySet<string>
  /** True while the viewer is dragging the model. */
  steering?: React.MutableRefObject<boolean>
  /** The part currently under the pointer — here or in the assembly list. */
  hotPart?: string | null
  onHoverPart?: (id: string | null) => void
  onSelectPart?: (id: string) => void
}

/**
 * The two parts that come off.
 *
 * Fourteen parts flying apart at once was a diagram of an assembly, not a
 * machine anyone could read: everything moved, so nothing was legible, and
 * the interior had to be present from the first frame to take part in it.
 * Now the hull frame lifts and the chassis follows it partway, and what that
 * uncovers stays exactly where it sits — which is both easier to follow and
 * the reason the interior does not have to be loaded to begin with.
 *
 * Every part is still named on hover and still isolates on click. Only the
 * motion is restricted.
 */
const MOVERS = new Set(['shell', 'tube'])

const VECTORS = parts.map((part) =>
  MOVERS.has(part.id)
    ? new THREE.Vector3(...part.dir).normalize().multiplyScalar(part.dist)
    : new THREE.Vector3(),
)

/**
 * Start fetching the moment this chunk evaluates, rather than waiting for
 * React to mount, the HEAD probe below to answer, and only then asking for the
 * model. That chain used to cost most of a second of dead time before a single
 * byte of the machine was requested.
 */
useGLTF.preload(GLB_URL, DRACO_PATH)
preloadEdges()

/* ------------------------------------------------------------------- axis */

/**
 * The dashed centreline every exploded diagram has: it says the parts came off
 * a single axis and shows where they go back. Drawn as discrete segments
 * rather than a dashed material, which needs line distances and behaves
 * inconsistently across drivers.
 */
export function Axis({
  explode,
  ink = '#f2efe1',
}: {
  explode: React.MutableRefObject<number>
  /** Diagram-line colour — bone on the negative, ink on the print. */
  ink?: string
}) {
  const material = useRef<THREE.LineBasicMaterial>(null)

  const geometry = useMemo(() => {
    const dash = 0.13
    const gap = 0.11
    const paths: THREE.Vector3[][] = []
    for (let y = STACK.bottom - 0.7; y < STACK.top + 0.9; y += dash + gap) {
      paths.push([new THREE.Vector3(0, y, 0), new THREE.Vector3(0, y + dash, 0)])
    }
    return polylines(paths)
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    if (material.current) {
      material.current.opacity = THREE.MathUtils.clamp(explode.current * 0.6 - 0.1, 0, 0.32)
    }
  })

  return (
    <lineSegments geometry={geometry} renderOrder={-1}>
      <lineBasicMaterial ref={material} color={ink} transparent opacity={0} />
    </lineSegments>
  )
}

/* ------------------------------------------------------------------- part */

/**
 * Moves one part along its explode vector.
 *
 * No label here: anything anchored to a part draws on top of the machine, and
 * the assembly list beside the canvas already names all thirteen.
 */
function Part({
  index,
  explode,
  steering,
  onHover,
  onSelect,
  children,
}: {
  index: number
  explode: React.MutableRefObject<number>
  steering?: React.MutableRefObject<boolean>
  onHover?: (id: string | null) => void
  onSelect?: (id: string) => void
  children: React.ReactNode
}) {
  const group = useRef<THREE.Group>(null)
  const target = useMemo(() => new THREE.Vector3(), [])
  const offset = VECTORS[index]
  const part = parts[index]

  // Later parts start moving slightly after earlier ones, so the machine
  // unpacks in sequence instead of bursting apart at once. Expressed as a
  // fraction of the run so it holds however many parts the assembly has.
  const stagger = (index / parts.length) * 0.45

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return

    const local = THREE.MathUtils.clamp((explode.current - stagger) / (1 - stagger), 0, 1)
    const eased = local * local * (3 - 2 * local)
    target.copy(offset).multiplyScalar(eased)

    node.position.x = THREE.MathUtils.damp(node.position.x, target.x, 4.5, delta)
    node.position.y = THREE.MathUtils.damp(node.position.y, target.y, 4.5, delta)
    node.position.z = THREE.MathUtils.damp(node.position.z, target.z, 4.5, delta)
  })

  return (
    <group
      ref={group}
      // The machine itself is the richest interaction surface on the page:
      // hovering names a part, clicking isolates it, same as the list. Hover
      // is suppressed mid-orbit — parts sweeping under a dragging pointer
      // would strobe the highlight — and a click only counts if the pointer
      // barely moved, so ending a drag never toggles a part.
      onPointerOver={(e) => {
        if (steering?.current) return
        e.stopPropagation()
        onHover?.(part.id)
      }}
      onPointerOut={() => onHover?.(null)}
      onClick={(e) => {
        if (e.delta > 6) return
        e.stopPropagation()
        onSelect?.(part.id)
      }}
    >
      {children}
    </group>
  )
}

/* ------------------------------------------------------------- procedural */

/**
 * Stand-in geometry, keyed by part id — the ids must match `parts` in
 * lib/content.ts or the stand-in silently renders nothing for that row. It
 * covers the seven parts that have a primitive worth building; the foam, the
 * loose wiring and the small boards do not. Only ever seen if the converted
 * CAD is missing.
 */
function ProceduralRov({ explode, hidden, steering, hotPart, onHoverPart, onSelectPart }: PartsProps) {
  // Read once here rather than in every Surface: there are fourteen of them.
  const edgeOpacity = EDGE_OPACITY[useTheme()]
  const built = useMemo(() => {
    const solids = {
      shell: buildShell(),
      thrusters: buildThrusters(),
      tube: buildTube(),
      compute: buildCompute(),
      battery: buildBattery(),
      sensor: buildSensor(),
      screws: buildFasteners(),
    }
    // Derived inline, unlike the real CAD: these are a handful of primitives,
    // not a tessellated assembly, so the cost is microseconds.
    const edges = new Map<string, THREE.BufferGeometry>()
    for (const [id, part] of Object.entries(solids)) {
      edges.set(id, new THREE.EdgesGeometry(part.solid, EDGE_THRESHOLD))
    }
    return { solids, edges }
  }, [])

  useEffect(
    () => () => {
      Object.values(built.solids).forEach((part) => {
        part.solid.dispose()
        if ('lines' in part) part.lines.dispose()
      })
      built.edges.forEach((edge) => edge.dispose())
    },
    [built],
  )

  return (
    <>
      {parts.map((part, i) => {
        const id = part.id as keyof typeof built.solids
        const geometry = built.solids[id]
        if (!geometry || hidden?.has(part.id)) return null
        return (
          <Part
            key={part.id}
            index={i}
            explode={explode}
            steering={steering}
            onHover={onHoverPart}
            onSelect={onSelectPart}
          >
            <Surface
              geometry={geometry.solid}
              material={part.material}
              edges={built.edges.get(id) ?? null}
              hot={hotPart === part.id}
              edgeOpacity={edgeOpacity}
            />
          </Part>
        )
      })}
    </>
  )
}

/* --------------------------------------------------------------- real CAD */

function partIdFor(object: THREE.Object3D): string | null {
  let node: THREE.Object3D | null = object
  while (node) {
    const name = node.name.toLowerCase()
    for (const part of parts) {
      if (name.includes(part.id)) return part.id
    }
    node = node.parent
  }
  return null
}

/**
 * How the raw CAD volume is mapped into the working volume the camera and the
 * explode offsets assume.
 *
 * Derived from the outer file and then *reused verbatim* for the interior.
 * Deriving it a second time from the interior's own bounds would fit the
 * boards to the same 5.6 units the whole machine occupies, and they would
 * arrive several times life size and off centre.
 */
type Frame = { centre: THREE.Vector3; scale: number }

function bakeParts(scene: THREE.Object3D, fixed?: Frame) {
  return (() => {
    const buckets = new Map<string, THREE.BufferGeometry[]>()
    scene.updateMatrixWorld(true)

    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      // Unmatched geometry joins the shell rather than being dropped.
      const id = partIdFor(mesh) ?? 'shell'

      // Kept indexed: Draco delivers shared-vertex meshes, and flattening
      // them to triangle soup (toNonIndexed) tripled the vertex work the GPU
      // does every frame for zero visual difference.
      const world = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
      // Shaded rendering needs normals; CAD exports carry them, but compute
      // them per-face if a mesh arrives without.
      if (!world.getAttribute('normal')) world.computeVertexNormals()

      const trimmed = new THREE.BufferGeometry()
      trimmed.setAttribute('position', world.getAttribute('position'))
      trimmed.setAttribute('normal', world.getAttribute('normal'))
      if (world.index) {
        trimmed.setIndex(world.index)
      } else {
        // mergeGeometries refuses mixed indexed/non-indexed input, so give a
        // stray unindexed mesh a trivial index rather than flattening the rest.
        const count = world.getAttribute('position').count
        const index = new Uint32Array(count)
        for (let i = 0; i < count; i++) index[i] = i
        trimmed.setIndex(new THREE.BufferAttribute(index, 1))
      }

      buckets.set(id, [...(buckets.get(id) ?? []), trimmed])
    })

    const merged = new Map<string, THREE.BufferGeometry>()
    const bounds = new THREE.Box3()

    for (const [id, list] of Array.from(buckets.entries())) {
      const geometry = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      if (!geometry) continue
      // Fusion works Z-up, three.js is Y-up. Without this the machine lies on
      // its side and the explode axis runs through its width instead of its
      // height. Baked in so the Part offsets stay world-space.
      geometry.rotateX(-Math.PI / 2)
      geometry.computeBoundingBox()
      if (geometry.boundingBox) bounds.union(geometry.boundingBox)
      merged.set(id, geometry)
    }

    // Normalise into the working volume the camera and explode offsets assume,
    // whatever units the CAD was exported in. Measured from the outer file and
    // handed to the interior, never measured twice — see Frame.
    const size = new THREE.Vector3()
    const measured = new THREE.Vector3()
    bounds.getSize(size)
    bounds.getCenter(measured)
    const frame: Frame =
      fixed ?? { centre: measured, scale: size.length() > 0 ? 5.6 / size.length() : 1 }
    const { centre, scale } = frame

    for (const geometry of Array.from(merged.values())) {
      geometry.translate(-centre.x, -centre.y, -centre.z)
      geometry.scale(scale, scale, scale)
    }

    // The same journey as one matrix — raw CAD space to the space the solids
    // now occupy — so the baked feature edges can be brought along with them.
    // Read right to left: stand the model up, centre it, then scale it.
    const normalise = new THREE.Matrix4()
      .makeScale(scale, scale, scale)
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))

    return { geometries: merged, normalise, frame }
  })()
}

/**
 * Draws whichever parts it has been handed. Both files render through this,
 * so a part behaves identically whether it came from the outer file or the
 * interior — same hover, same isolate, same edges.
 */
function PartSet({
  geometries,
  normalise,
  explode,
  hidden,
  steering,
  hotPart,
  onHoverPart,
  onSelectPart,
}: PartsProps & { geometries: Map<string, THREE.BufferGeometry>; normalise: THREE.Matrix4 }) {
  const edgeOpacity = EDGE_OPACITY[useTheme()]

  useEffect(
    () => () => Array.from(geometries.values()).forEach((g) => g.dispose()),
    [geometries],
  )

  // Baked at build time, loaded alongside the model; derived here only if that
  // bake is missing or stale, and even then a part at a time between frames.
  const edges = useFeatureEdges(geometries, normalise, EDGE_BUDGET)

  // Debug aid: ?only=shell,thrusters isolates parts when diagnosing the model.
  // Read once — the query string cannot change without a navigation, and this
  // sits in a component that re-renders on every hover.
  const only = useMemo(
    () =>
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('only')?.split(',')
        : null,
    [],
  )

  return (
    <>
      {parts.map((part, i) => {
        const geometry = geometries.get(part.id)
        if (!geometry || hidden?.has(part.id)) return null
        if (only && !only.includes(part.id)) return null
        return (
          <Part
            key={part.id}
            index={i}
            explode={explode}
            steering={steering}
            onHover={onHoverPart}
            onSelect={onSelectPart}
          >
            <Surface
              geometry={geometry}
              material={part.material}
              edges={edges.get(part.id) ?? null}
              hot={hotPart === part.id}
              edgeOpacity={edgeOpacity}
            />
          </Part>
        )
      })}
    </>
  )
}

/**
 * The interior. Suspends on its own file, inside its own boundary, so nothing
 * it does can un-render the machine that is already on screen.
 */
function InnerRov({ frame, ...rest }: PartsProps & { frame: Frame }) {
  const { scene } = useGLTF(INNER_URL, DRACO_PATH)
  const { geometries, normalise } = useMemo(() => bakeParts(scene, frame), [scene, frame])
  return <PartSet {...rest} geometries={geometries} normalise={normalise} />
}

function GlbRov(props: PartsProps) {
  const { scene } = useGLTF(GLB_URL, DRACO_PATH)
  const { geometries, normalise, frame } = useMemo(() => bakeParts(scene), [scene])

  /*
   * The interior is fetched as soon as the browser is idle after the outer
   * model is up, and drawn the moment the machine starts coming apart. The
   * two are deliberately separate: waiting for the open to *start* the fetch
   * would put 1.8MB between the user's drag and anything happening.
   */
  const [openedUp, setOpenedUp] = useState(false)

  useEffect(() => {
    const fetchInterior = () => useGLTF.preload(INNER_URL, DRACO_PATH)
    // Safari has no requestIdleCallback; a short timer is close enough, since
    // all this decides is how long after first paint the fetch starts.
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(fetchInterior)
      return () => window.cancelIdleCallback(handle)
    }
    const handle = window.setTimeout(fetchInterior, 300)
    return () => window.clearTimeout(handle)
  }, [])

  /*
   * Isolating a board from the assembly list is the other way in, and it does
   * not touch the explode at all — without this, clicking D-12 on a closed
   * machine hides everything else to reveal a part that was never loaded, and
   * the viewer goes empty.
   */
  const wantsInterior =
    (props.hidden?.size ?? 0) > 0 || (props.hotPart != null && INNER_PARTS.has(props.hotPart))

  useEffect(() => {
    if (wantsInterior) setOpenedUp(true)
  }, [wantsInterior])

  // A ref cannot be watched, so the frame loop raises the flag once — and
  // never lowers it, because unloading the interior when the shell shuts
  // would mean paying for it again on the next open.
  useFrame(() => {
    if (!openedUp && props.explode.current > 0.005) setOpenedUp(true)
  })

  return (
    <>
      <PartSet {...props} geometries={geometries} normalise={normalise} />
      {openedUp && (
        <Suspense fallback={null}>
          <InnerRov {...props} frame={frame} />
        </Suspense>
      )}
    </>
  )
}

/* ----------------------------------------------------------------- export */

export function RovModel({ explode, hidden, steering, hotPart, onHoverPart, onSelectPart }: PartsProps) {
  const [hasGlb, setHasGlb] = useState(false)
  const root = useRef<THREE.Group>(null)

  useEffect(() => {
    let cancelled = false
    fetch(GLB_URL, { method: 'HEAD' })
      .then((response) => {
        if (!cancelled && response.ok) setHasGlb(true)
      })
      .catch(() => {
        /* not converted yet — the procedural model stands in */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Neutral buoyancy: the machine hangs and breathes rather than sitting on a
  // turntable — one detail that says "underwater" without a single bubble.
  //
  // It stands down for two reasons: as the machine comes apart, so the diagram
  // holds still to read; and while the viewer is dragging, because a model
  // that keeps drifting under the hand feels broken rather than alive.
  const drift = useRef(1)
  useFrame(({ clock }, delta) => {
    const node = root.current
    if (!node) return
    const t = clock.getElapsedTime()
    const wanted = steering?.current ? 0 : 1 - explode.current * 0.82
    drift.current = THREE.MathUtils.damp(drift.current, wanted, 4, delta)
    const calm = drift.current

    node.position.y = Math.sin(t * 0.5) * 0.09 * calm
    node.rotation.z = Math.sin(t * 0.34) * 0.016 * calm
    // Turned so the hull's long axis runs across the screen rather than into
    // it — at the default camera angle this is where the machine is least
    // foreshortened and reads as the teardrop it is.
    node.rotation.y = 0.62 + Math.sin(t * 0.22) * 0.09 * calm
  })

  return (
    <group ref={root}>
      {hasGlb ? (
        <Suspense fallback={<ProceduralRov explode={explode} hidden={hidden} />}>
          <GlbRov
            explode={explode}
            hidden={hidden}
            steering={steering}
            hotPart={hotPart}
            onHoverPart={onHoverPart}
            onSelectPart={onSelectPart}
          />
        </Suspense>
      ) : (
        <ProceduralRov
          explode={explode}
          hidden={hidden}
          steering={steering}
          hotPart={hotPart}
          onHoverPart={onHoverPart}
          onSelectPart={onSelectPart}
        />
      )}
    </group>
  )
}

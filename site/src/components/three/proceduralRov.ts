/**
 * Procedural stand-in for the real CAD model.
 *
 * Proportioned from the Fusion 360 screenshots: flattened teardrop shell,
 * six vectored thrusters, an axial electronics tube carrying compute and a
 * battery, and a nose-mounted pressure sensor.
 *
 * Part ids match `parts` in lib/content.ts, so the real GLB drops into the
 * same slots without touching the exploded-view choreography.
 *
 * Axes: +X forward (nose), +Y up, +Z starboard.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { polylines, ringAtX } from './Surface'

/** Hull half-section: [radius, axial] from tail to nose. */
const HULL_PROFILE: [number, number][] = [
  [0.02, -2.2],
  [0.26, -2.05],
  [0.46, -1.8],
  [0.62, -1.45],
  [0.75, -1.0],
  [0.84, -0.45],
  [0.89, 0.15],
  [0.9, 0.7],
  [0.86, 1.25],
  [0.76, 1.65],
  [0.58, 1.95],
  [0.33, 2.13],
  [0.02, 2.2],
]

/** Flattens the lathe into the wide, low teardrop of the real shell. */
export const HULL_SQUASH = new THREE.Vector3(1, 0.86, 1.22)

function hullRadiusAt(x: number): number {
  const p = HULL_PROFILE
  if (x <= p[0][1]) return p[0][0]
  if (x >= p[p.length - 1][1]) return p[p.length - 1][0]
  for (let i = 0; i < p.length - 1; i++) {
    const [r0, x0] = p[i]
    const [r1, x1] = p[i + 1]
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0)
      return r0 + (r1 - r0) * t
    }
  }
  return 0
}

/** Axis-aligned cylinder helper. `axis` is the direction the length runs. */
function cylinder(
  radiusTop: number,
  radiusBottom: number,
  length: number,
  segments: number,
  axis: 'x' | 'y' | 'z',
  position: [number, number, number],
  openEnded = false,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments, 1, openEnded)
  if (axis === 'x') g.rotateZ(-Math.PI / 2)
  if (axis === 'z') g.rotateX(Math.PI / 2)
  g.translate(...position)
  return g
}

function box(
  size: [number, number, number],
  position: [number, number, number],
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(...size)
  g.translate(...position)
  return g
}

/* ------------------------------------------------------------------ shell */

export function buildShell() {
  const points = HULL_PROFILE.map(([r, y]) => new THREE.Vector2(r, y))
  const solid = new THREE.LatheGeometry(points, 40)
  solid.rotateZ(-Math.PI / 2)
  solid.scale(HULL_SQUASH.x, HULL_SQUASH.y, HULL_SQUASH.z)

  // Station rings and cardinal profile curves — how a hull is actually drawn.
  // Kept sparse on purpose: enough lines to describe the surface, few enough
  // that it still reads as a drawing rather than a wireframe.
  const stations = [-1.75, -1.05, -0.25, 0.55, 1.25, 1.8]
  const paths: THREE.Vector3[][] = stations.map((x) =>
    ringAtX(x, hullRadiusAt(x), 40).map(
      (v) => new THREE.Vector3(v.x, v.y * HULL_SQUASH.y, v.z * HULL_SQUASH.z),
    ),
  )

  // On the cardinal axes these trace the true silhouette in plan and
  // elevation. Off-axis they would just look like barrel staves.
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const path: THREE.Vector3[] = []
    for (let x = -2.2; x <= 2.2; x += 0.055) {
      const r = hullRadiusAt(x)
      path.push(
        new THREE.Vector3(
          x,
          Math.cos(angle) * r * HULL_SQUASH.y,
          Math.sin(angle) * r * HULL_SQUASH.z,
        ),
      )
    }
    paths.push(path)
  }

  return { solid, lines: polylines(paths) }
}

/* --------------------------------------------------------------- thrusters */

type ThrusterPlacement = {
  position: [number, number, number]
  /** Rotation applied after the duct is laid along its default +X axis. */
  rotation: [number, number, number]
}

/** Four vectored in an X, two vertical for heave. */
const THRUSTERS: ThrusterPlacement[] = [
  { position: [1.15, -0.05, 1.02], rotation: [0, -Math.PI / 5, 0] },
  { position: [1.15, -0.05, -1.02], rotation: [0, Math.PI / 5, 0] },
  { position: [-1.25, -0.05, 1.02], rotation: [0, Math.PI / 5, 0] },
  { position: [-1.25, -0.05, -1.02], rotation: [0, -Math.PI / 5, 0] },
  { position: [0.62, 0.82, 0], rotation: [0, 0, Math.PI / 2] },
  { position: [-1.0, 0.82, 0], rotation: [0, 0, Math.PI / 2] },
]

function oneThruster(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  // Duct
  parts.push(cylinder(0.34, 0.34, 0.36, 24, 'x', [0, 0, 0], true))
  // Hub
  parts.push(cylinder(0.13, 0.11, 0.3, 16, 'x', [0.02, 0, 0]))
  // Blades
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.BoxGeometry(0.05, 0.2, 0.012)
    blade.translate(0, 0.21, 0)
    blade.rotateX((i / 3) * Math.PI * 2)
    blade.rotateZ(0.3)
    blade.translate(0.02, 0, 0)
    parts.push(blade)
  }
  // Mounting strut back to the hull
  parts.push(box([0.06, 0.06, 0.34], [-0.05, 0, 0]))
  return parts
}

export function buildThrusters() {
  const all: THREE.BufferGeometry[] = []
  for (const { position, rotation } of THRUSTERS) {
    for (const part of oneThruster()) {
      const g = part.clone()
      g.rotateX(rotation[0])
      g.rotateY(rotation[1])
      g.rotateZ(rotation[2])
      g.translate(...position)
      all.push(g)
    }
  }
  return { solid: mergeGeometries(all, false)! }
}

/* --------------------------------------------------------- pressure vessel */

export function buildTube() {
  const parts = [
    cylinder(0.52, 0.52, 2.7, 32, 'x', [0, -0.02, 0], true),
    cylinder(0.57, 0.57, 0.1, 32, 'x', [1.4, -0.02, 0]),
    cylinder(0.57, 0.57, 0.1, 32, 'x', [-1.4, -0.02, 0]),
    cylinder(0.46, 0.46, 0.06, 24, 'x', [1.28, -0.02, 0]),
    cylinder(0.46, 0.46, 0.06, 24, 'x', [-1.28, -0.02, 0]),
  ]
  return { solid: mergeGeometries(parts, false)! }
}

/* ---------------------------------------------------------------- internals */

export function buildCompute() {
  const parts = [
    // Main board
    box([1.15, 0.045, 0.5], [0.42, 0.2, 0]),
    // Processor
    box([0.22, 0.09, 0.22], [0.62, 0.27, 0]),
    // Header block
    box([0.34, 0.09, 0.1], [0.05, 0.27, 0.14]),
    // Camera module on the forward face
    box([0.16, 0.26, 0.72], [1.42, 0.02, 0]),
    // Stereo lens pair
    cylinder(0.07, 0.07, 0.08, 16, 'x', [1.52, 0.02, 0.24]),
    cylinder(0.07, 0.07, 0.08, 16, 'x', [1.52, 0.02, -0.24]),
    cylinder(0.05, 0.05, 0.08, 16, 'x', [1.52, 0.02, 0]),
  ]
  return { solid: mergeGeometries(parts, false)! }
}

export function buildBattery() {
  const parts = [
    box([1.15, 0.4, 0.66], [-0.42, -0.16, 0]),
    // Cell divisions, drawn as raised ribs
    box([0.02, 0.42, 0.68], [-0.13, -0.16, 0]),
    box([0.02, 0.42, 0.68], [-0.42, -0.16, 0]),
    box([0.02, 0.42, 0.68], [-0.71, -0.16, 0]),
    // Power distribution board
    box([0.5, 0.04, 0.44], [-1.0, 0.12, 0]),
  ]
  return { solid: mergeGeometries(parts, false)! }
}

/* ------------------------------------------------------------------ sensor */

export function buildSensor() {
  const parts = [
    cylinder(0.075, 0.075, 0.38, 16, 'x', [2.32, 0, 0]),
    cylinder(0.2, 0.2, 0.26, 24, 'x', [2.62, 0, 0]),
    cylinder(0.23, 0.23, 0.05, 24, 'x', [2.74, 0, 0]),
    cylinder(0.09, 0.09, 0.09, 16, 'x', [2.79, 0, 0]),
  ]
  return { solid: mergeGeometries(parts, false)! }
}

/* --------------------------------------------------------------- fasteners */

export function buildFasteners() {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [1.46, -1.46]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      parts.push(
        cylinder(0.045, 0.045, 0.18, 10, 'x', [x, Math.cos(a) * 0.44, Math.sin(a) * 0.44]),
      )
      parts.push(
        cylinder(0.075, 0.075, 0.05, 10, 'x', [
          x + (x > 0 ? 0.1 : -0.1),
          Math.cos(a) * 0.44,
          Math.sin(a) * 0.44,
        ]),
      )
    }
  }
  return { solid: mergeGeometries(parts, false)! }
}

'use client'

/**
 * How a part is drawn: a shaded solid in its real material, with dark feature
 * edges over the top — the way the assembly looks in the Fusion viewport.
 *
 * The edges are what stop a dark model on a dark background reading as a
 * silhouette. They are drawn near-black so they disappear against the page and
 * only register where they cross a lit surface, exactly like a CAD viewport.
 */

import * as THREE from 'three'

export const EDGE = '#0a0d11'

export type Material = {
  color: string
  metal: number
  rough: number
}

export function Surface({
  geometry,
  material,
  edges = null,
  hot = false,
}: {
  geometry: THREE.BufferGeometry
  material: Material
  /**
   * Feature-edge geometry, supplied by the caller rather than derived here.
   * Deriving it is expensive enough that it is baked at build time and loaded
   * separately — see three/edges.ts. Null until it arrives, or for parts dense
   * enough that edges would read as noise.
   */
  edges?: THREE.BufferGeometry | null
  /** Under the pointer — lit from within in the accent. */
  hot?: boolean
}) {
  return (
    <>
      {/*
        The solid and its edges never move inside their part — the group above
        them carries the whole explode. Telling three that means it stops
        recomposing two matrices per part per frame, for a transform that is
        the identity and always will be. `matrix-auto-update={false}` needs one
        manual update to take effect, which `onUpdate` does on mount.
      */}
      <mesh
        geometry={geometry}
        castShadow={false}
        receiveShadow={false}
        matrixAutoUpdate={false}
        onUpdate={(self) => self.updateMatrix()}
      >
        <meshStandardMaterial
          color={material.color}
          metalness={material.metal}
          roughness={material.rough}
          envMapIntensity={0.7}
          emissive={hot ? '#4aa6dd' : '#000000'}
          emissiveIntensity={hot ? 0.3 : 0}
        />
      </mesh>
      {edges && (
        <lineSegments
          geometry={edges}
          renderOrder={1}
          matrixAutoUpdate={false}
          onUpdate={(self) => self.updateMatrix()}
        >
          <lineBasicMaterial color={EDGE} transparent opacity={0.55} />
        </lineSegments>
      )}
    </>
  )
}

/** Line-segment geometry from an array of polylines. */
export function polylines(paths: THREE.Vector3[][]): THREE.BufferGeometry {
  const positions: number[] = []
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      positions.push(path[i].x, path[i].y, path[i].z)
      positions.push(path[i + 1].x, path[i + 1].y, path[i + 1].z)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

/** A circle of points on the plane normal to X, at position x. */
export function ringAtX(x: number, radius: number, segments = 48): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    points.push(new THREE.Vector3(x, Math.cos(a) * radius, Math.sin(a) * radius))
  }
  return points
}

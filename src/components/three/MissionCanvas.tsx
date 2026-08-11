'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { useRef, useState } from 'react'
import * as THREE from 'three'
import { clock as sequence } from './mission'
import { MissionScene } from './MissionScene'

/** Viewing direction, normalised at use. Slightly above and off to one side. */
const EYE = new THREE.Vector3(0.08, 0.34, 1).normalize()
const LOOK_AT = new THREE.Vector3(0, 0.15, 0)
const lookAt = new THREE.Vector3()

/**
 * What has to stay in frame: the damaged stretch and the robot working over
 * it — not the whole pipe. A pipeline running off both edges reads as a
 * pipeline.
 *
 * How much of that stretch depends on the shape of the viewport. Demanding the
 * same thirteen metres on a phone pushes the camera back to forty units, where
 * the pipe is a thread and the haze has swallowed it. On a narrow screen we
 * simply watch a shorter run of pipe.
 */
const FRAME_WIDE = { width: 13, height: 7 }
const FRAME_NARROW = { width: 6.5, height: 5.6 }

/**
 * Pulls the camera back far enough to hold the whole pipe, at any aspect.
 *
 * A fixed camera position cannot do this: on a narrow or tall viewport the
 * horizontal field collapses and you end up looking at two metres of a fifteen
 * metre pipe. So solve for the distance that fits both axes and take the
 * larger, then re-place the eye along a fixed viewing direction.
 */
function FitPipe() {
  const { camera, size, scene } = useThree()
  const settled = useRef(false)

  useFrame((state, delta) => {
    const perspective = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)

    // The camera itself is in the water: a slow figure-of-eight drift, frozen
    // whenever the sequence is held (reduced motion, ?hold=).
    const drifting = sequence.hold == null ? 1 : 0
    const e = state.clock.getElapsedTime()
    lookAt.set(
      LOOK_AT.x + Math.sin(e * 0.11) * 0.14 * drifting,
      LOOK_AT.y + Math.sin(e * 0.17) * 0.07 * drifting,
      LOOK_AT.z,
    )
    const halfFov = THREE.MathUtils.degToRad(perspective.fov) / 2

    const wide = THREE.MathUtils.clamp((aspect - 0.65) / 0.85, 0, 1)
    const frameWidth = THREE.MathUtils.lerp(FRAME_NARROW.width, FRAME_WIDE.width, wide)
    const frameHeight = THREE.MathUtils.lerp(FRAME_NARROW.height, FRAME_WIDE.height, wide)

    const forHeight = frameHeight / 2 / Math.tan(halfFov)
    const forWidth = frameWidth / 2 / (Math.tan(halfFov) * aspect)
    const wanted = Math.max(forHeight, forWidth) * 1.06

    const distance = settled.current
      ? THREE.MathUtils.damp(camera.position.length(), wanted, 4, delta)
      : wanted
    settled.current = true

    camera.position.copy(EYE).multiplyScalar(distance).add(lookAt)
    camera.lookAt(lookAt)

    // Haze has to start just in front of the subject and clear well behind it.
    // Anchoring it to the camera distance keeps the far end of the pipe fading
    // into the dark at any viewport — anchor it too near and the fog eats the
    // whole scene instead. The scene comes from useThree, not camera.parent:
    // r3f does not parent the default camera to the scene, so reaching through
    // it silently never updates the fog at all.
    if (scene.fog) {
      const fog = scene.fog as THREE.Fog
      fog.near = distance * 0.9
      fog.far = distance * 1.85
    }
  })

  return null
}

/**
 * Perspective here, unlike the hero.
 *
 * The hero is a drawing of an object and uses parallel projection to stay
 * measurable. This is footage of a job, and a little convergence makes the
 * pipe recede properly into the dark.
 */
export function MissionCanvas({ onPhase }: { onPhase?: (t: number) => void }) {
  // Same policy as the hero: native resolution until the GPU objects, then
  // trade pixels rather than scene.
  const [dpr, setDpr] = useState(() =>
    Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1.5, 1.75),
  )

  return (
    <Canvas
      camera={{ position: [1, 4, 12], fov: 36, near: 0.1, far: 200 }}
      dpr={dpr}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(1, +(d - 0.5).toFixed(2)))}
        // Climbs back too: a single slow patch — a passing GC, a background
        // tab waking — used to cost the rest of the visit at reduced
        // resolution, since nothing ever raised it again.
        onIncline={() =>
          setDpr((d) => Math.min(Math.min(window.devicePixelRatio, 1.75), +(d + 0.25).toFixed(2)))
        }
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      <FitPipe />
      <MissionScene onPhase={onPhase} />
    </Canvas>
  )
}

'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useTheme } from '@/lib/theme'
import { Axis, RovModel } from './RovModel'

/** Native resolution, capped — the ceiling adaptive quality climbs back to. */
const DPR_CAP = () => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1.5, 2)

export type Insets = { left?: number; right?: number; top?: number; bottom?: number }

/**
 * Keeps the machine inside its frame, whatever it is doing.
 *
 * Orthographic zoom is pixels-per-world-unit, so framing is a division rather
 * than a dolly. Rather than guessing a fixed extent, this measures the model's
 * bounding box every frame and projects its corners into camera space — so it
 * adapts as parts separate and as the viewer rotates it, and nothing can slide
 * off the edge. Parallel projection is what keeps the machine reading as a
 * measurable object rather than a photograph of one.
 */
function Frame({
  target,
  insets,
  scale,
  margin = 1.08,
}: {
  target: MutableRefObject<THREE.Group | null>
  /** Screen-space regions the model must keep out of, in CSS pixels. */
  insets?: Insets
  /** The viewer's zoom, multiplied onto the fitted zoom. */
  scale: MutableRefObject<number>
  margin?: number
}) {
  const { camera, size } = useThree()
  const box = useMemo(() => new THREE.Box3(), [])
  const corner = useMemo(() => new THREE.Vector3(), [])
  const settled = useRef(false)
  const lastZoom = useRef(-1)
  const lastOffset = useRef({ x: NaN, y: NaN })

  useFrame((_, delta) => {
    const group = target.current
    if (!group) return

    box.setFromObject(group)
    if (box.isEmpty()) return

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        )
        .applyMatrix4(camera.matrixWorldInverse)
      minX = Math.min(minX, corner.x)
      maxX = Math.max(maxX, corner.x)
      minY = Math.min(minY, corner.y)
      maxY = Math.max(maxY, corner.y)
    }

    const width = (maxX - minX) * margin
    const height = (maxY - minY) * margin
    if (width <= 0 || height <= 0) return

    // Fit into what the interface leaves free, not the whole canvas. The canvas
    // stays full-bleed so the machine still reads as the page, but it is sized
    // and centred inside the clear area so nothing is ever drawn under the
    // chrome laid over it.
    const left = insets?.left ?? 0
    const right = insets?.right ?? 0
    const top = insets?.top ?? 0
    const bottom = insets?.bottom ?? 0
    const availWidth = Math.max(120, size.width - left - right)
    const availHeight = Math.max(120, size.height - top - bottom)

    const wanted = Math.min(availWidth / width, availHeight / height) * scale.current
    camera.zoom = settled.current
      ? THREE.MathUtils.damp(camera.zoom, wanted, 3.2, delta)
      : wanted

    // Shift the projection so the free area's centre, not the canvas centre, is
    // where the machine sits. A positive view offset looks further right/down
    // into the frustum, which moves what you see the other way — hence negated.
    const offsetX = (left - right) / 2
    const offsetY = (top - bottom) / 2
    const offsetChanged = offsetX !== lastOffset.current.x || offsetY !== lastOffset.current.y
    if (offsetChanged) {
      lastOffset.current.x = offsetX
      lastOffset.current.y = offsetY
      if (offsetX || offsetY) {
        camera.setViewOffset(size.width, size.height, -offsetX, -offsetY, size.width, size.height)
      } else if (camera.view?.enabled) {
        camera.clearViewOffset()
      }
    }

    settled.current = true

    /*
     * Only rebuild the projection when it would actually differ.
     *
     * The machine breathes, so the fitted zoom is never perfectly still — but
     * it settles to within a rounding error of its target and then sits there.
     * Recomputing the matrix on every one of those frames re-uploads the
     * camera uniforms for a change too small to see. Below a thousandth of a
     * unit of zoom, leave it alone.
     */
    if (offsetChanged || Math.abs(camera.zoom - lastZoom.current) > 1e-3) {
      lastZoom.current = camera.zoom
      camera.updateProjectionMatrix()
    }
  })

  return null
}

export function RovCanvas({
  explode,
  hidden,
  insets,
  zoom,
  resetSignal = 0,
  hotPart,
  onHoverPart,
  onSelectPart,
  active = true,
}: {
  explode: MutableRefObject<number>
  hidden?: ReadonlySet<string>
  insets?: Insets
  /** Viewer zoom multiplier, 1 = fitted. */
  zoom?: number
  /** Changing this number returns the camera to its default angle. */
  resetSignal?: number
  hotPart?: string | null
  onHoverPart?: (id: string | null) => void
  onSelectPart?: (id: string) => void
  /** False while the section is off screen — the render loop stops dead. */
  active?: boolean
}) {
  const theme = useTheme()
  const model = useRef<THREE.Group>(null)
  const controls = useRef<OrbitControlsImpl>(null)
  const scale = useRef(1)

  // Adaptive quality: render at native resolution, and if the GPU cannot hold
  // frame rate, trade pixels — never geometry. The model stays exactly the
  // model; a struggling machine just gets a slightly softer canvas.
  const [dpr, setDpr] = useState(DPR_CAP)

  /**
   * True while the viewer is dragging. The model's idle drift reads as the
   * machine hanging in water, but it fights the hand that is trying to hold
   * it still — so it stands down for as long as anyone is steering.
   */
  const steering = useRef(false)

  scale.current = zoom ?? 1

  useEffect(() => {
    if (resetSignal > 0) controls.current?.reset()
  }, [resetSignal])

  return (
    <Canvas
      orthographic
      // The camera sits ~12.4 units out and the exploded stack reaches ~11, so
      // this spans the scene with room to orbit and nothing to spare. A loose
      // range here is not free: the depth buffer is shared across it, and at
      // 600 units the machine occupied 1% of it and z-fought with its own
      // internals showing through the shell.
      camera={{ position: [7, 4.6, 9], zoom: 80, near: 0.1, far: 46 }}
      dpr={dpr}
      frameloop={active ? 'always' : 'never'}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(1, +(d - 0.5).toFixed(2)))}
        onIncline={() => setDpr((d) => Math.min(DPR_CAP(), +(d + 0.25).toFixed(2)))}
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      {/*
        Three-point lighting, warm key against cool fill, plus a rim to lift
        the silhouette off a near-black page. No environment map: it would mean
        fetching an HDR from a CDN, and this reads cleanly without one.
      */}
      {/*
        Less fill on the print, not more.
        
        An off-white hull on warm cream is two near-identical values, so what
        separates the machine from the page is its own shading — and lifting
        the ambient was washing exactly that out, leaving the model to dissolve
        into the sheet. On the negative there is no such problem: white on
        near-black separates on value alone, and the fill is free to open the
        shadows up.
      */}
      <ambientLight intensity={theme === 'light' ? 0.32 : 0.55} color="#8fb4d6" />
      <directionalLight position={[6, 9, 7]} intensity={2.6} color="#fff4e2" />
      <directionalLight position={[-7, 3, -5]} intensity={1.1} color="#7fb2e0" />
      <directionalLight position={[-2, -6, 4]} intensity={0.5} color="#a3d5f7" />

      {/* Measured for framing; the centreline sits outside so it can run past
          the machine without dragging the camera back with it. */}
      <group ref={model}>
        <RovModel
          explode={explode}
          hidden={hidden}
          steering={steering}
          hotPart={hotPart}
          onHoverPart={onHoverPart}
          onSelectPart={onSelectPart}
        />
      </group>
      <Axis explode={explode} ink={theme === 'light' ? '#1b1712' : '#f2efe1'} />
      <Frame target={model} insets={insets} scale={scale} />

      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        // Wheel zoom would swallow the page scroll on a full-bleed canvas, so
        // zoom is driven by the on-screen controls instead.
        enableZoom={false}
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.45}
        minPolarAngle={Math.PI * 0.12}
        maxPolarAngle={Math.PI * 0.86}
        onStart={() => {
          steering.current = true
        }}
        onEnd={() => {
          steering.current = false
        }}
      />
    </Canvas>
  )
}

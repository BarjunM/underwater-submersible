'use client'

import dynamic from 'next/dynamic'

/**
 * three.js has no business running during SSR, and the 3D bundle has no
 * business being in the initial payload.
 */
export const RovCanvasLazy = dynamic(
  () => import('./RovCanvas').then((m) => m.RovCanvas),
  { ssr: false, loading: () => null },
)

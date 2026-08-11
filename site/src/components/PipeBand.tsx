'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { clock, STILL_FRAME } from './three/mission'
import styles from './PipeBand.module.css'

const MissionCanvasLazy = dynamic(
  () => import('./three/MissionCanvas').then((m) => m.MissionCanvas),
  { ssr: false, loading: () => null },
)

/**
 * The job, running along the bottom of the page.
 *
 * It used to be a section of its own — a title, a paragraph, a phase track and
 * a pipe filling most of a screen. As a strip under the footer it says the
 * same thing in a tenth of the room: a pipe, defects opening along it, and the
 * machine working its way back and forth sealing them, for as long as anyone
 * is looking.
 *
 * The canvas only exists while the strip is on screen, and the sequence holds
 * on a single frame for anyone who asked for reduced motion — a loop that
 * never ends is exactly what that setting is about.
 */
export function PipeBand() {
  const host = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    // Same debug aid as before: ?hold=0.45 pins the sequence at that moment.
    const held = new URLSearchParams(window.location.search).get('hold')
    if (held !== null && !Number.isNaN(parseFloat(held))) {
      clock.hold = Math.min(1, Math.max(0, parseFloat(held)))
      return
    }

    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      clock.hold = query.matches ? STILL_FRAME : null
    }
    apply()
    query.addEventListener('change', apply)
    return () => {
      query.removeEventListener('change', apply)
      clock.hold = null
    }
  }, [])

  useEffect(() => {
    const element = host.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setLive(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting), {
      rootMargin: '200px 0px',
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={styles.band} ref={host} aria-hidden="true">
      {live && <MissionCanvasLazy />}
    </div>
  )
}

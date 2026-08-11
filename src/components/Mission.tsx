'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { mission } from '@/lib/content'
import { clock, PHASES, phaseAt, STILL_FRAME } from './three/mission'
import styles from './Mission.module.css'

const MissionCanvasLazy = dynamic(
  () => import('./three/MissionCanvas').then((m) => m.MissionCanvas),
  { ssr: false, loading: () => null },
)

export function Mission() {
  const section = useRef<HTMLElement>(null)
  const [live, setLive] = useState(false)
  const [phase, setPhase] = useState(0)
  const [progress, setProgress] = useState(0)

  /**
   * Called on every frame of the sequence, so it compares before it dispatches:
   * the phase changes six times a loop and the bar sixty, against roughly a
   * thousand frames. Stable identity as well as cheap — rebuilding it each
   * render would re-render the canvas underneath it every time the bar moved.
   */
  const shown = useRef({ phase: 0, progress: 0 })
  const onPhase = useCallback((t: number) => {
    const nextPhase = phaseAt(t)
    if (nextPhase !== shown.current.phase) {
      shown.current.phase = nextPhase
      setPhase(nextPhase)
    }
    const nextProgress = Math.round(t * 60) / 60
    if (nextProgress !== shown.current.progress) {
      shown.current.progress = nextProgress
      setProgress(nextProgress)
    }
  }, [])

  // A looping animation is exactly what "reduced motion" is about, so hold the
  // sequence on a single frame instead. The story still lands — the pipe is
  // cracked and every defect is flagged — nothing just moves to tell it.
  useEffect(() => {
    // Debug aid, same family as ?only= on the hero: ?hold=0.45 pins the
    // sequence at that normalised time so any moment can be inspected still.
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

  // Two WebGL canvases running at once is wasteful when only one is on screen,
  // so this one only exists while it is being looked at.
  useEffect(() => {
    const element = section.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setLive(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => setLive(entry.isIntersecting),
      { rootMargin: '160px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <section className={styles.section} ref={section} id="mission">
      <div className={styles.stage}>
        {live && <MissionCanvasLazy onPhase={onPhase} />}
      </div>

      <div className={styles.overlay}>
        <div className={styles.head}>
          <h2 className={styles.title}>{mission.title}</h2>
          <p className={styles.body}>{mission.body}</p>
        </div>

        {/* One line and one rule, where there used to be a six-item list with
            its own ticked track. What the sequence is doing right now is the
            only part of it a reader needs. */}
        <footer className={styles.foot}>
          <p className={styles.phase} aria-live="polite">
            {PHASES[phase].label}
          </p>
          <div className={styles.track} aria-hidden="true">
            <span className={styles.trackFill} style={{ transform: `scaleX(${progress})` }} />
          </div>
        </footer>
      </div>
    </section>
  )
}

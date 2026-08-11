'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parts, site } from '@/lib/content'
import { applyTheme, useTheme } from '@/lib/theme'
import { RovCanvasLazy } from './three/RovCanvasLazy'
import styles from './Console.module.css'

const ZOOM = { min: 0.6, max: 2.6, step: 0.28 }

/** Mirrors the per-part easing in RovModel so the counter matches the model. */
function separatedCount(progress: number) {
  let count = 0
  for (let i = 0; i < parts.length; i++) {
    const stagger = (i / parts.length) * 0.45
    const local = Math.min(1, Math.max(0, (progress - stagger) / (1 - stagger)))
    if (local * local * (3 - 2 * local) > 0.5) count++
  }
  return count
}

export function Console() {
  const theme = useTheme()
  const explode = useRef(0)
  const explodeTarget = useRef(0)
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [scrub, setScrub] = useState(0)
  const [hot, setHot] = useState<string | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [zoom, setZoom] = useState(1)
  const [resetSignal, setResetSignal] = useState(0)

  // The canvas is full-bleed, but the machine must stay clear of the interface
  // drawn over it. Measuring the real elements — rather than hard-coding a
  // guess per breakpoint — keeps that true as the copy, the list, or the font
  // size change.
  const screenRef = useRef<HTMLElement>(null)
  const indexRef = useRef<HTMLElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLElement>(null)
  const topRef = useRef<HTMLElement>(null)
  const [insets, setInsets] = useState({ right: 0, bottom: 0, top: 0, left: 0 })

  // The hero used to render every frame forever — including while the viewer
  // was two sections away watching the mission loop, which meant two full
  // WebGL scenes running at once. Off screen, its render loop now stops dead.
  const [active, setActive] = useState(true)
  useEffect(() => {
    const element = screenRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { rootMargin: '80px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // Derived from where the elements actually are, not from their sizes: the
    // list is right-aligned at every width, so its left edge is what the model
    // has to stay clear of. Positions hold whatever the layout does.
    //
    // Measured against the section, never the viewport. getBoundingClientRect
    // is viewport-relative, so anchoring to the window silently corrupts every
    // inset the moment the page is scrolled even slightly — the top inset goes
    // negative and the machine is fitted to a region that does not exist.
    const measure = () => {
      const host = screenRef.current?.getBoundingClientRect()
      if (!host) return
      const gap = 14
      const rel = (el: HTMLElement | null) => {
        const r = el?.getBoundingClientRect()
        if (!r) return null
        return {
          left: r.left - host.left,
          right: r.right - host.left,
          top: r.top - host.top,
          bottom: r.bottom - host.top,
          width: r.width,
        }
      }

      const index = rel(indexRef.current)
      const viewer = rel(viewerRef.current)
      const bottom = rel(bottomRef.current)
      const top = rel(topRef.current)

      // The list is a column beside the model on wide screens and a wrapping
      // row beneath the header on narrow ones. Rather than duplicating that
      // breakpoint here — where it would silently rot the moment the CSS
      // changed — infer it: a list spanning most of the width is a row, and
      // costs height instead of width.
      const asRow = !!index && index.width > host.width * 0.6
      // Stacked, the instruments sit below the index, so the machine has to
      // clear whichever of the two reaches furthest down.
      const stackedTop = Math.max(index?.bottom ?? 0, viewer?.bottom ?? 0)

      setInsets({
        // Only the real interface constrains the machine now. With the rails
        // gone there is nothing at the edges to clear, so it keeps everything
        // the instruments and the index do not use.
        left: (asRow ? 0 : (viewer?.right ?? 0)) + gap,
        right: (index && !asRow ? host.width - index.left : 0) + gap,
        top: Math.max(0, (asRow ? stackedTop : (top?.bottom ?? 0)) + gap),
        bottom: bottom ? Math.max(0, host.height - bottom.top + gap) : 0,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    ;[screenRef, indexRef, bottomRef, topRef, viewerRef].forEach(
      (r) => r.current && observer.observe(r.current),
    )
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // One loop chasing a retargetable value, so the buttons and the scrub slider
  // drive the same animation without fighting: buttons move the target and let
  // the damp catch up, the slider sets both for a 1:1 feel.
  //
  // It runs only while there is actually a gap to close. It used to run for
  // the life of the page — sixty wake-ups a second, each dispatching two state
  // updates that almost always resolved to no change, continuing while the
  // viewer was three sections away. On a phone that is the kind of idle cost
  // that shows up as battery rather than as jank, which makes it easy to miss.
  const frame = useRef(0)
  const shown = useRef({ count: 0, scrub: 0 })

  const pump = useCallback(() => {
    if (frame.current) return

    const tick = () => {
      const gap = explodeTarget.current - explode.current
      const moving = Math.abs(gap) > 0.0005
      if (moving) {
        explode.current =
          Math.abs(gap) < 0.001 ? explodeTarget.current : explode.current + gap * 0.05
      }

      // Compared before dispatching, not inside the updater: an updater that
      // returns its own argument still costs a render pass to discover that.
      const nextCount = separatedCount(explode.current)
      if (nextCount !== shown.current.count) {
        shown.current.count = nextCount
        setCount(nextCount)
      }
      const nextScrub = Math.round(explode.current * 100)
      if (nextScrub !== shown.current.scrub) {
        shown.current.scrub = nextScrub
        setScrub(nextScrub)
      }

      frame.current = moving ? requestAnimationFrame(tick) : 0
    }

    frame.current = requestAnimationFrame(tick)
  }, [])

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const toggleOpen = useCallback(() => {
    const opening = explodeTarget.current < 0.5
    explodeTarget.current = opening ? 1 : 0
    setOpen(opening)
    pump()
  }, [pump])

  const scrubTo = useCallback(
    (value: number) => {
      explodeTarget.current = value
      explode.current = value
      setOpen(value > 0.5)
      // Reflected immediately rather than waiting for the animation loop, so
      // the thumb never snaps back under the pointer mid-drag.
      shown.current.scrub = Math.round(value * 100)
      setScrub(shown.current.scrub)
      pump()
    },
    [pump],
  )

  const togglePart = useCallback((id: string) => {
    setHidden((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    // Hiding the part under the pointer unmounts its mesh, so no pointer-out
    // ever fires — without this the readout and cursor stay stuck on it.
    setHot((current) => (current === id ? null : current))
  }, [])

  /**
   * Three states of undress, matching the CAD's own reference views: the
   * machine as built, the pressure tube exposed (shell and foam off), and the
   * bare electronics (tube off as well). One button cycles them; individual
   * part toggles still work on top.
   */
  const REVEALS = useMemo(
    () => [
      { label: 'Look inside', hide: [] as string[] },
      { label: 'Strip to core', hide: ['shell', 'foam'] },
      /* The vessel lives in the endcaps group (see lib/content.ts) — hiding
         it opens the housing while the chassis keeps carrying the camera. */
      { label: 'Refit shell', hide: ['shell', 'foam', 'endcaps'] },
    ],
    [],
  )
  const [reveal, setReveal] = useState(0)
  const strippedBack = reveal > 0

  const cycleReveal = useCallback(() => {
    setReveal((current) => {
      const next = (current + 1) % REVEALS.length
      setHidden(new Set(REVEALS[next].hide))
      setHot(null)
      return next
    })
  }, [REVEALS])

  const nudgeZoom = useCallback((by: number) => {
    setZoom((z) => Math.min(ZOOM.max, Math.max(ZOOM.min, +(z + by).toFixed(2))))
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setResetSignal((n) => n + 1)
  }, [])

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'light' ? 'dark' : 'light')
  }, [theme])

  const hotPart = useMemo(() => parts.find((p) => p.id === hot), [hot])

  return (
    <section id="machine" className={styles.screen} ref={screenRef}>
      <div className={styles.stage} style={{ cursor: hot ? 'pointer' : 'crosshair' }}>
        <RovCanvasLazy
          explode={explode}
          hidden={hidden}
          insets={insets}
          zoom={zoom}
          resetSignal={resetSignal}
          hotPart={hot}
          onHoverPart={setHot}
          onSelectPart={togglePart}
          active={active}
        />
      </div>

      <div className={styles.overlay}>
        <header className={`${styles.top} onBar`} ref={topRef}>
          <span className={styles.stripCell}>
            <b className={styles.wordmark}>{site.name}</b>
            <span className={styles.dim}>{site.mark}</span>
          </span>
          <span className={`${styles.stripCell} ${styles.stripEnd}`}>
            <button
              type="button"
              className={styles.mode}
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme'}
              aria-label={theme === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme'}
            >
              <svg className={styles.modeIcon} viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor" />
            </svg>
            </button>
            <span className={styles.counterGroup} aria-live="polite">
              <span className={count > 0 ? styles.live : styles.dim}>
                {String(count).padStart(2, '0')}
              </span>
              <span className={styles.dim}>/ {String(parts.length).padStart(2, '0')} parts</span>
            </span>
          </span>
        </header>

        <div className={styles.middle}>
          {/* Viewer controls, bracketed like a field instrument. */}
          <div className={styles.viewer} ref={viewerRef}>
            {/* The keys and what they read, on one line. They used to be a
                labelled stack — VIEW, then the keys, then the zoom, then
                DISASSEMBLY, then the slider — six blocks down a tall column
                to say three things. */}
            <div className={styles.viewerRow}>
              <div className={styles.viewerBox}>
                <button
                  type="button"
                  className={styles.viewerKey}
                  onClick={() => nudgeZoom(ZOOM.step)}
                  disabled={zoom >= ZOOM.max}
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  className={styles.viewerKey}
                  onClick={() => nudgeZoom(-ZOOM.step)}
                  disabled={zoom <= ZOOM.min}
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  className={`${styles.viewerKey} ${styles.viewerReset}`}
                  onClick={resetView}
                  aria-label="Reset view"
                >
                  ⟲
                </button>
              </div>
              <span className={styles.viewerRead}>{zoom.toFixed(2)}×</span>
            </div>

            <label className={styles.scrub}>
              <span className={styles.viewerLabel}>Disassembly</span>
              <span className={styles.scrubRow}>
                <input
                  className={styles.scrubInput}
                  type="range"
                  min={0}
                  max={100}
                  value={scrub}
                  onChange={(event) => scrubTo(Number(event.target.value) / 100)}
                  aria-label="Disassembly progress"
                />
                <span className={styles.viewerRead}>{scrub}%</span>
              </span>
            </label>

            {/* Names whatever the pointer is over — model or list. Holds its
                line when nothing is, so the column does not jump. */}
            <p className={styles.inspect} aria-live="polite">
              {hotPart ? `${hotPart.code} ${hotPart.name}` : '—'}
            </p>
          </div>

          <section className={styles.index} aria-label="Assembly parts" ref={indexRef}>
            <h2 className={styles.indexTitle}>Assembly index</h2>
            <ul>
              {parts.map((part, i) => {
                const off = hidden.has(part.id)
                const separated = i < count
                return (
                  <li key={part.id}>
                    <button
                      type="button"
                      className={`${styles.part} ${off ? styles.partOff : ''} ${
                        separated ? styles.partOut : ''
                      } ${hot === part.id ? styles.partHot : ''}`}
                      onClick={() => togglePart(part.id)}
                      onMouseEnter={() => setHot(part.id)}
                      onMouseLeave={() => setHot(null)}
                      aria-pressed={!off}
                    >
                      <span
                        className={styles.swatch}
                        style={{ background: off ? 'transparent' : part.material.color }}
                        aria-hidden="true"
                      />
                      <span className={styles.partCode}>{part.code}</span>
                      <span className={styles.partName}>{part.name}</span>
                    </button>
                  </li>
                )
              })}
              <li className={styles.indexHint}>Click to isolate</li>
            </ul>
          </section>
        </div>

        {/* The claim and the paragraph that used to sit here are gone. The
            machine says it better than the copy did, and the foreword has
            already made the case. What is left is the way in. */}
        <footer className={styles.bottom} ref={bottomRef}>
          <div className={styles.copy}>
            <div className={styles.controls}>
              <button
                type="button"
                onClick={toggleOpen}
                className={`${styles.control} ${styles.controlPrimary} ${open ? styles.controlOn : ''}`}
                aria-pressed={open}
              >
                {open ? 'Reassemble' : 'Disassemble'}
              </button>
              <button
                type="button"
                onClick={cycleReveal}
                className={`${styles.control} ${strippedBack ? styles.controlOn : ''}`}
                aria-pressed={strippedBack}
              >
                {REVEALS[reveal].label}
              </button>
            </div>
          </div>
        </footer>

      </div>
    </section>
  )
}

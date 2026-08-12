'use client'

import { useCallback, useState } from 'react'
import { foreword, site, type ForewordPart } from '@/lib/content'
import { figureById } from '@/lib/figures'
import { applyTheme, useTheme } from '@/lib/theme'
import { FigurePeek } from './FigurePeek'
import { Plate } from './Plate'
import styles from './Foreword.module.css'

/**
 * The cover of the document: a short letter in a human voice before the
 * specification begins. It carries the opening sequence — the frame draws
 * itself here now, since this is the first thing anyone sees — and its links
 * scroll down into the machine and the mission.
 */
export function Foreword() {
  const theme = useTheme()
  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'light' ? 'dark' : 'light')
  }, [theme])

  /**
   * The plate a term in the letter is pointing at. One piece of state drives
   * both the callout at the pointer and the plate panel beside the letter, so
   * they can never disagree about which figure is being discussed.
   */
  const [peek, setPeek] = useState<{ id: string; x: number; y: number } | null>(null)
  const peekAt = useCallback((id: string, x: number, y: number) => setPeek({ id, x, y }), [])
  const clearPeek = useCallback(() => setPeek(null), [])

  /**
   * Turns a run of parts into text and marked terms.
   *
   * A marked term is a link, a figure reference, or both. The figure handlers
   * go on either, and are pointer- and focus-driven so a keyboard reader gets
   * the plate too.
   */
  const marked = useCallback(
    (parts: ForewordPart[] | undefined) =>
      (parts ?? []).map((part, j) => {
        if (typeof part === 'string') return part

        const figure = part.fig ? (figureById.get(part.fig) ?? null) : null
        const bind = figure
          ? {
              onPointerEnter: (event: React.PointerEvent) =>
                peekAt(figure.id, event.clientX, event.clientY),
              onPointerLeave: clearPeek,
              onFocus: (event: React.FocusEvent<HTMLElement>) => {
                const rect = event.currentTarget.getBoundingClientRect()
                peekAt(figure.id, rect.right, rect.top + rect.height / 2)
              },
              onBlur: clearPeek,
            }
          : {}

        const className = `${part.href ? styles.link : ''} ${figure ? styles.figRef : ''}`.trim()

        return part.href ? (
          <a key={j} href={part.href} className={className} {...bind}>
            {part.t}
          </a>
        ) : (
          <span key={j} className={className} tabIndex={0} {...bind}>
            {part.t}
          </span>
        )
      }),
    [peekAt, clearPeek],
  )

  return (
    <section className={styles.foreword} data-intro>
      <div className={styles.inner}>
        <header className={styles.head}>
          <span className={styles.lockup}>
            <svg viewBox="0 0 22 22" className={styles.mark} aria-hidden="true">
              <circle cx="11" cy="11" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
              <circle cx="11" cy="11" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
              <path d="M1.8 11h4.2M16 11h4.2" stroke="currentColor" strokeWidth="1.1" />
            </svg>
            <span className={styles.wordmark}>
              {site.name} <span className={styles.markNo}>{site.mark}</span>
            </span>
          </span>

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
        </header>

        <div className={styles.body}>
          <div className={styles.letter}>
            {foreword.map((run, i) => {
              /*
               * A run is a paragraph, a heading, or the numbered journey. All
               * three are built from the same marked-up parts, so `marked`
               * does that work once and only the element around it changes.
               */
              if (run.label) {
                return (
                  <p key={i} className={styles.label}>
                    {run.parts?.map((part) => (typeof part === 'string' ? part : part.t))}
                  </p>
                )
              }

              if (run.steps) {
                return (
                  <ol key={i} className={styles.steps}>
                    {run.steps.map((step, j) => (
                      <li key={j} className={styles.step}>
                        {marked(step)}
                      </li>
                    ))}
                  </ol>
                )
              }

              return (
                <p key={i} className={`${run.lead ? styles.lead : ''} ${run.dim ? styles.dim : ''}`}>
                  {marked(run.parts)}
                </p>
              )
            })}
          </div>

          <div className={styles.plateColumn}>
            <Plate active={peek?.id ?? null} />
          </div>
        </div>

        <footer className={styles.foot}>
          <a href="#machine" className={styles.cue}>
            Scroll
            <span className={styles.cueArrow} aria-hidden="true">
              ↓
            </span>
          </a>
        </footer>
      </div>

      <FigurePeek
        figure={peek ? figureById.get(peek.id) ?? null : null}
        origin={peek ? { x: peek.x, y: peek.y } : null}
      />
    </section>
  )
}

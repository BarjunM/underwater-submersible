'use client'

import { useCallback, useState } from 'react'
import { foreword, site } from '@/lib/content'
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
            title="Switch between negative and print"
          >
            <span className={styles.modeSwatch} aria-hidden="true" />
            {theme === 'light' ? 'Print' : 'Negative'}
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.letter}>
            {foreword.map((paragraph, i) => (
              <p
                key={i}
                className={`${paragraph.lead ? styles.lead : ''} ${paragraph.dim ? styles.dim : ''}`}
              >
                {paragraph.parts.map((part, j) => {
                  if (typeof part === 'string') return part

                  // A marked term is a link, a figure reference, or both. The
                  // figure handlers go on either, and are pointer- and
                  // focus-driven so a keyboard reader gets the plate too.
                  const figure = part.fig ? figureById.get(part.fig) ?? null : null
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

                  const className = `${part.href ? styles.link : ''} ${
                    figure ? styles.figRef : ''
                  }`.trim()

                  return part.href ? (
                    <a key={j} href={part.href} className={className} {...bind}>
                      {part.t}
                    </a>
                  ) : (
                    <span key={j} className={className} tabIndex={0} {...bind}>
                      {part.t}
                    </span>
                  )
                })}
              </p>
            ))}
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

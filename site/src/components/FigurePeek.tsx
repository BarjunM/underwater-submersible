'use client'

import { useEffect, useRef } from 'react'
import type { Figure } from '@/lib/figures'
import styles from './FigurePeek.module.css'

/**
 * The plate a term in the letter is pointing at, raised next to the pointer.
 *
 * A printed document would set a callout in the margin; on screen the margin
 * follows the reader. It takes no pointer events and never moves the text, so
 * it cannot get between anyone and what they were about to click.
 *
 * Hover is not the only way in: the same terms are focusable, and a keyboard
 * reader gets the plate anchored to the term itself. Where there is no hover
 * at all — a phone — this stays hidden, and the plate panel beside the letter
 * carries every image instead.
 */
export function FigurePeek({
  figure,
  origin,
}: {
  figure: Figure | null
  /** Where to appear before the pointer has moved — the cursor, or the term. */
  origin: { x: number; y: number } | null
}) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!figure) return

    const place = (x: number, y: number) => {
      const el = box.current
      if (!el) return
      const pad = 14
      const w = el.offsetWidth
      const h = el.offsetHeight
      // Sits to the right of the pointer where there is room, flips to the
      // left where there is not, and never leaves the viewport.
      const right = x + 24
      const left = x - w - 24
      const fitsRight = right + w + pad <= window.innerWidth
      const nextX = Math.max(pad, fitsRight ? right : left)
      const nextY = Math.max(pad, Math.min(y - h / 2, window.innerHeight - h - pad))
      el.style.transform = `translate3d(${Math.round(nextX)}px, ${Math.round(nextY)}px, 0)`
    }

    if (origin) place(origin.x, origin.y)
    const move = (event: PointerEvent) => place(event.clientX, event.clientY)
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [figure, origin])

  return (
    <div
      ref={box}
      className={`${styles.peek} ${figure ? styles.peekOn : ''}`}
      aria-hidden="true"
    >
      {figure && (
        <>
          <img className={styles.image} src={figure.src} alt="" decoding="async" />
          <span className={styles.caption}>
            <span className={styles.code}>{figure.code}</span>
            {figure.caption}
          </span>
        </>
      )}
    </div>
  )
}

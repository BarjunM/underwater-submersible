'use client'

import { useCallback, useEffect, useState } from 'react'
import { figures } from '@/lib/figures'
import styles from './Plate.module.css'

/**
 * The figure plate beside the letter.
 *
 * Deliberately not a carousel: nothing advances on its own, there are no
 * arrows, and no image is hidden behind a gesture. A printed specification
 * shows one plate at a time with its number and a caption, and indexes the
 * rest along the bottom — the reader chooses. That reads as documentation
 * rather than as a marketing panel, and it costs the page no motion it has
 * not earned.
 *
 * `active` lets the letter drive it: hovering a figure reference in the prose
 * raises that plate here, the way a callout points at a figure.
 */
export function Plate({ active }: { active?: string | null }) {
  const [index, setIndex] = useState(0)
  const [shown, setShown] = useState(0)

  // A term in the letter takes the plate over while the pointer is on it, then
  // hands it back to whatever the reader had chosen.
  useEffect(() => {
    if (!active) {
      setShown(index)
      return
    }
    const found = figures.findIndex((figure) => figure.id === active)
    if (found >= 0) setShown(found)
  }, [active, index])

  const choose = useCallback((next: number) => {
    setIndex(next)
    setShown(next)
  }, [])

  const figure = figures[shown]

  return (
    <figure className={styles.plate}>
      <figcaption className={styles.head}>
        <span>Figure plate</span>
        <span className={styles.count}>
          {String(shown + 1).padStart(2, '0')} / {String(figures.length).padStart(2, '0')}
        </span>
      </figcaption>

      <div className={styles.frame}>
        {/* Every plate stays mounted and cross-fades, so switching never shows
            an empty frame while a file loads. */}
        {figures.map((item, i) => (
          <img
            key={item.id}
            src={item.src}
            alt={i === shown ? item.alt : ''}
            className={`${styles.image} ${i === shown ? styles.imageOn : ''}`}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            aria-hidden={i === shown ? undefined : true}
          />
        ))}
        <span className={`${styles.corner} ${styles.cornerTL}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerTR}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBL}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBR}`} aria-hidden="true" />
      </div>

      <p className={styles.caption} aria-live="polite">
        <span className={styles.code}>{figure.code}</span>
        <span className={styles.captionText}>{figure.caption}</span>
      </p>

      <ul className={styles.index}>
        {figures.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              className={`${styles.thumb} ${i === shown ? styles.thumbOn : ''}`}
              onClick={() => choose(i)}
              onMouseEnter={() => setShown(i)}
              onMouseLeave={() => setShown(index)}
              aria-label={`Plate ${i + 1}: ${item.caption}`}
              aria-pressed={i === index}
            >
              <img src={item.src} alt="" loading="lazy" decoding="async" />
            </button>
          </li>
        ))}
      </ul>
    </figure>
  )
}

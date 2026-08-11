import { site } from '@/lib/content'
import styles from './Colophon.module.css'

/**
 * The foot of the page: who to talk to, and nothing else.
 *
 * It has lost a revision record, a systems table and an END OF DOCUMENT rule
 * over successive passes, each for the same reason — a closing band that
 * restates the page is a second page. What is left is the one thing a reader
 * gets to the bottom wanting.
 */
export function Colophon() {
  return (
    <footer className={styles.colophon} aria-label="Contact">
      <div className={styles.inner}>
        <div className={styles.lockup}>
          <Roundel />
          <span className={styles.mark}>
            {site.name} <span className={styles.dim}>{site.mark}</span>
          </span>
        </div>

        <div className={styles.contact}>
          <a className={styles.mail} href={`mailto:${site.email}`}>
            {site.email}
          </a>
          <a className={styles.mail} href={`mailto:${site.email2}`}>
            {site.email2}
          </a>
          <p className={styles.note}>Open source on release</p>
        </div>
      </div>
    </footer>
  )
}

function Roundel() {
  return (
    <svg className={styles.roundel} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="60" cy="60" r="17" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M60 34v52M34 60h52" stroke="currentColor" strokeWidth="2" opacity="0.55" />
    </svg>
  )
}

import { site } from '@/lib/content'
import { PipeBand } from './PipeBand'
import styles from './Colophon.module.css'

/**
 * The foot of the page: who to talk to, and nothing else.
 *
 * It has lost a revision record, a systems table and an END OF DOCUMENT rule
 * over successive passes, each for the same reason — a closing band that
 * restates the page is a second page. What is left is the one thing a reader
 * gets to the bottom wanting.
 */
/** The closing strip. Facts about the build, not claims about it. */
const META: [string, string][] = [
  ['Working depth', '85 m'],
  ['Tether', '100 m'],
  ['Assembly', '14 parts'],
  ['Source', 'Open on release'],
]

export function Colophon() {
  return (
    <footer className={styles.colophon} aria-label="Contact">
      <div className={styles.inner}>
        {/* Two columns of roughly equal weight. The mark alone was a single
            short line against three on the right, which left the sign-off
            hanging under a stack of addresses rather than balancing it. */}
        <div className={styles.lockup}>
          <Roundel />
          <span className={styles.marks}>
            <span className={styles.mark}>
              {site.name} <span className={styles.dim}>{site.mark}</span>
            </span>
            <span className={styles.tag}>Subsea inspection platform</span>
          </span>
        </div>

        <div className={styles.contact}>
          <span className={styles.label}>Get in touch</span>
          <a className={styles.mail} href={`mailto:${site.email}`}>
            {site.email}
          </a>
          <a className={styles.mail} href={`mailto:${site.email2}`}>
            {site.email2}
          </a>
        </div>
      </div>

      {/*
        A specification sheet ends with a strip of the facts that were true of
        the whole document, and it is the one bit of chrome this page had
        nothing of. Every figure here is the real machine's — the depth is
        chamber-validated, the tether is the one on the third prototype — so
        it reads as a colophon rather than as decoration.
      */}
      <ul className={styles.meta}>
        {META.map(([term, value]) => (
          <li key={term} className={styles.metaItem}>
            <span className={styles.metaTerm}>{term}</span>
            <span className={styles.metaValue}>{value}</span>
          </li>
        ))}
      </ul>

      <PipeBand />
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

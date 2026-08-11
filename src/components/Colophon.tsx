import { site, systems } from '@/lib/content'
import styles from './Colophon.module.css'

/**
 * The document's end matter.
 *
 * Kept deliberately short. It used to carry a revision record as well, which
 * read well as a device but said the same thing the foreword had already said
 * in prose — the same three prototypes, in the same order. A closing band is
 * the wrong place to repeat the opening one, so what is left is only what
 * lives nowhere else: what runs where, and how to reach anyone.
 */
export function Colophon() {
  return (
    <section className={styles.colophon} aria-label="Document record">
      <div className={styles.inner}>
        <div className={styles.cols}>
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Systems</h2>
            <dl className={styles.systems}>
              {systems.map(([role, runs]) => (
                <div key={role} className={styles.systemsRow}>
                  <dt>{role}</dt>
                  <dd>{runs}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Seal and contact travel together. With the record gone there is
              not enough left to hold three separate groups apart — spread
              across a wide footer they read as scattered rather than spare. */}
          <div className={styles.identity}>
            <Roundel />
            <div className={styles.marks}>
              <a className={styles.mail} href={`mailto:${site.email}`}>
                {site.email}
              </a>
              <a className={styles.mail} href={`mailto:${site.email2}`}>
                {site.email2}
              </a>
              <p className={styles.note}>Open source on release</p>
            </div>
          </div>
        </div>

        <footer className={styles.end}>
          <span>End of document</span>
          <span className={styles.endRule} aria-hidden="true" />
          <span>
            {site.name} {site.mark} / P3
          </span>
        </footer>
      </div>
    </section>
  )
}

function Roundel() {
  return (
    <svg className={styles.roundel} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <path id="colophonRing" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle
        cx="60"
        cy="60"
        r="48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <circle cx="60" cy="60" r="17" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M60 34v52M34 60h52" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <text className={styles.roundelText}>
        <textPath href="#colophonRing" startOffset="0%">
          DESIGNED · BUILT · WET TESTED · {site.name.toUpperCase()} ·
        </textPath>
      </text>
    </svg>
  )
}

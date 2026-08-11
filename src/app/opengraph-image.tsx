import { ImageResponse } from 'next/og'

/**
 * The social card, drawn in the site's own language: ink field, hairline
 * frame with registration squares, wide-tracked mono, one vermilion accent.
 * Satori has no access to the site's fonts, so the card leans on layout and
 * tracking rather than typeface — which the style survives.
 */

export const runtime = 'edge'
export const alt = 'OceanOptic MK-I — subsea inspection platform, field specification'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const INK = '#0e0f0c'
const BONE = '#f2efe1'
const RULE = 'rgba(242, 239, 225, 0.32)'
const DIM = 'rgba(242, 239, 225, 0.5)'
const ACCENT = '#e2552f'

const corner = (position: Record<string, number>) => ({
  position: 'absolute' as const,
  width: 12,
  height: 12,
  background: BONE,
  ...position,
})

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: INK,
          color: BONE,
          padding: 28,
          fontSize: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            border: `2px solid ${RULE}`,
            position: 'relative',
            padding: '36px 48px',
          }}
        >
          <div style={corner({ top: -7, left: -7 })} />
          <div style={corner({ top: -7, right: -7 })} />
          <div style={corner({ bottom: -7, left: -7 })} />
          <div style={corner({ bottom: -7, right: -7 })} />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              letterSpacing: 6,
              fontSize: 22,
              paddingBottom: 24,
              borderBottom: `1px solid ${RULE}`,
            }}
          >
            <span>OCEANOPTIC MK-I</span>
            <span style={{ color: DIM }}>FIELD SPECIFICATION</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', fontSize: 76, letterSpacing: -1 }}>
              Finds the{' '}
              <span style={{ color: ACCENT, marginLeft: 20, marginRight: 20 }}>crack</span> before
            </div>
            <div style={{ display: 'flex', fontSize: 76, letterSpacing: -1 }}>
              it becomes a breach.
            </div>
            <div style={{ display: 'flex', marginTop: 26, fontSize: 22, color: DIM, letterSpacing: 4 }}>
              SUBSEA INSPECTION ROV · REAL CAD · 13 PARTS · INTERACTIVE
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              letterSpacing: 5,
              fontSize: 18,
              paddingTop: 24,
              borderTop: `1px solid ${RULE}`,
              color: DIM,
            }}
          >
            <span style={{ background: BONE, color: INK, padding: '4px 12px' }}>
              DOCUMENT TYPE: FIELD SPECIFICATION
            </span>
            <span>SERIAL NO. 001</span>
          </div>
        </div>
      </div>
    ),
    size,
  )
}

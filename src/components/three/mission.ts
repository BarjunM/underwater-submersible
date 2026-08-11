/**
 * Choreography for the inspection sequence.
 *
 * One normalised clock drives everything, so every element is a pure function
 * of `t` and the whole thing is deterministic, loopable and scrubbable. No
 * per-element timers to fall out of sync.
 *
 * Deliberately free of any three.js import. The page's UI reads the phase list
 * from here, so anything this module pulls in lands in the main bundle.
 */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const smooth01 = (x: number) => {
  const c = clamp(x, 0, 1)
  return c * c * (3 - 2 * c)
}

/** Deterministic noise — the damage is different each loop, but never random
 *  twice for the same loop. */
const hash01 = (n: number) => {
  const h = Math.sin(n * 12.9898) * 43758.5453
  return h - Math.floor(h)
}

export const DURATION = 17

export const PIPE = { radius: 1, length: 15, from: -7.5, to: 7.5 }

/** Phase boundaries in normalised time, and what to call each one. */
export const PHASES = [
  { at: 0.0, label: 'Transit' },
  { at: 0.12, label: 'Fatigue cracking' },
  { at: 0.3, label: 'Scanning' },
  { at: 0.58, label: 'Defects flagged' },
  { at: 0.64, label: 'Sealing' },
  { at: 0.9, label: 'Section restored' },
]

export const SCAN = { from: 0.3, to: 0.58 }
export const REPAIR = { from: 0.64, to: 0.9 }

/**
 * The sequence clock, in one place.
 *
 * `hold` pins it to a single moment — for reduced-motion viewers, and for the
 * ?hold= debug parameter. Shared module state rather than a prop so every
 * element in the scene reads the same clock without threading it through.
 */
export const clock = { hold: null as number | null }

export function timeOf(elapsed: number) {
  return clock.hold ?? (elapsed % DURATION) / DURATION
}

/** Which pass this is. The crack layout rotates on it. */
export function cycleOf(elapsed: number) {
  return clock.hold != null ? 0 : Math.floor(elapsed / DURATION)
}

/** The most informative single frame: every defect found, none sealed yet. */
export const STILL_FRAME = 0.6

export function phaseAt(t: number) {
  let index = 0
  for (let i = 0; i < PHASES.length; i++) if (t >= PHASES[i].at) index = i
  return index
}

/** Smooth 0→1 ramp across [a,b]. */
export function ramp(t: number, a: number, b: number) {
  return smooth01((t - a) / (b - a))
}

/** The scan head is only live on the outbound pass. */
export function scanning(t: number) {
  return t >= SCAN.from && t <= SCAN.to + 0.02
}

export function repairing(t: number) {
  return t >= REPAIR.from && t <= REPAIR.to + 0.02
}

/** Facing: +1 travelling downstream, -1 coming back. */
export function rovHeading(t: number) {
  return t >= REPAIR.from ? -1 : 1
}

/* ------------------------------------------------------------------ cracks */

export type Crack = {
  /** Position along the pipe. */
  x: number
  /** Where it sits around the circumference (0 = top, ~1.6 = facing camera). */
  angle: number
  /** [x, y, z] triples on the pipe surface. */
  points: [number, number, number][]
  /** Confidence the detector reports, for the flag. */
  score: string
}

/**
 * A crack as a jagged path lying on the pipe surface.
 *
 * Walks along the pipe, wandering around the circumference as it goes, with
 * the wander tapering at each end so cracks thin out rather than stopping
 * dead.
 */
function crackPath(x: number, angle: number, length: number, seed: number) {
  let s = seed
  const rng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }

  const points: [number, number, number][] = []
  const steps = 26
  let drift = 0

  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const taper = Math.sin(u * Math.PI)
    drift += (rng() - 0.5) * 0.22
    const a = angle + drift * 0.5
    const px = x + (u - 0.5) * length
    const r = PIPE.radius * 1.004
    points.push([px, Math.cos(a) * r * (0.98 + taper * 0.02), Math.sin(a) * r])
  }
  return points
}

/**
 * Eight candidate defects, spread along the pipe and around the visible arc
 * of its circumference — crown, shoulder, and the low face toward the camera.
 * Five of them are live in any given loop; `crackActive` rotates the set, so
 * every pass of the machine finds different damage in different places.
 */
export const CRACK_POOL: Crack[] = [
  { x: -5.7, angle: 0.5, length: 2.2, seed: 7, score: '0.92' },
  { x: -3.9, angle: 1.45, length: 2.8, seed: 21, score: '0.88' },
  { x: -2.1, angle: 0.15, length: 2.0, seed: 44, score: '0.95' },
  { x: -0.5, angle: 1.05, length: 3.1, seed: 91, score: '0.94' },
  { x: 1.2, angle: 0.7, length: 1.8, seed: 133, score: '0.9' },
  { x: 2.8, angle: 1.75, length: 2.4, seed: 167, score: '0.87' },
  { x: 4.4, angle: 0.3, length: 2.8, seed: 201, score: '0.93' },
  { x: 5.9, angle: 1.25, length: 1.9, seed: 233, score: '0.89' },
].map((c) => ({
  x: c.x,
  angle: c.angle,
  score: c.score,
  points: crackPath(c.x, c.angle, c.length, c.seed),
}))

/** Five of the eight, rotating through every combination over eight loops. */
export function crackActive(index: number, cycle: number) {
  return (index + ((cycle % 8) + 8) * 3) % 8 < 5
}

/** When this crack starts to open, varied a little every loop. */
export function crackAppears(index: number, cycle: number) {
  return 0.11 + hash01(index * 127 + cycle * 311) * 0.16
}

function activeSet(cycle: number) {
  return CRACK_POOL.filter((_, i) => crackActive(i, cycle))
}

/** 0→1: how close x is to the nearest live defect this loop. */
export function crackProximity(x: number, cycle = 0) {
  let best = 0
  for (const crack of activeSet(cycle)) {
    const d = (x - crack.x) / 0.9
    const p = Math.exp(-d * d)
    if (p > best) best = p
  }
  return best
}

/* -------------------------------------------------------------------- path */

const START = PIPE.from - 1.5
const END = PIPE.to + 1.5

/**
 * The machine does not glide — it works. Time spent per metre of pipe scales
 * with damage proximity, so it cruises the clear stretches and slows almost
 * to a hover over each live crack. The mapping is precomputed into a small
 * lookup table per crack layout (layouts repeat every eight loops).
 */
const DWELL = 3.2
const LUT_N = 512
const luts = new Map<number, Float32Array>()

function pathLut(cycle: number) {
  const key = ((cycle % 8) + 8) % 8
  const cached = luts.get(key)
  if (cached) return cached

  const M = 1024
  // Accumulated time per unit distance: 1 in clear water, up to 1 + DWELL
  // over a live defect. Inverting the running sum turns that into position
  // as a function of uniform time — the hover falls out of the integral.
  const cum = new Float32Array(M + 1)
  for (let i = 1; i <= M; i++) {
    const x = START + ((END - START) * (i - 0.5)) / M
    cum[i] = cum[i - 1] + 1 + DWELL * crackProximity(x, key)
  }

  const lut = new Float32Array(LUT_N + 1)
  const total = cum[M]
  let j = 0
  for (let s = 0; s <= LUT_N; s++) {
    const target = (s / LUT_N) * total
    while (j < M && cum[j + 1] < target) j++
    const span = cum[j + 1] - cum[j] || 1
    const frac = clamp((target - cum[j]) / span, 0, 1)
    lut[s] = START + ((END - START) * (j + frac)) / M
  }
  luts.set(key, lut)
  return lut
}

function sampleLut(lut: Float32Array, u: number) {
  const p = clamp(u, 0, 1) * LUT_N
  const i = Math.min(LUT_N - 1, Math.floor(p))
  const f = p - i
  return lut[i] * (1 - f) + lut[i + 1] * f
}

/**
 * Where the robot is at time t: out of frame, a working scan pass downstream
 * — slowing over each defect — a turn, and the same dwell-shaped pass back
 * upstream, sealing.
 */
export function rovX(t: number, cycle = 0) {
  if (t < SCAN.from) return START
  const lut = pathLut(cycle)
  if (t < SCAN.to) {
    return sampleLut(lut, smooth01((t - SCAN.from) / (SCAN.to - SCAN.from)))
  }
  if (t < REPAIR.from) return END
  if (t < REPAIR.to) {
    return sampleLut(lut, 1 - smooth01((t - REPAIR.from) / (REPAIR.to - REPAIR.from)))
  }
  return START
}

/** Normalised speed 0→1, for pitch and wake — near zero while hovering. */
export function rovSpeed(t: number, cycle = 0) {
  const dt = 0.004
  const a = rovX(clamp(t - dt, 0, 1), cycle)
  const b = rovX(clamp(t + dt, 0, 1), cycle)
  return clamp(Math.abs(b - a) / (2 * dt) / 90, 0, 1)
}

export const COLOUR = {
  pipe: '#2b2d26',
  pipeDark: '#171812',
  /* Tracks --accent in globals.css. */
  crack: '#4aa6dd',
  hull: '#d2a03a',
}

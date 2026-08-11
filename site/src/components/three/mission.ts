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

const DURATION = 17

/*
 * `length` is the working stretch — where defects appear and the machine
 * patrols. `draw` is how much cylinder is actually built, which is longer:
 * across a wide band the far ends converge under perspective, and a pipe that
 * stops short of the edge reads as a rod lying on the page rather than as a
 * pipeline running past it.
 */
export const PIPE = { radius: 1, length: 15, draw: 30, from: -7.5, to: 7.5 }

/**
 * How the scene is squeezed into the footer band.
 *
 * The band is a very wide, very short strip — roughly 13:1 — and a pipe is
 * 7.5:1. One cannot fill the other by scaling alone, so the two axes are
 * handled separately and the camera writes both each frame:
 *
 *   `thin`  scales the pipe's *radius* (and everything wrapped around it)
 *           without shortening it, so the pipe reads as a slender rule
 *           spanning the whole width rather than a wall filling the band.
 *   `span`  squeezes the working area — where the defects are and how far the
 *           machine travels — into the width actually visible. Without it the
 *           machine wanders off the ends of a narrow screen and spends most of
 *           the loop out of frame.
 */
export const view = { thin: 0.2, span: 1 }

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

/** Which pass this is. The stops move on it, so no two loops repeat. */
export function cycleOf(elapsed: number) {
  return clock.hold != null ? 0 : Math.floor(elapsed / DURATION)
}

/** The most informative single frame: every defect found, none sealed yet. */
export const STILL_FRAME = 0.6

/* ------------------------------------------------------------------ patrol */

/*
 * The loop is a patrol, not a repair job.
 *
 * There is no damage model here any more — no cracks opening, no beads being
 * laid. The machine runs the pipe, stops somewhere, sweeps its light over that
 * spot, and moves on. That is the whole sequence, and at the size this is
 * drawn it is the only thing that was ever legible anyway.
 */

/** Stops per loop. The first is fixed so every loop begins where the last
    ended; the rest move each time round. */
const STOPS = 4

/* Held just inside the pipe rather than off its ends. As a section the
   machine flew in from off-screen and left again; as a permanent strip along
   the foot of the page it should always be on the pipe, working. */
const START = PIPE.from + 2.5
const END = PIPE.to - 2.5
const HOME = (START + END) / 2

/** Share of each leg spent travelling; the rest is spent stopped, scanning. */
const TRAVEL = 0.58

/**
 * Where stop `i` is this loop.
 *
 * Stop 0 is HOME on every loop, which is what makes the sequence seamless: the
 * last leg returns there, so the wrap from t=1 to t=0 is continuous even
 * though the loop after it picks different places to stop.
 */
function stopAt(i: number, cycle: number) {
  const n = ((i % STOPS) + STOPS) % STOPS
  if (n === 0) return HOME
  const jitter = hash01(n * 71 + cycle * 197)
  return START + (END - START) * (0.1 + 0.8 * jitter)
}

/** Which leg t falls in, and how far through it. */
function leg(t: number) {
  const p = clamp(t, 0, 0.999999) * STOPS
  const i = Math.floor(p)
  return { i, u: p - i }
}

/** 0 while running, 1 while stopped and sweeping — the scan envelope. */
export function scanStrength(t: number) {
  const { u } = leg(t)
  if (u < TRAVEL) return 0
  // Fades up as it settles and back down before it pulls away, so the light
  // never snaps on.
  const v = (u - TRAVEL) / (1 - TRAVEL)
  return smooth01(v / 0.25) * smooth01((1 - v) / 0.25)
}

/** Where the machine is at time t. */
export function rovX(t: number, cycle = 0) {
  const { i, u } = leg(t)
  const from = stopAt(i, cycle)
  const to = stopAt(i + 1, cycle)
  if (u >= TRAVEL) return to
  return from + (to - from) * smooth01(u / TRAVEL)
}

/** Normalised speed 0→1, for pitch and trim — zero while stopped. */
export function rovSpeed(t: number, cycle = 0) {
  const { i, u } = leg(t)
  if (u >= TRAVEL) return 0
  const from = stopAt(i, cycle)
  const to = stopAt(i + 1, cycle)
  const reach = Math.abs(to - from) / (END - START)
  // Bell across the leg: accelerating away, coasting, settling in.
  const v = u / TRAVEL
  return reach * smooth01(v / 0.3) * smooth01((1 - v) / 0.3)
}

/** Facing: +1 travelling downstream, -1 coming back. Held through the stop. */
export function rovHeading(t: number, cycle = 0) {
  const { i } = leg(t)
  return stopAt(i + 1, cycle) >= stopAt(i, cycle) ? 1 : -1
}

export const COLOUR = {
  /*
   * One colour: the pipe. Nothing is drawn on it any more.
   *
   * The collars went first — five bands around a bar a few dozen pixels tall
   * were detail at a size that cannot carry detail, and off-axis each drew as
   * an arc. The cracks followed, with the patrol replacing the repair story.
   * What is left is one clean form for the machine to work along.
   */
  pipe: { light: '#0d0b09', dark: '#2f302b' },
  /* Mirrors MATERIAL.hull in lib/content.ts — the mission ROV takes its real
     materials from there; this is only so the palette reads in one place. */
  hull: '#f6f5f2',
}

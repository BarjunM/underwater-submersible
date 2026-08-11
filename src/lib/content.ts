/**
 * Everything the page says, in one place.
 *
 * The history, depth, tether, power and systems figures were confirmed by the
 * team (Aug 2026). Detection confidence still traces to their own screenshots.
 */

export const site = {
  name: 'OceanOptic',
  mark: 'MK-I',
  email: '1ardgupta@gmail.com',
  email2: 'vihaan2905@gmail.com',
}

/**
 * The foreword — a plain-spoken letter before the specification begins.
 * Strings render as text; objects render as links. `lead` is the greeting,
 * `dim` is an aside.
 */
/**
 * A run of the letter. A plain string is text; an object is a marked term —
 * `href` makes it a link, `fig` points it at a plate in lib/figures.ts, and a
 * term can carry both.
 */
type ForewordPart = string | { t: string; href?: string; fig?: string }
/**
 * The cover letter, in a prototype-progression format. The milestones are the
 * team's real build history, in their own sequence.
 */
export const foreword: { parts: ForewordPart[]; lead?: boolean; dim?: boolean }[] = [
  { parts: ["Hi! We're OceanOptic."], lead: true },
  {
    parts: [
      "We've been building an underwater inspection robot for the past year — a team of three, since last summer.",
    ],
  },
  {
    parts: [
      'Our first prototype proved the frame — ',
      { t: 'a hull designed in Fusion 360', href: '#machine', fig: 'hull' },
      ', printed in PLA and reprinted in PETG after the first frames let water through.',
    ],
  },
  {
    parts: [
      'Our second prototype sealed the core: ',
      { t: 'acrylic pressure tubes', fig: 'housing' },
      ' around ',
      { t: 'the electronics, camera and LEDs', fig: 'chassis' },
      ', closed with printed PETG endcaps and greased o-rings.',
    ],
  },
  {
    parts: [
      'Our third prototype went deep — ',
      { t: 'a 100 m tether', fig: 'tether' },
      ', pressure-chamber validated at 8.5 bar for an 85-metre working depth.',
    ],
  },
  {
    parts: [
      'Nationally recognized — ',
      {
        t: 'an Ingenious+ innovation award',
        href: 'https://ingeniousplus.ca/submission/sustainability-iii-an-underwater-rov-for-maintenance-of-underwater-structures-with-enhanced-computer-vision-and-machine-learning/',
      },
      ' from the Rideau Hall Foundation.',
    ],
    dim: true,
  },
  {
    parts: [
      'Our current iteration ',
      { t: 'finds structural defects', href: '#mission', fig: 'field' },
      " in dams and pipelines while they're still repairable — no divers, no dry-docking. Every part below is the real CAD, live in your browser.",
    ],
  },
  {
    parts: [
      'Do you wanna join or support us? ',
      { t: "Let's talk", href: 'mailto:' + site.email },
    ],
  },
]

/** Text between asterisks is set in the accent colour. */
export const headline = ['Finds the *crack*', 'before it becomes a breach.']

export const body =
  'An inspection robot that reads dam walls and pipelines by camera — the feed rides the tether, and detection runs at the surface station. Every part below is the real CAD — take it apart, or switch the shell off and look inside.'

export const readouts = [
  { label: 'Autopilot', value: 'ArduSub' },
  /* 3× A2212 vertical + 2× SunnySky X2212 horizontal, per the build sheet. */
  { label: 'Thrusters', value: '5' },
  /* Pressure-chamber validated at 8.5 bar; structural ceiling ~10 bar. */
  { label: 'Depth', value: '85 m' },
  { label: 'Detection', value: '0.94' },
]

/** What actually runs where. Shown in the colophon. */
export const systems = [
  ['Autopilot', 'ArduSub on Pixhawk'],
  ['Onboard', 'BlueOS on Raspberry Pi'],
  ['Surface', 'QGroundControl via tether'],
  ['Vision', 'Detection at the surface station'],
  ['Tether', '100 m Cat5e · WF-16 wet-mate'],
  ['Power', '3S 18650 pack · ~40 min'],
]

/**
 * Facts about the model on screen, not about the robot — every one of these is
 * measurable from the conversion pipeline, which is the point: the panel reads
 * as instrumentation because it is.
 */
export const modelData = [
  ['source', 'Fusion 360 / STEP'],
  ['components', '14'],
  ['triangles', '592,448'],
  ['transfer', '2.73 MB'],
  ['units', 'millimetre'],
  ['envelope', '425 × 234 × 96'],
]

export const mission = {
  eyebrow: 'The job',
  title: 'Find it early, seal it in place.',
  body:
    'Fatigue cracks open along a weld seam long before anything shows at the surface. One pass to score every metre of pipe, one pass back to close what it found.',
}

/**
 * Materials, matched to the real machine rather than the site palette — the
 * point of the model is that it is the actual thing. `metal` raises specular
 * response, `rough` scatters it.
 */
const MATERIAL = {
  /**
   * The printed outer shell — white.
   *
   * Not pure #fff: under the key light that clips to a flat white silhouette
   * and the form disappears. A hair off white keeps the shading that describes
   * the hull's curve. Metalness drops with it, because a printed part is not a
   * metal one — left at the old gold's 0.45 the white read as brushed
   * aluminium rather than as plastic.
   */
  hull: { color: '#ecebe6', metal: 0.08, rough: 0.5 },
  steel: { color: '#a2abb4', metal: 0.9, rough: 0.32 },
  /** Motor cans and mounts — dark, as they read through the shell cutouts. */
  motor: { color: '#33363a', metal: 0.6, rough: 0.45 },
  /** Printed grey props, distinct from the motors, as in the CAD. */
  prop: { color: '#b9bcb6', metal: 0.3, rough: 0.5 },
  foam: { color: '#cfc9b6', metal: 0.0, rough: 0.9 },
  /** The pressure tube renders white in the CAD — matte, not glassy. */
  tube: { color: '#eceae3', metal: 0.1, rough: 0.45 },
  /** Printed end assemblies — light grey, like the tube they cap. */
  printed: { color: '#d7d8d2', metal: 0.15, rough: 0.6 },
  glass: { color: '#9fd0e8', metal: 0.25, rough: 0.12 },
  /** Connector blocks — light grey mouldings, not dark resin. */
  block: { color: '#c7c9c2', metal: 0.2, rough: 0.55 },
  /** The Pixhawk case is maroon in the CAD. */
  case: { color: '#7e2f2b', metal: 0.2, rough: 0.5 },
  pcb: { color: '#2f7d52', metal: 0.15, rough: 0.6 },
  /** Cell green — the 18650 pack under the printed tray. */
  cell: { color: '#46795a', metal: 0.3, rough: 0.45 },
  resin: { color: '#3c424a', metal: 0.3, rough: 0.62 },
}

/**
 * The assembly, straight out of the Fusion 360 STEP export — fourteen groups
 * covering everything from the printed shell down to the Pixhawk and the
 * Raspberry Pi inside the pressure tube. `id` matches the node names the CAD
 * converter writes into the GLB (see scripts/step_to_obj.py). Colours are
 * matched to the CAD's own renders.
 *
 * Everything separates along one vertical axis. Array order is the
 * disassembly sequence, outermost first; `dist` is the resting height,
 * signed by `dir`.
 */
export const parts = [
  {
    id: 'shell',
    material: MATERIAL.hull,
    code: 'A-01',
    name: 'Printed hull frame',
    dir: [0, 1, 0] as [number, number, number],
    dist: 4.9,
  },
  {
    id: 'screws',
    material: MATERIAL.steel,
    code: 'A-02',
    name: 'Stainless fasteners',
    dir: [0, 1, 0] as [number, number, number],
    dist: 3.9,
  },
  {
    /* 3× A2212 930KV vertical + 2× SunnySky 980KV horizontal. */
    id: 'thrusters',
    material: MATERIAL.motor,
    code: 'B-03',
    name: 'Thruster motors ×5',
    dir: [0, 1, 0] as [number, number, number],
    dist: 3.15,
  },
  {
    /* Wet-sanded 80 → 1000 grit — the sanding alone doubled top speed. */
    id: 'props',
    material: MATERIAL.prop,
    code: 'B-04',
    name: 'Printed propellers',
    dir: [0, 1, 0] as [number, number, number],
    dist: 2.55,
  },
  {
    id: 'sensor',
    material: MATERIAL.steel,
    code: 'B-05',
    name: 'Depth sensor (MS5837)',
    dir: [0, 1, 0] as [number, number, number],
    dist: 2.0,
  },
  {
    id: 'lens',
    material: MATERIAL.glass,
    code: 'B-06',
    name: 'LED lighting',
    dir: [0, 1, 0] as [number, number, number],
    dist: 1.5,
  },
  {
    id: 'foam',
    material: MATERIAL.foam,
    code: 'C-07',
    name: 'Buoyancy foam',
    dir: [0, 1, 0] as [number, number, number],
    dist: 1.0,
  },
  {
    /* In the CAD tree the sealed vessel — tube body and both caps — lives
       under the endcap assemblies, so this group is the whole pressure
       housing, not just its ends. */
    id: 'endcaps',
    material: MATERIAL.tube,
    code: 'C-08',
    name: 'Acrylic pressure housing',
    dir: [0, 1, 0] as [number, number, number],
    dist: 0.5,
  },
  {
    /* And the "electronics pipe" branch is what rides inside it: the camera
       mount and the printed equipment trays. */
    id: 'tube',
    material: MATERIAL.printed,
    code: 'C-09',
    name: 'Internal chassis',
    dir: [0, 1, 0] as [number, number, number],
    dist: 0.0,
  },
  {
    id: 'wiring',
    material: MATERIAL.block,
    code: 'D-10',
    name: 'Wiring and connectors',
    dir: [0, -1, 0] as [number, number, number],
    dist: 0.55,
  },
  {
    id: 'autopilot',
    material: MATERIAL.case,
    code: 'D-11',
    name: 'Pixhawk autopilot',
    dir: [0, -1, 0] as [number, number, number],
    dist: 1.1,
  },
  {
    id: 'compute',
    material: MATERIAL.pcb,
    code: 'D-12',
    name: 'Raspberry Pi 4',
    dir: [0, -1, 0] as [number, number, number],
    dist: 1.7,
  },
  {
    /* 6× 18650 cells, charged as a 3S pack. */
    id: 'battery',
    material: MATERIAL.cell,
    code: 'D-13',
    name: '18650 battery pack',
    dir: [0, -1, 0] as [number, number, number],
    dist: 2.3,
  },
  {
    /* Sits just behind the front cap, inside the small acrylic enclosure. */
    id: 'package',
    material: MATERIAL.resin,
    code: 'D-14',
    name: 'IMX323 camera',
    dir: [0, -1, 0] as [number, number, number],
    dist: 2.9,
  },
]

/** Vertical extent of the exploded stack, used to draw the centreline. */
export const STACK = { top: 4.9, bottom: -2.9 }

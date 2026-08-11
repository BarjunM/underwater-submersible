/**
 * The photographic plates.
 *
 * Every image on the cover comes from this list — the plate panel beside the
 * letter shows them in order, and terms in the letter itself point at them by
 * id, so hovering "acrylic pressure tubes" raises the plate of the tubes.
 *
 * ---------------------------------------------------------------------------
 * REPLACING THE PLACEHOLDERS
 *
 * `public/figures/plate-0*.svg` are stand-ins — a registration cross and the
 * words PHOTOGRAPH PENDING, so an unfinished plate still reads as part of the
 * document rather than as a broken image.
 *
 * To use a real photograph, drop it in `public/figures/` and point `src` at
 * it. Anything the browser can show works (.jpg, .png, .webp). Landscape suits
 * the frame best — it is cropped to fill, from the centre. Keep `alt`
 * describing what is actually in the photograph.
 * ---------------------------------------------------------------------------
 */

export type Figure = {
  /** Referenced from the letter — see `fig` in lib/content.ts. */
  id: string
  code: string
  caption: string
  src: string
  alt: string
}

export const figures: Figure[] = [
  {
    id: 'hull',
    code: 'PL-01',
    caption: 'Hull — port elevation',
    src: '/figures/plate-01.svg',
    alt: 'Placeholder plate — the printed hull seen from the side',
  },
  {
    id: 'housing',
    code: 'PL-02',
    caption: 'Pressure housing and endcaps',
    src: '/figures/plate-02.svg',
    alt: 'Placeholder plate — the acrylic pressure housing and its printed endcaps',
  },
  {
    id: 'chassis',
    code: 'PL-03',
    caption: 'Internal chassis',
    src: '/figures/plate-03.svg',
    alt: 'Placeholder plate — the electronics chassis outside the housing',
  },
  {
    id: 'thrusters',
    code: 'PL-04',
    caption: 'Thrusters and propellers',
    src: '/figures/plate-04.svg',
    alt: 'Placeholder plate — a thruster motor and its printed propeller',
  },
  {
    id: 'tether',
    code: 'PL-05',
    caption: 'Tether and wet-mate',
    src: '/figures/plate-05.svg',
    alt: 'Placeholder plate — the tether and its wet-mate connector',
  },
  {
    id: 'field',
    code: 'PL-06',
    caption: 'Field test',
    src: '/figures/plate-06.svg',
    alt: 'Placeholder plate — the machine in the water during a field test',
  },
]

export const figureById = new Map(figures.map((figure) => [figure.id, figure]))

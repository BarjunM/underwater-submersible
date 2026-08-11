# OceanOptic

Site for an underwater inspection ROV, built as a **neo-industrial field
specification**: the real CAD as a live, interactive model, wrapped in the
language of a printed technical document. Four movements: a plain-spoken
foreword, the machine, the mission loop, and a colophon.

**The design system**, in `src/app/globals.css`:

- **NEGATIVE** (default) — two surfaces, one accent, no midtones: `#0e0f0c`
  ink, `#f2efe1` bone, `#e2552f` vermilion. The accent marks damage, live
  state, and primary action; nothing else is coloured.
- **PRINT** — the document on warm stock, and not a simple inversion of the
  negative. Paper is warm (`#f7f3e8`) rather than neutral, the ink is a
  brown-black (`#1b1712`) rather than a green-black, the accent warms to a
  coral, and the sheet gains two things the dark theme has no use for: a
  second accent — `--sky`, a water blue carrying the brand block on the
  mark — and **filled blocks**: the header bar reverses out, with small blocks
  stamped in reverse against it. That is most of what separates a printed spec
  sheet from a pale web page.
- The entire palette lives in CSS variables, so the toggle is one attribute on
  `<html>`; the WebGL scenes read it through `src/lib/theme.ts`. Persisted in
  localStorage with a pre-paint boot script so a saved theme never flashes.

  Three details make that work without any rule having to know which theme it
  is in. Filled blocks carry a `.onBar` class that re-points the whole ink
  family at bar-relative variants, so a label inside a bar goes on asking for
  `--bone-52` and gets something legible either way — on the negative they
  resolve back to exactly what they already were. The accent is split by job:
  `--accent` for fills, `--accent-ink` for type, because the same coral that
  reads well as a button on cream only manages 3:1 as small text on it.
  And `--accent-on` is the type that sits *on* an accent fill — near-black in
  both themes, since reaching for `--ink` there quietly inverted it on the
  print theme. Every pair clears WCAG AA in both themes; `WATER`/`TRACE` in
  `MissionScene.tsx` must track `--ink`/`--bone`, or the fog leaves a seam
  where the pipe fades into the page.
- **Bodoni Moda** (high-contrast Didone) for claims, **Azeret Mono**
  (squared-off, wide-tracked, uppercase) for everything a technician reads —
  labels, codes, readouts, and body copy.
- **One mark per job, and no more.** An earlier pass gave every section its
  own hairline frame, its own two hatched rails with rotated identifiers, and
  its own metadata strips top and bottom — four framed boxes stacked up, which
  read as a slide deck rather than as one document. All of it is gone. What
  remains is a single header strip on the machine, hairlines where sections
  actually meet, crop marks on the primary action, film grain, and one seal in
  the colophon. Zero border-radius anywhere.

**Interacting with the machine:** drag rotates; hovering any part names it in
the INSPECT readout and lights its row in the assembly index (and vice versa);
clicking a part — or its row — isolates it; LOOK INSIDE steps through three
states — the full machine, the shell and foam stripped to the white pressure
tube, then the tube opened to the electronics themselves; the slider scrubs the
fourteen-part disassembly; `+ / − / ⟲` control the view. `?only=shell,thrusters` renders just those hero parts; `?hold=0.45` freezes the
mission sequence at any normalised time.

```bash
npm run dev
```

## What you need to do

### 1. The specs

Every word and number on the page lives in [`src/lib/content.ts`](src/lib/content.ts).
The history, depth, tether, power and systems figures were confirmed by the
team (Aug 2026); the one number still on trust is the detection confidence:

| Field | Current value | Source |
| --- | --- | --- |
| Autopilot | ArduSub on Pixhawk | the software stack |
| Thrusters | `5` | the build sheet: 3× A2212 vertical, 2× SunnySky X2212 horizontal |
| Depth | `85 m` | pressure-chamber validated at 8.5 bar (ceiling ~10 bar) |
| Tether | 100 m Cat5e, WF-16 wet-mate | team-confirmed |
| Power | 3S 18650 ×6, ~40 min | team-confirmed |
| Detection | `0.94` | your own detection screenshots |

Detection runs at the **surface station** over the tether feed — the copy says
so deliberately; don't strengthen it back to "onboard" unless that changes.
The headline, body copy, part names and part descriptions are all in the same
file. Text between `*asterisks*` in the headline is set in the accent colour.

### 2. Add the photographs

The cover carries a **figure plate** beside the letter, and terms in the letter
point at it — hovering "acrylic pressure tubes" raises the plate of the tubes,
next to the pointer and in the panel at once.

All six plates are placeholders: `public/figures/plate-0*.svg`, a registration
cross and the words PHOTOGRAPH PENDING, so an unfinished plate still reads as
part of the document instead of as a broken image.

To use real photographs, drop them in `public/figures/` and point `src` at them
in [`src/lib/figures.ts`](src/lib/figures.ts) — that one file is the whole
edit. Any format the browser shows works; landscape suits the frame, which
crops to fill from the centre. Update `alt` to describe the actual photograph,
and `caption`/`code` if the subject changes.

To add or remove a plate, add or remove an entry — the panel, its index, and
the `NN / NN` counter all follow the array. A term in the letter points at one
by `id` via `fig`, alongside `href`; see `foreword` in `src/lib/content.ts`.

The pointer callout is hover-only and hides itself where there is no hover, so
on a phone the plate panel carries every image. The same terms are focusable,
so a keyboard reader gets the plate anchored to the term.

### 3. Re-running the CAD conversion

The real assembly is already converted and committed as
`public/models/rov.glb` (2.73 MB). You only need this if the CAD changes.

```bash
npm run convert-step -- path/to/model.step
```

Requires [FreeCAD](https://www.freecad.org) (free). STEP is B-rep —
mathematical surfaces, not triangles — so it needs a CAD kernel to tessellate.
The browser-based WASM converters silently produce nothing on an assembly this
large; FreeCAD's native OpenCASCADE handles it. Set `FREECAD_CMD` if it is
installed somewhere unusual.

The converter walks the assembly down to its **leaves** — every real part,
including the Pixhawk and the Raspberry Pi inside the pressure tube — and sorts
them into fourteen groups. Two facts about FreeCAD's STEP import make that less
obvious than it sounds, and getting either wrong is very visible:

- **Every node has a Shape, and a parent's Shape is the compound of its
  children.** Meshing a parent *and* its children draws that geometry twice;
  the duplicate z-fights with itself and speckles every surface.
- **`obj.Shape` carries only that object's own placement, in its parent's
  frame.** A nested part is therefore in *local* coordinates — mesh it as-is
  and the six thrusters all collapse onto the origin and the internals float
  behind the hull.

So it descends to the leaves carrying the product of the ancestors' placements,
and groups each leaf by its **full ancestor path** — leaves are often unnamed
(`COMPOUND004`, `SOLID`), and only the path says which component they are.

Groups and mesh tolerances live in `GROUPS` at the top of
`scripts/step_to_obj.py`. The current settings give ~592k triangles →
**2.73 MB** after Draco. Lower a deflection if a part looks faceted; raise it
if the file gets heavy.

`npm run convert-step` and `npm run convert-model` both finish by baking the
model's **feature edges** — the dark lines that make the machine read as
machined — into `public/models/rov-edges.bin` (0.74 MB, gzipped on disk and
served with `Content-Encoding: gzip`). Commit it alongside the GLB.

Deriving those lines in the browser with `THREE.EdgesGeometry` cost about
**3.5 seconds of blocking main-thread work** on this assembly — nearly a
second for the hull alone — because it allocates a string per triangle edge.
They are a pure function of the geometry, so none of it needs to happen on a
phone. `scripts/build-edges.mjs` reimplements the algorithm to run at build
time; because a reimplementation is only worth having if it is exact:

```bash
npm run verify-edges
```

runs the real `THREE.EdgesGeometry` over the same geometry and compares the
two segment for segment. It currently reports **100.000% identical on all
thirteen edged parts**, and exits non-zero if that ever stops being true. Two
details are load-bearing and easy to get wrong — edges must be keyed
*directionally* (an undirected key silently pairs faces with inconsistent
winding and discards 1,867 real lines on the hull alone), and positions must
be hashed at **float32**, because that is the precision the browser holds them
at and the algorithm keys vertices by rounded position.

The bake stores a triangle count per part. The site checks it against the
geometry it actually loaded, and if the two disagree — a stale bake, a missing
file, a lost `Content-Encoding` header — it derives the edges itself instead,
one part per idle callback so the page still never locks up. Slower, never
wrong, and it says so in the console in development.

Add `?only=shell,thrusters` to the URL to render just those parts — that is how
the duplicate-geometry bug above was found.

## How it works

| File | Job |
| --- | --- |
| `src/components/Foreword.tsx` | The cover letter; carries the opening sequence |
| `src/components/Plate.tsx` | The figure plate beside the letter, and its index |
| `src/components/FigurePeek.tsx` | The plate raised at the pointer by a term in the letter |
| `src/lib/figures.ts` | The plates themselves — swap the placeholders here |
| `src/components/Console.tsx` | The machine. Owns disassembly, isolation, picking and view state |
| `src/components/Mission.tsx` | The looping inspection sequence below it |
| `src/components/Colophon.tsx` | Revision record, stamps, machine marks |
| `src/lib/theme.ts` | Negative/print state, persistence, the hook the canvases read |
| `src/components/three/RovModel.tsx` | Parts, explode choreography, real-CAD loader |
| `src/components/three/proceduralRov.ts` | Stand-in machine, used only if the GLB is missing |
| `src/components/three/Surface.tsx` | Draws a part: shaded solid plus dark feature edges |
| `src/components/three/edges.ts` | Loads the baked feature edges; derives them only as a fallback |
| `scripts/convert-step.mjs` | STEP → GLB, end to end |
| `scripts/step_to_obj.py` | Runs inside FreeCAD: tessellate, decimate, group |
| `scripts/convert-model.mjs` | OBJ exports → one Draco-compressed GLB |
| `scripts/build-edges.mjs` | Bakes the feature edges the browser used to derive |
| `scripts/verify-edges.mjs` | Proves that bake matches `THREE.EdgesGeometry` exactly |

Fusion works **Z-up**, three.js is **Y-up**. The loader bakes a −90° X rotation
into the geometry on import; without it the machine lies on its side and the
explode axis runs through its width instead of its height.

The camera is **orthographic**, with `near`/`far` held tight around the scene.
That is not cosmetic: the depth buffer is spread across that range, and a loose
one leaves the machine occupying a percent of it and z-fighting with its own
internals showing through the shell.

The canvas is full-bleed, but the camera fits the model into whatever the
interface leaves free, not the whole canvas — `Console.tsx` measures the header,
the assembly list and the copy, and `RovCanvas` sizes and offsets the projection
to that region. Nothing is ever drawn under the UI, at any viewport. The
assembly list is a column beside the model on wide screens and a wrapping row
under the header on narrow ones; the measurement infers which from the list's
width rather than repeating the breakpoint.

Parts separate along a **single vertical axis**. Fanning them out in three
dimensions looks livelier but collapses into an unreadable pile under a fixed
camera — a stack keeps every part and label clear of its neighbours.

three.js is lazy-loaded, so the initial payload is ~98 kB. The converted
meshes stay **indexed** through the merge (flattening them tripled per-frame
vertex work), the hero's render loop **stops entirely** while it is off
screen, and both canvases render at native resolution with a
`PerformanceMonitor` that trades pixel ratio — never geometry — if the GPU
falls behind.

Nothing spins when nothing is happening. The disassembly loop runs only while
there is a gap between where the parts are and where they are going; at rest it
schedules no frames at all. It used to run for the life of the page, sixty
wake-ups a second dispatching two state updates that almost always resolved to
no change, and it kept running while the viewer was three sections away — the
kind of idle cost that shows up as battery rather than as jank.

The model and its edges are requested the moment the 3D chunk evaluates, not
after React mounts and a `HEAD` probe answers; that chain used to leave the
machine unrequested for most of a second while the browser sat idle.

Touch targets grow under `@media (pointer: coarse)` only, so a phone gets
44px keys and roomier index rows while the desktop keeps the dense drawing the
references are built on.

## Deploying to Vercel

The repository is initialised and committed on `main`, and the project is
already configured — Vercel detects Next.js on its own, so there is no
`vercel.json` and nothing to fill in at import time.

Either route works:

**From the dashboard.** Push this repo to GitHub, then
[import it on Vercel](https://vercel.com/new). Framework, build command and
output directory are all detected. Every push to `main` then redeploys.

```bash
git remote add origin https://github.com/<you>/oceanoptic.git
git push -u origin main
```

**From the terminal.** No GitHub account needed:

```bash
npx vercel
```

The first run asks you to log in and to confirm the project name and
directory; `npx vercel --prod` publishes. Both commands need a browser to
authenticate, so they have to be run by you.

### What is already handled

- **The social card** resolves to an absolute URL without configuration.
  Vercel supplies the production hostname at build time, so the first deploy
  has a working card. Once a real domain is attached, set
  `NEXT_PUBLIC_SITE_URL` to it in the project's environment variables and it
  takes priority.
- **The heavy assets** — the model, the baked edges, the Draco decoder, the
  plates — are served `max-age=3600, stale-while-revalidate=86400`. Vercel
  serves `public/` with `max-age=0, must-revalidate` by default, which costs a
  round trip per asset per visit; for a 2.8 MB model that is the difference
  between the machine appearing at once and appearing after a stall. Not
  `immutable`, because these live at fixed URLs and a re-converted model has to
  be able to reach people who already loaded the old one.
- **`engines.node`** is `>=18.18`, so the build cannot land on a runtime too
  old for Next 14.
- **`_capture.mjs`** is gitignored: a local screenshot utility with hardcoded
  machine paths and an undeclared `puppeteer-core` dependency. It has no part
  in the build.

### The one thing to check after the first deploy

`public/models/rov-edges.bin` is stored **already gzipped** and served with an
explicit `Content-Encoding: gzip` header — 775 kB on the wire instead of
1.9 MB. Confirm the header survives:

```bash
curl -sI https://<your-domain>/models/rov-edges.bin | grep -i content-encoding
```

If it is missing, nothing breaks: the file fails its magic-number check and the
site derives the feature edges in the browser instead, spread across idle
callbacks. Correct, just slower — and it says so in the console in development.

Commit `public/draco/` (the mesh decoder), `public/models/rov.glb` and
`public/models/rov-edges.bin`; the raw OBJ exports in `public/models/raw/` are
gitignored because they are large and only the conversion scripts need them.

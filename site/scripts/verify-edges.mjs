/**
 * Proves the baked edges are the edges three.js would have derived.
 *
 * scripts/build-edges.mjs reimplements THREE.EdgesGeometry so the work can
 * happen at build time instead of on someone's phone. A reimplementation is
 * only worth having if it is exact, so this runs the real thing over the same
 * geometry and compares the two, segment for segment.
 *
 * Both sides are snapped onto the bake's own 16-bit lattice before comparing;
 * on any other grid the result measures quantisation rather than geometry.
 *
 *   npm run verify-edges                 # every baked part
 *   npm run verify-edges -- shell tube   # just these
 *
 * Requires the raw OBJ exports in public/models/raw/, so it runs after a STEP
 * conversion, not from a clean checkout.
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const THRESHOLD = 26

function parseObj(text) {
  const positions = []
  const indices = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line[0] === '#') continue
    const space = line.indexOf(' ')
    if (space < 0) continue
    const kw = line.slice(0, space)
    if (kw === 'v') {
      const p = line.slice(space + 1).trim().split(/\s+/)
      positions.push(+p[0], +p[1], +p[2])
    } else if (kw === 'f') {
      const groups = line.slice(space + 1).trim().split(/\s+/)
      const n = positions.length / 3
      const refs = groups.map((g) => {
        const i = parseInt(g, 10)
        return i < 0 ? n + i : i - 1
      })
      for (let i = 1; i < refs.length - 1; i++) indices.push(refs[0], refs[i], refs[i + 1])
    }
  }
  return { positions, indices }
}

/**
 * Canonical form: each segment sorted end-to-end, then all segments sorted.
 *
 * Both lists are snapped onto the bake's own 16-bit lattice first. Comparing
 * on any other grid measures the quantisation rather than the geometry: an
 * arbitrary rounding boundary falls within the grid step often enough that
 * identical edges disagree simply for sitting near one.
 */
let snap = (v, axis) => v
function canonical(flat) {
  const segs = []
  for (let i = 0; i < flat.length; i += 6) {
    const a = [flat[i], flat[i + 1], flat[i + 2]].map((v, k) => snap(v, k))
    const b = [flat[i + 3], flat[i + 4], flat[i + 5]].map((v, k) => snap(v, k))
    const key = a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2]
    segs.push(key <= 0 ? [...a, ...b].join(',') : [...b, ...a].join(','))
  }
  segs.sort()
  return segs
}

// --- the bake -------------------------------------------------------------
const raw = gunzipSync(readFileSync(`${root}/public/models/rov-edges.bin`))
const headerLength = raw.readUInt32LE(4)
const header = JSON.parse(raw.slice(8, 8 + headerLength).toString('utf8'))
const body = new Int16Array(
  raw.buffer.slice(raw.byteOffset + 8 + headerLength, raw.byteOffset + raw.length),
)

snap = (v, axis) => Math.round((v - header.origin[axis]) / header.scale)

const asked = process.argv.slice(2)
const parts = asked.length > 0 ? asked : header.parts.filter((p) => p.count > 0).map((p) => p.id)
let allMatch = true

for (const id of parts) {
  const entry = header.parts.find((p) => p.id === id)
  if (!entry || entry.count === 0) {
    console.log(`${id.padEnd(11)} — not baked (over budget), skipping`)
    continue
  }

  const baked = new Float32Array(entry.count * 3)
  for (let i = 0; i < baked.length; i += 3) {
    const at = entry.offset * 3 + i
    baked[i] = body[at] * header.scale + header.origin[0]
    baked[i + 1] = body[at + 1] * header.scale + header.origin[1]
    baked[i + 2] = body[at + 2] * header.scale + header.origin[2]
  }

  // --- what three.js produces --------------------------------------------
  const { positions, indices } = parseObj(readFileSync(`${root}/public/models/raw/${id}.obj`, 'utf8'))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  const reference = new THREE.EdgesGeometry(geometry, THRESHOLD)
  const refPositions = reference.getAttribute('position').array

  const a = canonical(baked)
  const b = canonical(refPositions)

  let same = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++
  const identical = a.length === b.length && same === a.length
  if (!identical) allMatch = false

  console.log(
    `${id.padEnd(11)} baked ${String(a.length).padStart(7)}   three.js ${String(b.length).padStart(7)}   ` +
      `identical segments ${((same / Math.max(a.length, b.length)) * 100).toFixed(3)}%   ${identical ? 'MATCH' : 'DIFFERS'}`,
  )
}

if (allMatch) {
  console.log('\nAll compared parts match three.js exactly.')
} else {
  console.error('\nMismatch found — the bake would change how the model draws.')
  process.exit(1)
}

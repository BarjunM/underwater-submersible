/**
 * Bakes the model's feature edges at build time.
 *
 * The site draws each part as a shaded solid plus dark feature edges — the
 * lines that make a CAD model read as a machined object rather than a blob.
 * Those edges used to be derived in the browser with THREE.EdgesGeometry on
 * first paint, which cost ~3.5 seconds of blocking main-thread work on this
 * assembly (nearly a second for the hull alone) because the algorithm hashes
 * a string per triangle edge — roughly a million string allocations.
 *
 * The edges are a pure function of the geometry, so none of that has to happen
 * on a phone. This precomputes them from the same OBJ exports the GLB is built
 * from and writes them to public/models/rov-edges.bin.
 *
 * Why the OBJs and not the GLB: EdgesGeometry keys edges by *rounded vertex
 * position*, not by index, so it is blind to how a format happens to number
 * or split its vertices. Positions are what matters, and they survive the OBJ
 * → glTF → Draco trip intact (Draco quantises onto a grid, so vertices that
 * were coincident stay coincident, which is all adjacency depends on).
 *
 * Run via `npm run convert-model`, which chains this after the GLB.
 *
 * Format — little-endian:
 *   magic    'OOE1'                    4 bytes
 *   headLen  uint32                    4 bytes
 *   header   JSON                      headLen bytes
 *   body     int16 quantised positions
 *
 * Positions are stored quantised to a 16-bit grid over the whole model's
 * bounding box, in raw CAD space. The site restores them with the scale and
 * offset in the header, then applies the same normalising transform it applies
 * to the solids. A 16-bit grid over a 425 mm machine resolves to 6.5 microns —
 * far finer than the tessellation itself, and half the size of float32.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = path.join(root, 'public', 'models', 'raw')
const outFile = path.join(root, 'public', 'models', 'rov-edges.bin')

/**
 * Must match Surface.tsx's `threshold` and RovModel.tsx's EDGE_BUDGET — an
 * edge is a feature edge when its two faces meet at more than this angle, and
 * parts denser than the budget are drawn without edges because at that density
 * they read as noise.
 */
const THRESHOLD_DEG = 26
const EDGE_BUDGET = 120_000

/** Parses the subset of OBJ that FreeCAD's mesh export emits. */
function parseObj(text) {
  const positions = []
  const indices = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.charCodeAt(0) === 35 /* # */) continue

    const space = line.indexOf(' ')
    if (space < 0) continue
    const keyword = line.slice(0, space)

    if (keyword === 'v') {
      const parts = line.slice(space + 1).trim().split(/\s+/)
      positions.push(+parts[0], +parts[1], +parts[2])
    } else if (keyword === 'f') {
      const groups = line.slice(space + 1).trim().split(/\s+/)
      // A face may be a polygon; fan it into triangles. Vertex refs are
      // v, v/vt, v//vn or v/vt/vn, and may be negative (from the end).
      const vertexCount = positions.length / 3
      const refs = groups.map((group) => {
        const index = parseInt(group, 10)
        return index < 0 ? vertexCount + index : index - 1
      })
      for (let i = 1; i < refs.length - 1; i++) {
        indices.push(refs[0], refs[i], refs[i + 1])
      }
    }
  }

  /*
   * Float32, not the float64 the parser produced. The browser holds positions
   * in a Float32Array, and the edge algorithm keys vertices by their position
   * rounded to four decimals — so a coordinate that sits near one of those
   * rounding boundaries can weld one way at double precision and the other way
   * at single. Matching the runtime's precision here is what takes the bake
   * from "almost the same lines" to the same lines.
   */
  return { positions: new Float32Array(positions), indices }
}

/**
 * THREE.EdgesGeometry, reimplemented over flat arrays.
 *
 * Deliberately a faithful port rather than an improvement: it keys edges by
 * position rounded to four decimals and compares face normals against the
 * threshold exactly as three.js does, so the baked lines are the same lines
 * the browser used to derive. The one change is mechanical — integer keys in a
 * Map instead of template-string keys in an object, which is what makes it
 * finish in a blink here rather than a second in the browser.
 */
function featureEdges(positions, indices) {
  const PRECISION = 1e4
  const thresholdDot = Math.cos((THRESHOLD_DEG * Math.PI) / 180)

  // Weld coincident vertices by rounded position, mirroring the string hash.
  const vertexKey = new Map()
  const welded = new Int32Array(positions.length / 3)
  for (let i = 0; i < welded.length; i++) {
    const key =
      Math.round(positions[i * 3] * PRECISION) +
      ',' +
      Math.round(positions[i * 3 + 1] * PRECISION) +
      ',' +
      Math.round(positions[i * 3 + 2] * PRECISION)
    let id = vertexKey.get(key)
    if (id === undefined) {
      id = vertexKey.size
      vertexKey.set(key, id)
    }
    welded[i] = id
  }

  const edges = new Map()
  const out = []

  const ax = [0, 0, 0]
  const ay = [0, 0, 0]
  const az = [0, 0, 0]
  const source = [0, 0, 0]

  for (let i = 0; i < indices.length; i += 3) {
    source[0] = indices[i]
    source[1] = indices[i + 1]
    source[2] = indices[i + 2]
    const w = [welded[source[0]], welded[source[1]], welded[source[2]]]

    // Degenerate after welding — no edge worth keeping.
    if (w[0] === w[1] || w[1] === w[2] || w[2] === w[0]) continue

    for (let j = 0; j < 3; j++) {
      ax[j] = positions[source[j] * 3]
      ay[j] = positions[source[j] * 3 + 1]
      az[j] = positions[source[j] * 3 + 2]
    }

    // Face normal, from the triangle itself — the same quantity three.js
    // compares, and not the shading normal, which may be smoothed.
    const e1x = ax[1] - ax[0]
    const e1y = ay[1] - ay[0]
    const e1z = az[1] - az[0]
    const e2x = ax[2] - ax[0]
    const e2y = ay[2] - ay[0]
    const e2z = az[2] - az[0]
    let nx = e1y * e2z - e1z * e2y
    let ny = e1z * e2x - e1x * e2z
    let nz = e1x * e2y - e1y * e2x
    const length = Math.hypot(nx, ny, nz)
    if (length === 0) continue
    nx /= length
    ny /= length
    nz /= length

    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3
      /*
       * Keys are *directed*, which matters more than it looks. Two triangles
       * sharing an edge with consistent winding traverse it in opposite
       * directions, so the second finds the first under the reversed key and
       * the pair is judged on the angle between their faces.
       *
       * Where the winding is not consistent — and a tessellated CAD assembly
       * has such places — both traverse it the same way, neither sees the
       * other, and both survive as unmatched boundary edges. An undirected
       * key quietly pairs them instead and lets the angle test discard the
       * edge: on the hull that came to 1,867 lines that three.js draws and
       * this did not. Faithful beats tidy.
       */
      const key = w[j] * 4294967296 + w[k]
      const reverse = w[k] * 4294967296 + w[j]

      const opposite = edges.get(reverse)
      if (opposite) {
        if (nx * opposite.nx + ny * opposite.ny + nz * opposite.nz <= thresholdDot) {
          out.push(ax[j], ay[j], az[j], ax[k], ay[k], az[k])
        }
        // Consumed — a third face along the same edge matches nothing.
        edges.set(reverse, null)
      } else if (!edges.has(key)) {
        edges.set(key, { nx, ny, nz, i0: source[j], i1: source[k] })
      }
    }
  }

  // Edges that never found a facing pair are boundaries — always drawn.
  for (const edge of edges.values()) {
    if (!edge) continue
    out.push(
      positions[edge.i0 * 3],
      positions[edge.i0 * 3 + 1],
      positions[edge.i0 * 3 + 2],
      positions[edge.i1 * 3],
      positions[edge.i1 * 3 + 1],
      positions[edge.i1 * 3 + 2],
    )
  }

  return out
}

async function main() {
  if (!existsSync(rawDir)) {
    console.error(`No such directory: ${rawDir}`)
    process.exit(1)
  }

  const files = (await readdir(rawDir))
    .filter((f) => f.toLowerCase().endsWith('.obj') && !f.startsWith('__'))
    .sort()

  if (files.length === 0) {
    console.error('No .obj files in public/models/raw/ — run the STEP conversion first.')
    process.exit(1)
  }

  console.log('\nBaking feature edges:')

  const baked = []
  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]

  for (const file of files) {
    const id = path.basename(file, path.extname(file)).toLowerCase()
    const { positions, indices } = parseObj(await readFile(path.join(rawDir, file), 'utf8'))
    const triangles = indices.length / 3

    // The bounds have to span every part, edged or not: the site normalises
    // the whole assembly by its combined bounding box, and these positions
    // have to land in the same space.
    for (let i = 0; i < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[i + axis]
        if (value < min[axis]) min[axis] = value
        if (value > max[axis]) max[axis] = value
      }
    }

    if (triangles >= EDGE_BUDGET) {
      console.log(`  ${id.padEnd(14)} ${triangles.toLocaleString().padStart(9)} tris   skipped (over budget)`)
      // Recorded anyway: the site checks every part it knows about against
      // this list, so an over-budget part has to be accounted for too.
      baked.push({ id, triangles, lines: [] })
      continue
    }

    const started = Date.now()
    const lines = featureEdges(positions, indices)
    baked.push({ id, triangles, lines })
    console.log(
      `  ${id.padEnd(14)} ${triangles.toLocaleString().padStart(9)} tris   ` +
        `${(lines.length / 6).toLocaleString().padStart(8)} segments   ${Date.now() - started}ms`,
    )
  }

  // One quantisation grid for the whole model, so every part stays registered
  // with every other. int16 is signed; use the positive half only for headroom.
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1
  const scale = extent / 32000

  const totalFloats = baked.reduce((sum, part) => sum + part.lines.length, 0)
  const body = Buffer.alloc(totalFloats * 2)

  const header = { threshold: THRESHOLD_DEG, origin: min, scale, parts: [] }
  let cursor = 0
  for (const part of baked) {
    // `tris` is the fingerprint: the site compares it against the geometry it
    // actually loaded and falls back to deriving edges itself if they differ,
    // so a stale bake can never quietly draw the wrong lines.
    header.parts.push({
      id: part.id,
      offset: cursor,
      count: part.lines.length / 3,
      tris: part.triangles,
    })
    for (let i = 0; i < part.lines.length; i++) {
      const axis = i % 3
      const quantised = Math.round((part.lines[i] - min[axis]) / scale)
      body.writeInt16LE(Math.max(-32768, Math.min(32767, quantised)), (cursor * 3 + i) * 2)
    }
    cursor += part.lines.length / 3
  }

  // Padded to four bytes: the body is read as an Int16Array straight out of
  // the downloaded ArrayBuffer, and a typed array cannot start on an offset
  // that its element size does not divide. An unpadded header is odd about
  // half the time, and the failure is a thrown RangeError, not a wrong number.
  let headerJson = Buffer.from(JSON.stringify(header), 'utf8')
  const padding = (4 - ((8 + headerJson.length) % 4)) % 4
  if (padding > 0) headerJson = Buffer.concat([headerJson, Buffer.alloc(padding, 0x20)])

  const magic = Buffer.alloc(8)
  magic.write('OOE1', 0, 'ascii')
  magic.writeUInt32LE(headerJson.length, 4)

  const out = Buffer.concat([magic, headerJson, body])

  // Stored gzipped, and served with Content-Encoding: gzip (see
  // next.config.mjs) so the browser inflates it natively at no cost to us.
  //
  // Not left to the server to compress: quantised coordinates deflate to about
  // 40% of their size, but Next serves application/octet-stream as-is, and
  // whether a given CDN compresses it is not something the site should depend
  // on. If the header is ever lost in transit the magic will not match, the
  // site will say so in development, and it falls back to deriving the edges
  // itself — slower, never wrong.
  const packed = gzipSync(out, { level: 9 })
  await writeFile(outFile, packed)

  console.log(
    `\nWrote public/models/rov-edges.bin — ${(packed.length / 1024 / 1024).toFixed(2)} MB gzipped ` +
      `(${(out.length / 1024 / 1024).toFixed(2)} MB raw, ${(totalFloats / 6).toLocaleString()} segments)`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

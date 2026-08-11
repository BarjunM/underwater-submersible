/**
 * Fusion 360 exports → one web-ready GLB.
 *
 * Drop one OBJ per component into public/models/raw/, then:
 *
 *   npm run convert-model
 *
 * Each file becomes a named object inside a single combined OBJ, which is
 * converted to glTF and Draco-compressed into public/models/rov-outer.glb and
 * rov-inner.glb — see SHELLS below for the split. The site
 * probes for that file at runtime, so the real machine appears as soon as it
 * exists — no code change needed.
 *
 * File names decide which part a mesh belongs to. Name them after the `node`
 * values in src/lib/content.ts: shell, motors, screws, electronics, compute,
 * battery, pressure.
 */

import { readdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import obj2gltf from 'obj2gltf'
import gltfPipeline from 'gltf-pipeline'

const { processGltf, gltfToGlb } = gltfPipeline

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = path.join(root, 'public', 'models', 'raw')
/*
 * Two payloads, not one.
 *
 * Everything you can see with the shell closed goes in the outer file, which
 * is what the page loads to draw the machine. The interior — the boards, the
 * loom, the fasteners — is two thirds of the triangles in the assembly and
 * none of it is on screen until someone opens the shell, so it is a second
 * file that is not fetched until they do.
 */
const SHELLS = {
  outer: ['shell', 'tube', 'props', 'thrusters', 'endcaps', 'lens', 'sensor'],
  inner: ['screws', 'compute', 'autopilot', 'wiring', 'package', 'battery', 'foam'],
}
const outFileFor = (shell) => path.join(root, 'public', 'models', `rov-${shell}.glb`)
const combinedFile = path.join(rawDir, '__combined.obj')

/**
 * Concatenates OBJ files into one, wrapping each in its own named object.
 *
 * OBJ vertex indices are global and 1-based across the whole file, so every
 * face index has to be shifted by the number of vertices already emitted.
 */
function mergeObjs(sources) {
  const out = []
  let vOffset = 0
  let vtOffset = 0
  let vnOffset = 0

  for (const { name, text } of sources) {
    let v = 0
    let vt = 0
    let vn = 0
    out.push(`o ${name}`)

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const [keyword, ...rest] = line.split(/\s+/)

      switch (keyword) {
        case 'v':
          v++
          out.push(line)
          break
        case 'vt':
          vt++
          out.push(line)
          break
        case 'vn':
          vn++
          out.push(line)
          break
        case 'f': {
          const verts = rest.map((group) =>
            group
              .split('/')
              .map((token, slot) => {
                if (token === '') return ''
                const index = parseInt(token, 10)
                const counts = [v, vt, vn]
                const offsets = [vOffset, vtOffset, vnOffset]
                // Negative indices count backwards from the current end.
                return index < 0 ? offsets[slot] + counts[slot] + index + 1 : offsets[slot] + index
              })
              .join('/'),
          )
          out.push(`f ${verts.join(' ')}`)
          break
        }
        // Material and grouping directives are dropped: the site colours
        // parts itself, by name.
        default:
          break
      }
    }

    vOffset += v
    vtOffset += vt
    vnOffset += vn
    console.log(`  ${name.padEnd(14)} ${v.toLocaleString()} vertices`)
  }

  return out.join('\n')
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
    console.error(
      'No .obj files in public/models/raw/.\n\n' +
        'In Fusion 360, right-click each top-level component → Save as Mesh,\n' +
        'set Format to OBJ and Refinement to Low, and save them here.',
    )
    process.exit(1)
  }

  const known = new Set([...SHELLS.outer, ...SHELLS.inner])
  const nameOf = (file) => path.basename(file, path.extname(file)).toLowerCase()

  const stray = files.map(nameOf).filter((n) => !known.has(n))
  if (stray.length) {
    console.error(
      `Not in either shell: ${stray.join(', ')}\n\n` +
        'Add each to SHELLS.outer or SHELLS.inner at the top of this script —\n' +
        'a part in neither would silently never be drawn.',
    )
    process.exit(1)
  }

  const sources = await Promise.all(
    files.map(async (file) => ({
      name: nameOf(file),
      text: await readFile(path.join(rawDir, file), 'utf8'),
    })),
  )

  let total = 0

  for (const [shell, members] of Object.entries(SHELLS)) {
    const mine = sources.filter((s) => members.includes(s.name))
    if (mine.length === 0) continue

    console.log(`\n${shell}: ${mine.map((s) => s.name).join(', ')}`)
    await writeFile(combinedFile, mergeObjs(mine), 'utf8')

    try {
      const gltf = await obj2gltf(combinedFile, { binary: false, separate: false })
      const compressed = await processGltf(gltf, {
        dracoOptions: { compressionLevel: 7 },
      })
      const { glb } = await gltfToGlb(compressed.gltf)
      await writeFile(outFileFor(shell), glb)
      total += glb.length
      console.log(`  → rov-${shell}.glb  ${(glb.length / 1024 / 1024).toFixed(2)} MB`)
    } finally {
      await unlink(combinedFile).catch(() => {})
    }
  }

  console.log(`\nTotal ${(total / 1024 / 1024).toFixed(2)} MB across ${Object.keys(SHELLS).length} files.`)
  console.log('Only the outer file is on the critical path.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

/**
 * STEP → GLB, end to end.
 *
 *   npm run convert-step -- <path-to.step>
 *
 * Finds FreeCAD, tessellates and decimates the assembly into per-part OBJ
 * files (scripts/step_to_obj.py), then merges and Draco-compresses those into
 * public/models/rov-{outer,inner}.glb (scripts/convert-model.mjs).
 *
 * FreeCAD is required because STEP is B-rep — mathematical surfaces, not
 * triangles — and needs a real CAD kernel to tessellate. The WASM builds of
 * OpenCASCADE silently produce nothing on assemblies of this size.
 * Free download: https://www.freecad.org
 *
 * Set FREECAD_CMD to point at FreeCADCmd if it lives somewhere unusual.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pyScript = path.join(root, 'scripts', 'step_to_obj.py')
const reportFile = path.join(root, 'scripts', '_convert-report.txt')

function findFreecad() {
  if (process.env.FREECAD_CMD) return process.env.FREECAD_CMD

  const candidates = []
  const local = process.env.LOCALAPPDATA
  const programs = process.env.ProgramFiles

  if (local) candidates.push(path.join(local, 'Programs', 'FreeCAD *', 'bin', 'FreeCADCmd.exe'))
  if (programs) candidates.push(path.join(programs, 'FreeCAD *', 'bin', 'FreeCADCmd.exe'))
  candidates.push('/Applications/FreeCAD.app/Contents/MacOS/FreeCADCmd')
  candidates.push('/usr/bin/freecadcmd', '/usr/local/bin/freecadcmd')

  for (const pattern of candidates) {
    if (pattern.includes('*')) {
      const matches = globSync(pattern.replace(/\\/g, '/')).sort().reverse()
      if (matches.length) return matches[0]
    } else if (existsSync(pattern)) {
      return pattern
    }
  }
  return null
}

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      // FreeCAD floods stdout with progress bars; its readable summary comes
      // back through the report file instead.
      stdio: label === 'freecad' ? ['ignore', 'ignore', 'inherit'] : 'inherit',
      shell: false,
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`)),
    )
  })
}

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: npm run convert-step -- <path-to.step>')
    process.exit(1)
  }
  if (!existsSync(input)) {
    console.error(`No such file: ${input}`)
    process.exit(1)
  }

  const freecad = findFreecad()
  if (!freecad) {
    console.error(
      'FreeCAD not found.\n\n' +
        'STEP files are B-rep and need a CAD kernel to tessellate.\n' +
        'Install FreeCAD (free) from https://www.freecad.org, or set\n' +
        'FREECAD_CMD to the full path of FreeCADCmd.',
    )
    process.exit(1)
  }

  console.log(`Using ${freecad}`)
  console.log('Tessellating — this takes a few minutes on a large assembly…\n')

  await run(freecad, [pyScript, '--', path.resolve(input)], 'freecad')

  if (existsSync(reportFile)) console.log(readFileSync(reportFile, 'utf8'))

  await run(process.execPath, [path.join(root, 'scripts', 'convert-model.mjs')], 'convert-model')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})

/** Emit a stable JSON footprint report for one packaged application tree. */

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzePackageFootprint } from './package-footprint.mjs'

export async function runPackageFootprintAnalysis(argv = process.argv.slice(2)) {
  const positional = argv.filter(value => !value.startsWith('--'))
  const outputIndex = argv.indexOf('--output')
  const root = resolve(positional[0] ?? fileURLToPath(new URL('../dist/win-unpacked', import.meta.url)))
  const report = await analyzePackageFootprint(root)
  const json = `${JSON.stringify(report, null, 2)}\n`
  if (outputIndex >= 0) {
    const output = argv[outputIndex + 1]
    if (output === undefined) throw new Error('--output requires a filename')
    await writeFile(resolve(output), json, 'utf8')
  }
  process.stdout.write(json)
  return report
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPackageFootprintAnalysis().catch((cause) => {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}

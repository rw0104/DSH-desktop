/** Aggregate five or more isolated benchmark records into release evidence. */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { summarizeInstallerBenchmarks } from './installer-benchmark.mjs'

export async function aggregateWindowsInstallerBenchmarks(argv = process.argv.slice(2)) {
  const outputIndex = argv.indexOf('--output')
  const output = outputIndex < 0 ? undefined : argv[outputIndex + 1]
  if (outputIndex >= 0 && output === undefined) throw new Error('--output requires a filename')
  const inputs = argv.filter((value, index) => value !== '--output' && index !== outputIndex + 1)
  if (inputs.length < 5) throw new Error('provide at least five independent benchmark JSON files')
  const records = await Promise.all(inputs.map(async (filename) => {
    const value = JSON.parse(await readFile(resolve(filename), 'utf8'))
    return Array.isArray(value) ? value : [value]
  }))
  const summary = summarizeInstallerBenchmarks(records.flat())
  const json = `${JSON.stringify(summary, null, 2)}\n`
  if (output !== undefined) await writeFile(resolve(output), json, 'utf8')
  process.stdout.write(json)
  return summary
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  aggregateWindowsInstallerBenchmarks().catch((cause) => {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}

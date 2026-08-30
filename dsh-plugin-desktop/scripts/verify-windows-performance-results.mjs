/** CLI release gate for four aggregated Windows installer strategies. */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateWindowsPerformanceResults } from './windows-performance-results.mjs'

export async function verifyWindowsPerformanceResults(argv = process.argv.slice(2)) {
  if (argv.length < 4) {
    throw new Error('usage: verify-windows-performance-results.mjs <baseline> <zip> <7z-staged> <7z-in-place> [output]')
  }
  const [baselinePath, zipPath, stagedPath, inPlacePath, outputPath] = argv
  const read = async path => JSON.parse(await readFile(resolve(path), 'utf8'))
  const result = evaluateWindowsPerformanceResults({
    baseline: await read(baselinePath),
    zip: await read(zipPath),
    staged7z: await read(stagedPath),
    inPlace7z: await read(inPlacePath),
  })
  const json = `${JSON.stringify(result, null, 2)}\n`
  if (outputPath !== undefined) await writeFile(resolve(outputPath), json, 'utf8')
  process.stdout.write(json)
  if (!result.passed) throw new Error(`Windows installer performance gate failed: ${result.failures.join('; ')}`)
  return result
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyWindowsPerformanceResults().catch((cause) => {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}

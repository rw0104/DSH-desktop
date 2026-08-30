/** Fail when a completed package exceeds the Windows release footprint budget. */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzePackageFootprint, packageFootprintFailures } from './package-footprint.mjs'

export async function verifyPackageFootprint(root) {
  const report = await analyzePackageFootprint(root)
  const failures = packageFootprintFailures(report)
  if (failures.length > 0) {
    throw new Error(`package footprint budget failed:\n- ${failures.join('\n- ')}`)
  }
  return report
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL('../dist/win-unpacked', import.meta.url)))
  verifyPackageFootprint(root).then((report) => {
    process.stdout.write(
      `verify-package-footprint: ${report.physical.fileCount} files, ${report.physical.bytes} bytes, ${report.archive.fileCount} ASAR entries.\n`,
    )
  }).catch((cause) => {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}

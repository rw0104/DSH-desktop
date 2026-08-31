import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  percentile,
  summarizeInstallerBenchmarks,
  validateInstallerBenchmarkRecord,
} from './installer-benchmark.mjs'

function record(index, elapsedMs) {
  return {
    schemaVersion: 1,
    artifactSha256: 'a'.repeat(64),
    windowsBuild: '10.0.26100',
    diskModel: 'Virtual Disk',
    defenderEnabled: true,
    defenderSignatures: '1.2.3.4',
    scenario: 'fresh',
    installPathLength: 80,
    elapsedMs,
    exitCode: 0,
    fileCount: 3_500,
    installedBytes: 500_000_000,
    productVersion: '2.0.16',
    treeDigest: 'b'.repeat(64),
    cleanupSucceeded: true,
    isolationEvidence: `win11-clean-${index}`,
  }
}

test('validates the complete fixed benchmark schema', () => {
  assert.equal(validateInstallerBenchmarkRecord(record(1, 60_000)).scenario, 'fresh')
  assert.throws(() => validateInstallerBenchmarkRecord({ ...record(1, 1), treeDigest: '' }), /treeDigest/u)
  assert.throws(() => validateInstallerBenchmarkRecord({ ...record(1, 1), cleanupSucceeded: false }), /cleanup/u)
})

test('uses nearest-rank P95 and an exact median', () => {
  assert.equal(percentile([10, 30, 20, 50, 40], 0.95), 50)
  const summary = summarizeInstallerBenchmarks([
    record(1, 60_000),
    record(2, 70_000),
    record(3, 50_000),
    record(4, 80_000),
    record(5, 65_000),
  ])
  assert.equal(summary.medianMs, 65_000)
  assert.equal(summary.p95Ms, 80_000)
})

test('rejects repeated snapshots and mixed artifacts', () => {
  const records = [1, 2, 3, 4, 5].map(index => record(index, 60_000 + index))
  records[4].isolationEvidence = records[3].isolationEvidence
  assert.throws(() => summarizeInstallerBenchmarks(records), /unique/u)
  records[4].isolationEvidence = 'win11-clean-5'
  records[4].artifactSha256 = 'c'.repeat(64)
  assert.throws(() => summarizeInstallerBenchmarks(records), /artifactSha256/u)
})

test('gives the legacy payload an explicit long-running installer timeout', () => {
  const benchmarkScript = readFileSync(
    fileURLToPath(new URL('./benchmark-windows-installer.ps1', import.meta.url)),
    'utf8',
  )
  const workflow = readFileSync(
    fileURLToPath(new URL('../../.github/workflows/windows-installer-performance.yml', import.meta.url)),
    'utf8',
  )
  assert.match(benchmarkScript, /\$InstallerTimeoutMinutes\s*=\s*15/u)
  assert.match(workflow, /\$timeoutMinutes\s*=\s*if\s*\(\$strategy\s*-eq\s*'base'\)\s*\{\s*45\s*\}\s*else\s*\{\s*15\s*\}/u)
  assert.match(workflow, /InstallerTimeoutMinutes\s*=\s*\$timeoutMinutes/u)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateWindowsPerformanceResults } from './windows-performance-results.mjs'

function summary(medianMs, p95Ms = medianMs) {
  return {
    schemaVersion: 1,
    runs: 5,
    medianMs,
    p95Ms,
    fileCount: 321,
    installedBytes: 664_254_147,
  }
}

test('passes a 40 percent ZIP improvement and keeps 7z behind its decision gate', () => {
  const result = evaluateWindowsPerformanceResults({
    baseline: summary(160_000, 180_000),
    zip: summary(90_000, 110_000),
    staged7z: summary(105_000, 115_000),
    inPlace7z: summary(85_000, 108_000),
  })
  assert.equal(result.passed, true)
  assert.equal(result.samePayload.inPlacePerformanceQualified, false)
  assert.equal(result.productionPayload, 'zip-direct')
})

test('fails loud on time, file, and byte regressions', () => {
  const bad = {
    ...summary(100_000, 130_000),
    fileCount: 18_001,
    installedBytes: 650 * 1024 * 1024 + 1,
  }
  const result = evaluateWindowsPerformanceResults({
    baseline: summary(150_000),
    zip: bad,
    staged7z: summary(100_000),
    inPlace7z: summary(80_000),
  })
  assert.equal(result.passed, false)
  assert.equal(result.failures.length, 5)
})

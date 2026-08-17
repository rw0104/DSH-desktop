import test from 'node:test'
import assert from 'node:assert/strict'
import { FOOTPRINT_LIMITS, assertWithinLimit } from './verify-package-footprint.mjs'

test('keeps the published footprint budgets explicit', () => {
  assert.equal(FOOTPRINT_LIMITS.installerMiB, 220)
  assert.equal(FOOTPRINT_LIMITS.unpackedMiB, 650)
  assert.equal(FOOTPRINT_LIMITS.privateMemoryMiB, 512)
  assert.equal(FOOTPRINT_LIMITS.workingSetMiB, 700)
})

test('rejects a value above its budget', () => {
  assert.throws(
    () => assertWithinLimit('sample', 12, 10),
    /sample is 12 MiB, above the 10 MiB budget/u,
  )
})

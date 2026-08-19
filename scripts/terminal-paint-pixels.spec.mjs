import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countForegroundPixels,
  parseCssRgb,
  terminalTextIsPainted,
} from './terminal-paint-pixels.mjs'

test('parses rgb and rgba colors', () => {
  assert.deepEqual(parseCssRgb('rgb(15, 17, 21)'), [15, 17, 21])
  assert.deepEqual(parseCssRgb('rgba(255, 255, 255, 0.8)'), [255, 255, 255])
})

test('distinguishes foreground glyph pixels from a blank background', () => {
  const blank = Buffer.from(Array.from({ length: 20 }, () => [255, 255, 255, 255]).flat())
  assert.equal(countForegroundPixels(blank, 4, [15, 17, 21], [255, 255, 255]), 0)

  const painted = Buffer.from(blank)
  for (let pixel = 0; pixel < 10; pixel += 1) {
    painted[pixel * 4] = 15
    painted[pixel * 4 + 1] = 17
    painted[pixel * 4 + 2] = 21
  }
  assert.equal(countForegroundPixels(painted, 4, [15, 17, 21], [255, 255, 255]), 10)
})

test('requires a small but stable foreground area', () => {
  assert.equal(terminalTextIsPainted(7, 120, 15), false)
  assert.equal(terminalTextIsPainted(8, 120, 15), true)
})

import { describe, expect, it } from 'vitest'
import { clampVoicePosition, placeVoiceCompact } from '../src/client/voice-position.ts'

describe('compact voice placement', () => {
  for (const width of [500, 800, 1280, 1920]) it(`avoids the composer and approvals at ${width}px`, () => {
    const viewport = { left: 0, top: 0, right: width, bottom: 600, width, height: 600 }
    const size = { width: 288, height: 54 }
    const obstacle = { left: 12, right: width - 12, top: 380, bottom: 590 }
    const point = placeVoiceCompact(size, viewport, [obstacle])
    expect(point.y + size.height).toBeLessThanOrEqual(obstacle.top - 12)
    expect(point.x).toBeGreaterThanOrEqual(12)
    expect(point.x + size.width).toBeLessThanOrEqual(width - 12)
  })
  it('constrains manual moves to the visible viewport after zoom/resize', () => {
    expect(clampVoicePosition({ x: 1800, y: -300 }, { width: 288, height: 54 }, {
      left: 20, top: 30, right: 520, bottom: 430, width: 500, height: 400,
    })).toEqual({ x: 220, y: 42 })
  })
})

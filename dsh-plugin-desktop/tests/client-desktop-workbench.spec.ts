import { describe, expect, it } from 'vitest'
import {
  clampWorkbenchWidth,
  parseWorkbenchPreference,
  WORKBENCH_DEFAULT_WIDTH,
  WORKBENCH_MAX_WIDTH,
  WORKBENCH_MIN_WIDTH,
} from '../src/client/DesktopWorkbench.tsx'

describe('desktop Workbench preferences', () => {
  it('clamps persisted and pointer-resized widths', () => {
    expect(clampWorkbenchWidth(Number.NaN)).toBe(WORKBENCH_DEFAULT_WIDTH)
    expect(clampWorkbenchWidth(120)).toBe(WORKBENCH_MIN_WIDTH)
    expect(clampWorkbenchWidth(421.6)).toBe(422)
    expect(clampWorkbenchWidth(900)).toBe(WORKBENCH_MAX_WIDTH)
  })

  it('rejects malformed local state and preserves valid open state', () => {
    expect(parseWorkbenchPreference(null)).toBeUndefined()
    expect(parseWorkbenchPreference('{')).toBeUndefined()
    expect(parseWorkbenchPreference('{"open":"yes","width":380}')).toBeUndefined()
    expect(parseWorkbenchPreference('{"open":false,"width":999}')).toEqual({
      open: false,
      width: WORKBENCH_MAX_WIDTH,
    })
  })
})

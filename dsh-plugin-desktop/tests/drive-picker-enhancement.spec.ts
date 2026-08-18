import { describe, expect, it, vi } from 'vitest'
import {
  installWindowsDrivePickerEnhancement,
  normalizeDriveLetters,
} from '../src/client/drive-picker-enhancement.ts'

describe('Windows drive picker enhancement', () => {
  it('is a no-op outside Windows', () => {
    expect(() => installWindowsDrivePickerEnhancement('darwin', {
      getSnapshot: () => ({ active: 'en' }),
      subscribe: () => () => {},
    })).not.toThrow()
  })

  it('does not create a selector when the host reports no mounted drives', () => {
    const appendChild = vi.fn()
    vi.stubGlobal('document', {
      createElement: vi.fn(),
      head: { appendChild },
    })
    try {
      const dispose = installWindowsDrivePickerEnhancement('win32', {
        getSnapshot: () => ({ active: 'en' }),
        subscribe: () => () => {},
      }, [])
      expect(appendChild).not.toHaveBeenCalled()
      dispose()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps only the mounted drive letters supplied by the host', () => {
    expect(normalizeDriveLetters(['c', 'D', 'D', '1', 'zz'])).toEqual(['C', 'D'])
  })
})

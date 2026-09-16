import { describe, expect, it, vi } from 'vitest'
const { assertPackagedNotices } = await vi.importActual<{
  assertPackagedNotices(actual: string, expected: string): void
}>('../scripts/verify-packaged-profile.mjs')

describe('sealed third-party notice record', () => {
  it('rejects the retired runtime record even when the installer version is unchanged', () => {
    expect(() => assertPackagedNotices('| dsh | 0.1.2-rc.1 | MIT |\n', '| dsh | 0.1.5-rc.2 | MIT |\n'))
      .toThrow('rebuild the artifact')
  })
  it('compares the entire record, allowing only checkout line-ending differences', () => {
    expect(() => assertPackagedNotices('current\r\nvendor notices\r\n', 'current\nvendor notices\n')).not.toThrow()
    expect(() => assertPackagedNotices('current\n', 'current\nvendor notices\n')).toThrow('rebuild the artifact')
  })
})

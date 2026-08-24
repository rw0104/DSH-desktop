import { describe, expect, it, vi } from 'vitest'
import { requestDesktopExternalNavigation } from '../src/client/external-navigation.ts'

describe('desktop client external navigation bridge', () => {
  it('forwards only a fixed product action to the preload capability', async () => {
    const open = vi.fn(async () => {})
    const target = { __DSH_DESKTOP_EXTERNAL_NAVIGATION__: { open } }

    await requestDesktopExternalNavigation('release-notes', target)

    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('release-notes')
  })
})

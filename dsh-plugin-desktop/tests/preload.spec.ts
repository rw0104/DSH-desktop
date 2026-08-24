import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_EXTERNAL_NAVIGATION_BRIDGE,
  DESKTOP_EXTERNAL_NAVIGATION_CHANNEL,
  type DesktopExternalNavigationBridge,
} from '../src/external-navigation-contract.ts'

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async () => {}),
  getPathForFile: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke },
  webUtils: { getPathForFile: electron.getPathForFile },
}))

describe('desktop preload', () => {
  it('exposes a fixed-action external navigation bridge', async () => {
    await import('../src/preload.ts')
    const exposure = electron.exposeInMainWorld.mock.calls.find(
      ([key]) => key === DESKTOP_EXTERNAL_NAVIGATION_BRIDGE,
    )
    expect(exposure).toBeDefined()
    const bridge = exposure?.[1] as DesktopExternalNavigationBridge | undefined
    if (bridge === undefined) throw new Error('external navigation preload bridge missing')

    await bridge.open('repository')

    expect(electron.invoke).toHaveBeenCalledWith(DESKTOP_EXTERNAL_NAVIGATION_CHANNEL, 'repository')
  })
})

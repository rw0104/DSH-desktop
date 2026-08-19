import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { DesktopPluginMarket } from '../src/plugin-market.ts'

function harness() {
  const calls: string[][] = []
  const pnpm = {
    runPlugin: (args: readonly string[], cwd: string) => {
      calls.push([...args, cwd])
      return {
        stdout: Readable.from(['installed']),
        stderr: Readable.from([]),
        done: Promise.resolve({ exitCode: 0, signal: null }),
      }
    },
  } as any
  const profiles = {
    current: { name: 'desktop', dir: 'C:\\profiles\\desktop' },
    list: () => [{ name: 'desktop', dir: 'C:\\profiles\\desktop', exists: true, bundles: [], webCapable: true }],
  } as any
  const runtime = { requestRestart: vi.fn(async () => {}) } as any
  return { market: new DesktopPluginMarket(pnpm, profiles, runtime), calls, profiles, runtime }
}

describe('desktop plugin market', () => {
  it('exposes an allowlisted catalog and installs through the active profile', async () => {
    const value = harness()
    expect(value.market.snapshot().entries).toHaveLength(3)
    await expect(value.market.install('dsh-video-preview')).resolves.toMatchObject({ restartRequired: true })
    expect(value.calls).toEqual([['add', 'dsh-video-preview', 'C:\\profiles\\desktop']])
    expect(value.runtime.requestRestart).toHaveBeenCalledOnce()
  })

  it('rejects arbitrary packages and product plugin removal', async () => {
    const value = harness()
    await expect(value.market.install('npm:untrusted-package')).rejects.toThrow('plugin-not-allowlisted')
    await expect(value.market.remove('@anionex/dsh-vision-toolkit')).rejects.toThrow('plugin-not-allowlisted')
    expect(value.calls).toEqual([])
  })
})

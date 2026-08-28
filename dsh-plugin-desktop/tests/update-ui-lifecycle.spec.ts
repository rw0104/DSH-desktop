import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopUpdateAdapter, DesktopTrayItem } from '../src/runtime.ts'
import { startDesktopUpdateLifecycle } from '../src/update-lifecycle.ts'
import type { DesktopUpdateUiState } from '../src/update-ui-state.ts'

const roots: string[] = []

function versionResponse(version: string): Response {
  const name = `DSH-Desktop-${version}-x64-Setup.exe`
  return Response.json({
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    assets: [{
      name,
      size: 100,
      digest: `sha256:${'a'.repeat(64)}`,
      state: 'uploaded',
      browser_download_url: `https://github.com/rw0104/DSH-desktop/releases/download/v${version}/${name}`,
    }],
  })
}

async function createHarness(overrides: Partial<DesktopUpdateAdapter> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-ui-'))
  roots.push(root)
  let tray: DesktopTrayItem | undefined
  const adapter: DesktopUpdateAdapter = {
    isPackaged: false,
    canDownload: true,
    currentVersion: '2.0.11',
    statePath: join(root, 'private', 'state.json'),
    request: async () => versionResponse('2.0.12'),
    confirmDownload: async () => true,
    showManualCheckResult: async () => {},
    showDownloadFailure: async () => {},
    downloadAndOpen: async () => {},
    notify: () => {},
    ...overrides,
  }
  const lifecycle = startDesktopUpdateLifecycle({
    adapter,
    policy: { enabled: false, initialDelayMs: 1, intervalMs: 1_000, requestTimeoutMs: 1_000 },
    locale: () => 'en',
    registerTrayItem: (item) => {
      tray = item
      return { refresh: vi.fn(), dispose: vi.fn() }
    },
  })
  if (tray === undefined) throw new Error('tray item not registered')
  const states: DesktopUpdateUiState[] = []
  const unsubscribe = lifecycle.subscribeUiState(state => { states.push(state) })
  return { adapter, lifecycle, states, tray, unsubscribe }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('desktop update Renderer state lifecycle', () => {
  it('publishes checking, availability, confirmation, and cancellation without starting a download', async () => {
    const confirmDownload = vi.fn(async () => false)
    const downloadAndOpen = vi.fn(async () => {})
    const harness = await createHarness({ confirmDownload, downloadAndOpen })

    await harness.lifecycle.checkNow()

    expect(harness.states.map(state => state.phase)).toEqual([
      'checking',
      'available',
      'awaiting-download-confirmation',
      'cancelled',
    ])
    expect(confirmDownload).toHaveBeenCalledWith('2.0.12')
    expect(downloadAndOpen).not.toHaveBeenCalled()
    await harness.lifecycle.dispose()
  })

  it('reports monotonic bytes, a separate verification phase, and verified readiness', async () => {
    const downloadAndOpen: DesktopUpdateAdapter['downloadAndOpen'] = async (_artifact, _signal, onProgress) => {
      onProgress?.({ phase: 'downloading', receivedBytes: 42, totalBytes: 100 })
      onProgress?.({ phase: 'downloading', receivedBytes: 100, totalBytes: 100 })
      onProgress?.({ phase: 'verifying', totalBytes: 100 })
      onProgress?.({ phase: 'ready-to-install' })
    }
    const harness = await createHarness({ downloadAndOpen })

    await harness.lifecycle.checkNow()

    const downloading = harness.states.filter((state): state is Extract<DesktopUpdateUiState, { phase: 'downloading' }> => state.phase === 'downloading')
    expect(downloading.map(state => state.receivedBytes)).toEqual([0, 42, 100])
    expect(harness.states.some(state => state.phase === 'verifying')).toBe(true)
    expect(harness.lifecycle.getUiState()).toMatchObject({
      phase: 'ready-to-install',
      version: '2.0.12',
    })
    expect(harness.states.every((state, index) => index === 0 || state.revision > harness.states[index - 1]!.revision))
      .toBe(true)
    await harness.lifecycle.dispose()
  })

  it('exposes only a bounded failure code and never a raw exception or path', async () => {
    const showDownloadFailure = vi.fn(async () => {})
    const failure = Object.assign(new Error('disk failed at C:\\Users\\Secret\\installer.exe'), { code: 'network' })
    const harness = await createHarness({
      showDownloadFailure,
      downloadAndOpen: async () => { throw failure },
    })

    await harness.lifecycle.checkNow()

    expect(harness.lifecycle.getUiState()).toMatchObject({ phase: 'failed', code: 'network' })
    expect(JSON.stringify(harness.lifecycle.getUiState())).not.toContain('Secret')
    expect(showDownloadFailure).toHaveBeenCalledOnce()
    await harness.lifecycle.dispose()
  })

  it('returns to idle after an up-to-date check', async () => {
    const showManualCheckResult = vi.fn(async () => {})
    const harness = await createHarness({
      request: async () => versionResponse('2.0.11'),
      showManualCheckResult,
    })

    await harness.lifecycle.checkNow()

    expect(harness.states.map(state => state.phase)).toEqual(['checking', 'idle'])
    expect(showManualCheckResult).toHaveBeenCalledOnce()
    await harness.lifecycle.dispose()
  })

  it('publishes cancellation and aborts a confirmed download on dispose', async () => {
    let downloadSignal: AbortSignal | undefined
    const harness = await createHarness({
      downloadAndOpen: async (_artifact, signal) => new Promise<void>((_resolve, reject) => {
        downloadSignal = signal
        signal.addEventListener('abort', () => {
          reject(new DOMException('cancelled', 'AbortError'))
        }, { once: true })
      }),
    })

    const pending = harness.lifecycle.checkNow()
    await vi.waitFor(() => { expect(downloadSignal).toBeDefined() })
    await harness.lifecycle.dispose()
    await pending

    expect(downloadSignal?.aborted).toBe(true)
    expect(harness.lifecycle.getUiState().phase).toBe('cancelled')
  })
})

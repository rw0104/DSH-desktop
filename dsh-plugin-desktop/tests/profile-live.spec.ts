import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { composeEntries, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import type { ChangeResult } from '@deepseek-ai/dsh-plugin-manager/types'
import { describe, expect, it, vi } from 'vitest'
import { createDesktopPluginManagerPolicy } from '../src/profile-live.ts'
import { DesktopInstallRecoveryStore, desktopInstallRecoveryStatePath } from '../src/install-recovery.ts'
import { prepareDesktopProfile } from '../src/profile.ts'

async function fixture(diagnostic = false) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-profile-live-'))
  const profileDir = join(root, 'profiles', 'desktop')
  await mkdir(profileDir, { recursive: true })
  await writeFile(join(profileDir, 'package.json'), '{"private":true}\n')
  await writeFile(join(profileDir, 'cordis.patch.yml'), '# original\n[]\n')
  const options = { statePath: desktopInstallRecoveryStatePath(join(root, 'user-data')), profileName: 'desktop', profileDir, generationId: 'live-generation-001' }
  const store = new DesktopInstallRecoveryStore(options)
  const restoreRuntime = vi.fn(async () => {})
  const policy = createDesktopPluginManagerPolicy({ diagnostic, store, protectedBundles: ['dsh-better-sidebar'], restoreRuntime })
  return { root, profileDir, store, options, policy, restoreRuntime }
}
const request = { stage: 'install' as const, target: 'test-plugin' }
const success: ChangeResult = { ...request, changed: true, application: 'applied' }

describe('official Plugin Manager Desktop transaction boundary', () => {
  it('seals the entire install including its user patch while already holding the official Profile lock', async () => {
    const f = await fixture()
    const result = await withFileLock(join(f.profileDir, 'package.json'), async () => f.policy.change('install', request, async () => {
      expect((await f.store.read())?.phase).toBe('prepared')
      await writeFile(join(f.profileDir, 'package.json'), '{"private":true,"dependencies":{"test-plugin":"1.0.0"}}\n')
      await writeFile(join(f.profileDir, 'cordis.patch.yml'), '- id: fixture\n  disabled: false\n')
      return success
    }))
    expect(result.application).toBe('restart-required')
    const sealed = await f.store.read()
    expect(sealed?.phase).toBe('awaiting-restart')
    expect(sealed?.files.find(file => file.name === 'cordis.patch.yml')?.after).toHaveProperty('sha256')
    const next = new DesktopInstallRecoveryStore({ ...f.options, generationId: 'next-generation-002' })
    expect((await next.claim()).action).toBe('verify')
    await next.markHealthy(sealed!.transactionId)
    expect((await next.read())?.phase).toBe('verified')
  })

  it.each(['failed', 'cancelled'] as const)('restores all declarations and live composition after %s', async application => {
    const f = await fixture()
    const result = await f.policy.change('install', request, async () => {
      await writeFile(join(f.profileDir, 'package.json'), '{"private":true,"partial":true}\n')
      await writeFile(join(f.profileDir, 'cordis.patch.yml'), '- id: fixture\n  disabled: true\n')
      return { ...success, application }
    })
    expect(result).toMatchObject({ application, changed: false })
    expect(await readFile(join(f.profileDir, 'package.json'), 'utf8')).toBe('{"private":true}\n')
    expect(await readFile(join(f.profileDir, 'cordis.patch.yml'), 'utf8')).toBe('# original\n[]\n')
    expect(f.restoreRuntime).toHaveBeenCalledOnce()
    expect(await f.store.read()).toBeUndefined()
  })

  it('refuses writes while another surface has a pending install', async () => {
    const f = await fixture()
    await f.store.begin({ packageName: 'market-plugin', packageVersion: '1.0.0', receiptId: 'market:receipt:001' })
    const mutate = vi.fn(async () => success)
    expect(await f.policy.change('plugin', request, mutate)).toMatchObject({ application: 'failed', changed: false })
    expect(mutate).not.toHaveBeenCalled()
    expect((await f.store.read())?.receiptId).toBe('market:receipt:001')
  })

  it('supports repeated live enable/disable operations without manufacturing install transactions', async () => {
    const f = await fixture()
    for (const reason of ['plugin', 'bundle', 'plugin']) {
      expect(await f.policy.change(reason, request, async () => success)).toEqual(success)
      expect(await f.store.read()).toBeUndefined()
    }
  })

  it('keeps diagnostic operations read-only without inspecting normal recovery state', async () => {
    const f = await fixture(true)
    const read = vi.spyOn(f.store, 'read')
    const mutate = vi.fn(async () => success)
    expect(await f.policy.change('install', request, mutate)).toMatchObject({ application: 'failed' })
    expect(read).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
    expect(f.policy.protectedPlugin('user-row', 'user-plugin')).toBe(true)
  })

  it('protects the desktop carrier and required bundles without disabling ordinary plugin management', async () => {
    const f = await fixture()
    expect(f.policy.protectedPlugin('webserver', '@deepseek-ai/dsh-host-webserver')).toBe(true)
    expect(f.policy.protectedPlugin('custom-id', 'dsh-plugin-desktop')).toBe(true)
    expect(f.policy.protectedBundle('dsh-better-sidebar')).toBe(true)
    expect(f.policy.protectedPlugin('my-plugin', 'test-plugin')).toBe(false)
    expect(f.policy.protectedBundle('test-plugin')).toBe(false)
  })

  it('uses launcher recomposition on every read without duplicating bundle inserts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-profile-live-composition-'))
    const compose = () => prepareDesktopProfile('1', root, 'win32', 'desktop', undefined, { mode: 'advanced' })
    const prepared = compose()
    const context = { name: 'desktop', dir: prepared.profile.dir, patchPath: prepared.profile.patchPath,
      installAnchor: '', cwd: prepared.profile.dir, home: root, startedBundles: [], overlays: [], telemetryDisabledEnv: '1',
      composePatches: () => compose().patches }
    await writeFile(prepared.profile.patchPath, '- id: webserver\n  config: {host: "0.0.0.0", port: 9876}\n')
    const rows = composeEntries([readProfilePatches('fixture', context)])
    expect(rows.filter(row => row.id === 'desktop-shell')).toHaveLength(1)
    expect(rows.find(row => row.id === 'webserver')?.config).toMatchObject({ host: '127.0.0.1', port: 0 })
    expect(rows.find(row => row.id === 'ui-layout')?.disabled).toBe(true)
  })
})

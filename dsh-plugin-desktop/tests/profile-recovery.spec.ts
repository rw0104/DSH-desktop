import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  captureProfileSnapshot,
  restoreProfileSnapshot,
  DesktopRecoveryService,
} from '../src/profile-recovery.ts'

describe('profile recovery assistant', () => {
  it('captures and restores only the active profile manifest', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-profile-recovery-'))
    const profile = join(home, 'profiles', 'desktop')
    try {
      mkdirSync(profile, { recursive: true })
      const manifest = join(profile, 'package.json')
      writeFileSync(manifest, '{"bundles":["safe"]}\n', 'utf8')
      const snapshot = captureProfileSnapshot(home, 'desktop', new Date('2026-08-19T12:00:00.000Z'))
      writeFileSync(manifest, '{"bundles":["broken"]}\n', 'utf8')
      expect(restoreProfileSnapshot(home, 'desktop')).toEqual(snapshot)
      expect(readFileSync(manifest, 'utf8')).toBe('{"bundles":["safe"]}\n')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('exposes snapshot status and requests restart only after restore', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-profile-recovery-service-'))
    try {
      const profiles = { current: { name: 'desktop', dir: join(home, 'profiles', 'desktop') }, list: () => [] } as any
      const runtime = { requestRestart: vi.fn(async () => {}) } as any
      const service = new DesktopRecoveryService({ homeDir: home } as any, profiles, runtime)
      expect(service.status()).toMatchObject({ profileName: 'desktop', available: false })
      mkdirSync(join(home, 'profiles', 'desktop'), { recursive: true })
      writeFileSync(join(home, 'profiles', 'desktop', 'package.json'), '{"bundles":[]}\n', 'utf8')
      service.captureHealthy()
      expect(service.status()).toMatchObject({ available: true })
      await service.restore()
      expect(runtime.requestRestart).toHaveBeenCalledOnce()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

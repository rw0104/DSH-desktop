import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { DesktopProfiles } from './profile-service.ts'
import type { DesktopPnpmBootstrap } from './pnpm.ts'
import type { DesktopRuntime } from './runtime.ts'
import { assertDesktopProfileName } from './profile-manager.ts'

const SNAPSHOT_FILENAME = 'profile-package.json'
const META_FILENAME = 'snapshot.json'
const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600

export interface DesktopRecoverySnapshot {
  readonly profileName: string
  readonly sourcePath: string
  readonly snapshotPath: string
  readonly createdAt: string
}

export interface DesktopRecoveryStatus {
  readonly profileName: string
  readonly available: boolean
  readonly snapshot?: DesktopRecoverySnapshot
}

/** Private profile manifest snapshot used by the recovery assistant. */
export class DesktopRecoveryService {
  private disposed = false

  constructor(
    private readonly bootstrap: DesktopPnpmBootstrap,
    private readonly profiles: DesktopProfiles,
    private readonly runtime: DesktopRuntime,
  ) {}

  status(): DesktopRecoveryStatus {
    this.assertLive()
    const profileName = this.profiles.current.name
    const snapshot = readSnapshot(snapshotDirectory(this.bootstrap.homeDir, profileName))
    return snapshot === undefined ? { profileName, available: false } : { profileName, available: true, snapshot }
  }

  /** Capture the current profile after a successful interactive startup. */
  captureHealthy(): DesktopRecoverySnapshot {
    this.assertLive()
    return captureProfileSnapshot(this.bootstrap.homeDir, this.profiles.current.name)
  }

  /** Restore the last healthy manifest and request an orderly restart. */
  async restore(): Promise<DesktopRecoverySnapshot> {
    this.assertLive()
    const snapshot = restoreProfileSnapshot(this.bootstrap.homeDir, this.profiles.current.name)
    await this.runtime.requestRestart()
    return snapshot
  }

  dispose(): void { this.disposed = true }

  private assertLive(): void {
    if (this.disposed) throw new Error('profile-recovery-disposed')
  }
}

export function captureProfileSnapshot(homeDir: string, profileName: string, now = new Date()): DesktopRecoverySnapshot {
  assertDesktopProfileName(profileName)
  const sourcePath = join(homeDir, 'profiles', profileName, 'package.json')
  assertRegularFile(sourcePath, 'profile manifest')
  const directory = snapshotDirectory(homeDir, profileName)
  ensurePrivateDirectory(directory)
  const snapshotPath = join(directory, SNAPSHOT_FILENAME)
  const temporary = `${snapshotPath}.${process.pid}.tmp`
  copyFileSync(sourcePath, temporary)
  chmodPrivateFile(temporary)
  renameSync(temporary, snapshotPath)
  const snapshot: DesktopRecoverySnapshot = { profileName, sourcePath, snapshotPath, createdAt: now.toISOString() }
  writeFileSync(join(directory, META_FILENAME), `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', mode: FILE_MODE })
  chmodPrivateFile(join(directory, META_FILENAME))
  return snapshot
}

export function restoreProfileSnapshot(homeDir: string, profileName: string): DesktopRecoverySnapshot {
  assertDesktopProfileName(profileName)
  const directory = snapshotDirectory(homeDir, profileName)
  const snapshot = readSnapshot(directory)
  if (snapshot === undefined) throw new Error('profile-recovery-snapshot-not-found')
  const expectedSnapshotPath = join(directory, SNAPSHOT_FILENAME)
  if (snapshot.profileName !== profileName || snapshot.snapshotPath !== expectedSnapshotPath) {
    throw new Error('profile-recovery-snapshot-metadata-invalid')
  }
  assertRegularFile(expectedSnapshotPath, 'recovery snapshot')
  const target = join(homeDir, 'profiles', profileName, 'package.json')
  assertRegularFile(target, 'profile manifest')
  const temporary = `${target}.${process.pid}.recovery.tmp`
  copyFileSync(expectedSnapshotPath, temporary)
  chmodPrivateFile(temporary)
  renameSync(temporary, target)
  return snapshot
}

function snapshotDirectory(homeDir: string, profileName: string): string {
  return join(homeDir, 'desktop-recovery', profileName)
}

function readSnapshot(directory: string): DesktopRecoverySnapshot | undefined {
  const metadata = join(directory, META_FILENAME)
  if (!existsSync(metadata)) return undefined
  try {
    const value = JSON.parse(readFileSync(metadata, 'utf8')) as Partial<DesktopRecoverySnapshot>
    if (typeof value.profileName !== 'string' || typeof value.sourcePath !== 'string' || typeof value.snapshotPath !== 'string' || typeof value.createdAt !== 'string') return undefined
    return value as DesktopRecoverySnapshot
  } catch {
    return undefined
  }
}

function ensurePrivateDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE })
  try { chmodSync(directory, DIRECTORY_MODE) } catch { /* Windows ACLs provide the effective boundary. */ }
  if (lstatSync(directory).isSymbolicLink()) throw new Error('profile recovery directory must not be a symlink')
}

function assertRegularFile(path: string, label: string): void {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`)
}

function chmodPrivateFile(path: string): void {
  try { chmodSync(path, FILE_MODE) } catch { /* Windows ACLs provide the effective boundary. */ }
}

export const name = 'desktop-recovery'
export const inject = ['desktopPnpmBootstrap', 'desktopProfiles', 'desktopRuntime']

export function apply(ctx: Context): void {
  const service = new DesktopRecoveryService(ctx.desktopPnpmBootstrap, ctx.desktopProfiles, ctx.desktopRuntime)
  const disposeService = ctx.provide('desktopRecovery', service)
  ctx.effect(() => {
    const registration = ctx.desktopRuntime.registerTrayItem({
      group: 'tools',
      order: 30,
      label: () => 'Recovery assistant',
      invoke: () => { void service.restore().catch(() => {}) },
      submenu: () => [
        {
          label: () => service.status().available ? 'Restore last healthy profile' : 'No recovery snapshot',
          enabled: () => service.status().available,
          invoke: async () => { await service.restore() },
        },
        {
          label: () => 'Create recovery snapshot',
          invoke: () => { service.captureHealthy() },
        },
      ],
    })
    return () => {
      registration.dispose()
      service.dispose()
      void disposeService()
    }
  }, 'dsh-plugin-desktop: profile recovery assistant')
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopRecovery: DesktopRecoveryService
  }
}

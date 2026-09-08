import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  desktopProfilePreferencesProfileHash,
  desktopProfilePreferencesStatePath,
  desktopPresentationPreferencesStatePath,
  readDesktopProfilePreferences,
  reconcileDesktopProfilePreferences,
  writeDesktopProfilePreferences,
} from '../src/profile-preferences.ts'

const temporaryDirectories: string[] = []
const preferences = { mode: 'compatibility' as const, port: 43120, logLevel: 'info' as const }
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')
const previousVersion = await vi.importActual<{
  readDesktopProfilePreferences(userData: string, profile: string): unknown
  writeDesktopProfilePreferences(userData: string, profile: string, preferences: { mode: 'advanced' | 'compatibility'; port: number; logLevel: string }): Promise<unknown>
}>('./fixtures/profile-preferences-v1.mjs')

function temporaryDirectory(label: string): string {
  const directory = mkdtempSync(join(tmpdir(), label))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  vi.mocked(renameSync).mockImplementation(actualFs.renameSync)
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Desktop Profile preferences', () => {
  it('round-trips through the actual 2.2.7 reader and writer when downgraded and upgraded again', async () => {
    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profile = temporaryDirectory('dsh-profile-preferences-profile-')
    await writeDesktopProfilePreferences(userData, profile, { ...preferences, windowStyle: 'native' })
    expect(previousVersion.readDesktopProfilePreferences(userData, profile)).toMatchObject({ version: 1, mode: 'advanced', port: preferences.port })
    await previousVersion.writeDesktopProfilePreferences(userData, profile, { mode: 'compatibility', port: 43177, logLevel: 'warn' })
    const recovered = readDesktopProfilePreferences(userData, profile)!
    expect(recovered).toMatchObject({ version: 1, windowStyle: 'system', port: 43177, logLevel: 'warn' })
    await writeDesktopProfilePreferences(userData, profile, recovered)
    expect(readDesktopProfilePreferences(userData, profile)).toMatchObject({ version: 2, windowStyle: 'system', port: 43177 })
  })
  it('recovers faults before either atomic commit without losing the last complete preference', async () => {
    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profile = temporaryDirectory('dsh-profile-preferences-profile-')
    await writeDesktopProfilePreferences(userData, profile, preferences)
    const legacyPath = desktopProfilePreferencesStatePath(userData, profile)
    const before = readFileSync(legacyPath, 'utf8')
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error('fixture before v1 commit') })
    await expect(writeDesktopProfilePreferences(userData, profile, { ...preferences, windowStyle: 'native' })).rejects.toThrow('before v1')
    expect(readFileSync(legacyPath, 'utf8')).toBe(before)
    expect(readDesktopProfilePreferences(userData, profile)).toMatchObject({ version: 2, windowStyle: 'system' })
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(to).endsWith('presentation-v2.json')) throw new Error('fixture before v2 commit')
      actualFs.renameSync(from, to)
    })
    await expect(writeDesktopProfilePreferences(userData, profile, { ...preferences, windowStyle: 'native' })).rejects.toThrow('before v2')
    expect(readDesktopProfilePreferences(userData, profile)).toMatchObject({ version: 1, windowStyle: 'native' })
    vi.mocked(renameSync).mockImplementation(actualFs.renameSync)
    await writeDesktopProfilePreferences(userData, profile, readDesktopProfilePreferences(userData, profile)!)
    expect(readDesktopProfilePreferences(userData, profile)).toMatchObject({ version: 2, windowStyle: 'native' })
  })
  it('migrates an old record once and keeps its exact schema usable by an older executable', async () => {
    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profile = temporaryDirectory('dsh-profile-preferences-profile-')
    const path = desktopProfilePreferencesStatePath(userData, profile)
    mkdirSync(resolve(path, '..'), { recursive: true })
    const old = { version: 1, profileHash: desktopProfilePreferencesProfileHash(profile), mode: 'advanced', port: 43121, logLevel: 'debug', recordedAt: '2026-09-07T00:00:00.000Z' }
    writeFileSync(path, JSON.stringify(old))
    const initial = readDesktopProfilePreferences(userData, profile)!
    expect(initial).toMatchObject({ version: 1, windowStyle: 'native' })
    expect(reconcileDesktopProfilePreferences(initial, preferences).persistPrivate).toBe(true)
    await writeDesktopProfilePreferences(userData, profile, initial)
    const migrated = readDesktopProfilePreferences(userData, profile)!
    expect(migrated).toMatchObject({ version: 2, windowStyle: 'native', mode: 'advanced', port: old.port, logLevel: old.logLevel })
    const legacyMirror = JSON.parse(readFileSync(path, 'utf8'))
    expect(Object.keys(legacyMirror).sort()).toEqual(Object.keys(old).sort())
    expect(legacyMirror.version).toBe(1)
    expect(reconcileDesktopProfilePreferences(migrated, { ...preferences, mode: 'advanced', windowStyle: 'native', port: 43121, logLevel: 'debug' })).toMatchObject({ persistPrivate: false, synchronizeShared: false })
  })

  it('recovers a validated legacy write after a downgrade or interruption between migration writes', async () => {
    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profile = temporaryDirectory('dsh-profile-preferences-profile-')
    await writeDesktopProfilePreferences(userData, profile, { ...preferences, windowStyle: 'native' })
    const path = desktopProfilePreferencesStatePath(userData, profile)
    const legacy = JSON.parse(readFileSync(path, 'utf8'))
    writeFileSync(path, JSON.stringify({ ...legacy, mode: 'compatibility', port: 43128 }))
    const recovered = readDesktopProfilePreferences(userData, profile)!
    expect(recovered).toMatchObject({ version: 1, windowStyle: 'system', mode: 'compatibility', port: 43128 })
    await writeDesktopProfilePreferences(userData, profile, recovered)
    expect(readDesktopProfilePreferences(userData, profile)).toMatchObject({ version: 2, windowStyle: 'system', port: 43128 })
  })

  it('rejects a corrupted or linked v2 record and does not overwrite its target', async () => {
    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profile = temporaryDirectory('dsh-profile-preferences-profile-')
    await writeDesktopProfilePreferences(userData, profile, preferences)
    const path = desktopPresentationPreferencesStatePath(userData, profile)
    writeFileSync(path, '{}')
    expect(() => readDesktopProfilePreferences(userData, profile)).toThrow('invalid presentation')
    const target = join(temporaryDirectory('dsh-profile-preferences-target-'), 'untouched.json')
    writeFileSync(target, 'untouched')
    rmSync(path)
    symlinkSync(target, path)
    await expect(writeDesktopProfilePreferences(userData, profile, preferences)).rejects.toThrow('regular file')
    expect(readFileSync(target, 'utf8')).toBe('untouched')
  })

  it('isolates mode, port, and log level by canonical Profile directory hash', async () => {
    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profiles = temporaryDirectory('dsh-profile-preferences-profiles-')
    const work = join(profiles, 'work')
    const personal = join(profiles, 'personal')
    mkdirSync(work)
    mkdirSync(personal)

    expect(desktopProfilePreferencesProfileHash(work)).toBe(
      desktopProfilePreferencesProfileHash(resolve(work)),
    )
    await writeDesktopProfilePreferences(userData, work, preferences)
    await writeDesktopProfilePreferences(userData, personal, { mode: 'advanced', port: 43121, logLevel: 'debug' })

    expect(readDesktopProfilePreferences(userData, work)).toMatchObject(preferences)
    expect(readDesktopProfilePreferences(userData, personal)).toMatchObject({ mode: 'advanced', port: 43121, logLevel: 'debug' })
    expect(desktopProfilePreferencesStatePath(userData, work)).not.toBe(desktopProfilePreferencesStatePath(userData, personal))
  })

  it('writes a bounded atomic state and rejects malformed or symlink state', async () => {
    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profile = temporaryDirectory('dsh-profile-preferences-profile-')
    await writeDesktopProfilePreferences(userData, profile, preferences)
    const path = desktopProfilePreferencesStatePath(userData, profile)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject(preferences)

    writeFileSync(path, '{broken}\n')
    expect(() => readDesktopProfilePreferences(userData, profile)).toThrow('valid JSON')

    const outside = join(temporaryDirectory('dsh-profile-preferences-outside-'), 'outside.json')
    writeFileSync(outside, 'outside\n')
    rmSync(path)
    symlinkSync(outside, path)
    expect(() => readDesktopProfilePreferences(userData, profile)).toThrow('regular file')
  })

  it('repairs private POSIX file mode without changing the state contract', async () => {
    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profile = temporaryDirectory('dsh-profile-preferences-profile-')
    await writeDesktopProfilePreferences(userData, profile, preferences)
    const path = desktopProfilePreferencesStatePath(userData, profile)
    if (process.platform !== 'win32') {
      chmodSync(path, 0o644)
      expect(readDesktopProfilePreferences(userData, profile)).toMatchObject(preferences)
    }
  })

  it('imports shared settings once and synchronizes existing Profile values back to the settings service', async () => {
    expect(reconcileDesktopProfilePreferences(undefined, preferences)).toEqual({
      preferences: { ...preferences, windowStyle: 'system' },
      synchronizeShared: true,
      persistPrivate: true,
    })

    const userData = temporaryDirectory('dsh-profile-preferences-user-')
    const profile = temporaryDirectory('dsh-profile-preferences-profile-')
    const stored = await writeDesktopProfilePreferences(userData, profile, {
      mode: 'advanced',
      port: 43121,
      logLevel: 'debug',
    })
    expect(reconcileDesktopProfilePreferences(stored, preferences)).toEqual({
      preferences: { mode: 'advanced', windowStyle: 'native', port: 43121, logLevel: 'debug' },
      synchronizeShared: true,
      persistPrivate: false,
    })
  })
})

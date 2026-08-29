import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  desktopProfilePreferencesProfileHash,
  desktopProfilePreferencesStatePath,
  readDesktopProfilePreferences,
  reconcileDesktopProfilePreferences,
  writeDesktopProfilePreferences,
} from '../src/profile-preferences.ts'

const temporaryDirectories: string[] = []
const preferences = { mode: 'compatibility' as const, port: 43120, logLevel: 'info' as const }

function temporaryDirectory(label: string): string {
  const directory = mkdtempSync(join(tmpdir(), label))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Desktop Profile preferences', () => {
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
      preferences,
      synchronizeShared: false,
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
      preferences: { mode: 'advanced', port: 43121, logLevel: 'debug' },
      synchronizeShared: true,
      persistPrivate: false,
    })
  })
})

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyWindowsInstaller } from '../scripts/verify-win-installer.ts'

const temporaryRoots: string[] = []

function portableExecutable(): Buffer {
  const executable = Buffer.alloc(132)
  executable.write('MZ', 0, 'ascii')
  executable.writeUInt32LE(128, 0x3c)
  executable.write('PE\0\0', 128, 'binary')
  return executable
}

function fixture(version = '2.0.0'): {
  readonly root: string
  readonly setupInstaller: string
  readonly updateInstaller: string
  readonly updateBlockmap: string
  readonly latestMetadata: string
  readonly application: string
} {
  const root = mkdtempSync(join(tmpdir(), 'dsh-win-installer-'))
  temporaryRoots.push(root)
  const dist = join(root, 'dist')
  const unpacked = join(dist, 'win-unpacked')
  mkdirSync(unpacked, { recursive: true })
  const setupInstaller = join(dist, `DSH-Desktop-${version}-x64-Setup.exe`)
  const updateInstaller = join(dist, `DSH-Desktop-${version}-x64-Update.exe`)
  const updateBlockmap = `${updateInstaller}.blockmap`
  const latestMetadata = join(dist, 'latest.yml')
  const application = join(unpacked, 'DSH Desktop.exe')
  writeFileSync(setupInstaller, portableExecutable())
  writeFileSync(updateInstaller, portableExecutable())
  writeFileSync(updateBlockmap, Buffer.from('blockmap'))
  writeFileSync(latestMetadata, [
    `version: ${version}`,
    'files:',
    `  - url: DSH-Desktop-${version}-x64-Update.exe`,
    '    sha512: fixture',
    '    size: 132',
    `path: DSH-Desktop-${version}-x64-Update.exe`,
    'sha512: fixture',
    'releaseDate: 2026-08-18T00:00:00.000Z',
    '',
  ].join('\n'))
  writeFileSync(application, portableExecutable())
  return {
    root,
    setupInstaller,
    updateInstaller,
    updateBlockmap,
    latestMetadata,
    application,
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Windows installer artifact verification', () => {
  it('accepts fast Setup, differential Update metadata, and the unpacked application', () => {
    const value = fixture()

    expect(verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' })).toEqual({
      setupInstallerPath: value.setupInstaller,
      updateInstallerPath: value.updateInstaller,
      updateBlockmapPath: value.updateBlockmap,
      latestMetadataPath: value.latestMetadata,
      applicationPath: value.application,
    })
  })

  it('rejects a stale installer from a different version', () => {
    const value = fixture('1.9.0')

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('DSH-Desktop-2.0.0-x64-Setup.exe')
  })

  it('rejects an artifact without a Windows PE header', () => {
    const value = fixture()
    const invalid = portableExecutable()
    invalid.write('NO', 0, 'ascii')
    writeFileSync(value.setupInstaller, invalid)

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have a Windows PE header')
  })

  it('rejects a stale Setup blockmap because only Update may be differential', () => {
    const value = fixture()
    writeFileSync(`${value.setupInstaller}.blockmap`, Buffer.from('stale'))

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('fast Setup installer unexpectedly has a blockmap')
  })

  it('rejects a missing Update blockmap', () => {
    const value = fixture()
    rmSync(value.updateBlockmap)

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('Update blockmap')
  })

  it('rejects latest.yml when it points users at Setup instead of Update', () => {
    const value = fixture()
    writeFileSync(value.latestMetadata, [
      'version: 2.0.0',
      'path: DSH-Desktop-2.0.0-x64-Setup.exe',
      '',
    ].join('\n'))

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('latest.yml must point to DSH-Desktop-2.0.0-x64-Update.exe')
  })

  it('rejects an unpacked application without a Windows PE signature', () => {
    const value = fixture()
    const invalid = portableExecutable()
    invalid.fill(0, 128, 132)
    writeFileSync(value.application, invalid)

    expect(() => verifyWindowsInstaller({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have a Windows PE signature')
  })
})

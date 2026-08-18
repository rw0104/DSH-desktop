import { describe, expect, it } from 'vitest'
import {
  packageWindowsInstaller,
  type WindowsPackageOptions,
} from '../scripts/package-win.ts'

interface CommandCall {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
}

function options(calls: CommandCall[], logs: string[] = []): WindowsPackageOptions {
  return {
    env: {
      PATH: 'C:\\Windows\\System32',
      SAFE_VALUE: 'kept',
      CSC_LINK: 'private-generic-certificate',
      csc_key_password: 'private-generic-password',
      win_csc_link: 'C:\\private\\publisher.pfx',
      WIN_CSC_KEY_PASSWORD: 'private-windows-password',
    },
    platform: 'win32',
    arch: 'x64',
    nodeVersion: '22.23.2',
    version: '2.0.0',
    workspaceRoot: 'C:\\repo',
    desktopRoot: 'C:\\repo\\dsh-plugin-desktop',
    commandShell: 'C:\\Windows\\System32\\cmd.exe',
    builderCli: 'C:\\repo\\node_modules\\electron-builder\\cli.js',
    verifier: 'C:\\repo\\dsh-plugin-desktop\\scripts\\verify-win-installer.ts',
    nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
    removeArtifact: () => {},
    run: (command, args, cwd, env) => {
      calls.push({ command, args: [...args], cwd, env: { ...env } })
    },
    log: message => logs.push(message),
  }
}

describe('Windows x64 installer packaging', () => {
  it('checks without credentials, builds fast Setup and differential Update targets, then verifies them', () => {
    const calls: CommandCall[] = []
    const logs: string[] = []
    const removed: string[] = []

    packageWindowsInstaller({
      ...options(calls, logs),
      removeArtifact: path => { removed.push(path) },
    })

    expect(removed).toEqual([
      'C:\\repo\\dsh-plugin-desktop\\dist\\DSH-Desktop-2.0.0-x64-Setup.exe',
      'C:\\repo\\dsh-plugin-desktop\\dist\\DSH-Desktop-2.0.0-x64-Setup.exe.blockmap',
      'C:\\repo\\dsh-plugin-desktop\\dist\\DSH-Desktop-2.0.0-x64-Update.exe',
      'C:\\repo\\dsh-plugin-desktop\\dist\\DSH-Desktop-2.0.0-x64-Update.exe.blockmap',
      'C:\\repo\\dsh-plugin-desktop\\dist\\latest.yml',
    ])
    expect(calls).toHaveLength(4)
    expect(calls[0]).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        'corepack yarn workspace dsh-plugin-desktop check:win-package',
      ],
      cwd: 'C:\\repo',
      env: { PATH: 'C:\\Windows\\System32', SAFE_VALUE: 'kept' },
    })
    expect(calls[1]).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: [
        'C:\\repo\\node_modules\\electron-builder\\cli.js',
        '--win',
        'nsis',
        '--x64',
        '--publish',
        'never',
        '--config.win.signExecutable=false',
        '--config.npmRebuild=false',
      ],
      cwd: 'C:\\repo\\dsh-plugin-desktop',
      env: {
        PATH: 'C:\\Windows\\System32',
        SAFE_VALUE: 'kept',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    })
    expect(calls[2]).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: [
        'C:\\repo\\node_modules\\electron-builder\\cli.js',
        '--win',
        'nsis',
        '--x64',
        '--publish',
        'never',
        '--prepackaged',
        'C:\\repo\\dsh-plugin-desktop\\dist\\win-unpacked',
        '--config.win.signExecutable=false',
        '--config.npmRebuild=false',
        '--config.nsis.differentialPackage=true',
        '--config.nsis.useZip=false',
        '--config.nsis.artifactName=DSH-Desktop-${version}-${arch}-Update.${ext}',
      ],
      cwd: 'C:\\repo\\dsh-plugin-desktop',
      env: {
        PATH: 'C:\\Windows\\System32',
        SAFE_VALUE: 'kept',
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    })
    expect(calls[3]).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\repo\\dsh-plugin-desktop\\scripts\\verify-win-installer.ts'],
      cwd: 'C:\\repo\\dsh-plugin-desktop',
      env: { PATH: 'C:\\Windows\\System32', SAFE_VALUE: 'kept' },
    })
    expect(logs).toEqual([
      'Building unsigned Windows x64 Setup and Update installers; Authenticode is a separate release step.',
    ])
  })

  it.each([
    ['darwin', 'x64', '22.23.2', 'native Windows host'],
    ['win32', 'arm64', '22.23.2', 'requires x64 Node'],
    ['win32', 'x64', '25.0.0', 'Node 22.19+ or Node 24.x'],
  ] as const)(
    'rejects unsupported host %s/%s with Node %s before running commands',
    (platform, arch, nodeVersion, message) => {
    const calls: CommandCall[] = []
      const value = { ...options(calls), platform, arch, nodeVersion }

      expect(() => packageWindowsInstaller(value)).toThrow(message)
      expect(calls).toEqual([])
    },
  )

  it('stops before packaging when the headless check fails', () => {
    const calls: CommandCall[] = []
    const value: WindowsPackageOptions = {
      ...options(calls),
      run: (command, args, cwd, env) => {
        calls.push({ command, args: [...args], cwd, env: { ...env } })
        throw new Error('headless check failed')
      },
    }

    expect(() => packageWindowsInstaller(value)).toThrow('headless check failed')
    expect(calls).toHaveLength(1)
  })
})

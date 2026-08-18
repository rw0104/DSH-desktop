/** Build an unsigned Windows x64 NSIS installer on a native Windows host. */

import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const WINDOWS_SIGNING_KEYS = [
  'CSC_IDENTITY_AUTO_DISCOVERY',
  'CSC_KEY_PASSWORD',
  'CSC_LINK',
  'CSC_NAME',
  'WIN_CSC_KEY_PASSWORD',
  'WIN_CSC_LINK',
] as const

/** Injectable native Windows packaging boundary used by focused tests. */
export interface WindowsPackageOptions {
  /** Environment inherited by the packaging command. */
  readonly env: NodeJS.ProcessEnv
  /** Platform executing the package build. */
  readonly platform: NodeJS.Platform
  /** Node architecture executing the package build. */
  readonly arch: string
  /** Node version executing the package build. */
  readonly nodeVersion: string
  /** Product version used to remove exact stale release artifacts. */
  readonly version: string
  /** Repository root containing the Yarn workspace. */
  readonly workspaceRoot: string
  /** Desktop package root containing electron-builder configuration. */
  readonly desktopRoot: string
  /** Absolute native Windows command interpreter. */
  readonly commandShell: string
  /** Absolute electron-builder CLI module. */
  readonly builderCli: string
  /** Absolute packaged-installer verification script. */
  readonly verifier: string
  /** Node executable used to run package-local scripts. */
  readonly nodeExecutable: string
  /** Remove one exact versioned artifact before packaging. */
  readonly removeArtifact: (path: string) => void
  /** Execute one packaging command. */
  readonly run: (
    command: string,
    args: readonly string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) => void
  /** Report non-secret packaging progress. */
  readonly log: (message: string) => void
}

/**
 * Remove all certificate discovery and secret variables from an unsigned build.
 * @param environment - Environment that may contain Windows signing configuration.
 * @returns A copy suitable for checks and unsigned packaging.
 */
export function withoutWindowsSigningSecrets(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const sanitized = { ...environment }
  const signingKeys = new Set<string>(WINDOWS_SIGNING_KEYS)
  for (const key of Object.keys(sanitized)) {
    if (signingKeys.has(key.toUpperCase())) delete sanitized[key]
  }
  return sanitized
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

function defaultOptions(): WindowsPackageOptions {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const workspaceRoot = resolve(desktopRoot, '..')
  const require = createRequire(import.meta.url)
  const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`desktop package at ${desktopRoot} has no valid version`)
  }
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR
  return {
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    version: manifest.version,
    workspaceRoot,
    desktopRoot,
    commandShell: windowsRoot === undefined || windowsRoot.length === 0
      ? 'cmd.exe'
      : join(windowsRoot, 'System32', 'cmd.exe'),
    builderCli: require.resolve('electron-builder/cli.js'),
    verifier: fileURLToPath(new URL('./verify-win-installer.ts', import.meta.url)),
    nodeExecutable: process.execPath,
    removeArtifact: path => { rmSync(path, { force: true }) },
    run,
    log: message => console.log(message),
  }
}

/**
 * Run the headless release gates and package fast Setup plus differential Update installers.
 * @param options - Injectable process and command boundaries.
 */
export function packageWindowsInstaller(
  options: WindowsPackageOptions = defaultOptions(),
): void {
  if (options.platform !== 'win32') {
    throw new Error('Windows installer must be built on a native Windows host')
  }
  if (options.arch !== 'x64') {
    throw new Error(`Windows installer requires x64 Node; received ${options.arch}`)
  }
  const versionMatch = /^(\d+)\.(\d+)\./u.exec(options.nodeVersion)
  const major = Number(versionMatch?.[1])
  const minor = Number(versionMatch?.[2])
  if (!((major === 22 && minor >= 19) || major === 24)) {
    throw new Error(
      `Windows installer requires Node 22.19+ or Node 24.x with bundled Corepack; received ${options.nodeVersion}`,
    )
  }

  const cleanEnvironment = withoutWindowsSigningSecrets(options.env)
  const distDir = win32.join(options.desktopRoot, 'dist')
  for (const artifact of [
    `DSH-Desktop-${options.version}-x64-Setup.exe`,
    `DSH-Desktop-${options.version}-x64-Setup.exe.blockmap`,
    `DSH-Desktop-${options.version}-x64-Update.exe`,
    `DSH-Desktop-${options.version}-x64-Update.exe.blockmap`,
    'latest.yml',
  ]) options.removeArtifact(win32.join(distDir, artifact))

  options.log(
    'Building unsigned Windows x64 Setup and Update installers; Authenticode is a separate release step.',
  )
  options.run(
    options.commandShell,
    [
      '/d',
      '/s',
      '/c',
      'corepack yarn workspace dsh-plugin-desktop check:win-package',
    ],
    options.workspaceRoot,
    cleanEnvironment,
  )
  options.run(
    options.nodeExecutable,
    [
      options.builderCli,
      '--win',
      'nsis',
      '--x64',
      '--publish',
      'never',
      '--config.win.signExecutable=false',
      '--config.npmRebuild=false',
    ],
    options.desktopRoot,
    {
      ...cleanEnvironment,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  )
  options.run(
    options.nodeExecutable,
    [
      options.builderCli,
      '--win',
      'nsis',
      '--x64',
      '--publish',
      'never',
      '--prepackaged',
      win32.join(options.desktopRoot, 'dist', 'win-unpacked'),
      '--config.win.signExecutable=false',
      '--config.npmRebuild=false',
      '--config.nsis.differentialPackage=true',
      '--config.nsis.useZip=false',
      '--config.nsis.artifactName=DSH-Desktop-${version}-${arch}-Update.${ext}',
    ],
    options.desktopRoot,
    {
      ...cleanEnvironment,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  )
  options.run(
    options.nodeExecutable,
    [options.verifier],
    options.desktopRoot,
    cleanEnvironment,
  )
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    packageWindowsInstaller()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

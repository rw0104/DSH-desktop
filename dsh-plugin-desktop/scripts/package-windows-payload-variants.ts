/** Build three NSIS payload strategies from one verified win-unpacked tree. */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  windowsPayloadBuilderArgs,
  type WindowsPayloadStrategy,
} from './package-win.ts'
import { verifyWindowsInstaller } from './verify-win-installer.ts'

const STRATEGIES: readonly WindowsPayloadStrategy[] = ['zip-direct', '7z-staged', '7z-in-place']

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
}

/** Build all strategies without rebuilding or changing their shared payload. */
export function packageWindowsPayloadVariants(): void {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Windows payload variants require native Windows x64')
  }
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const prepackaged = join(desktopRoot, 'dist', 'win-unpacked')
  if (!existsSync(join(prepackaged, 'DSH Desktop.exe'))) {
    throw new Error(`verified prepackaged application is missing: ${prepackaged}`)
  }
  const require = createRequire(import.meta.url)
  const builderCli = require.resolve('electron-builder/cli.js')
  const builderConfig = fileURLToPath(new URL('./electron-builder.config.mjs', import.meta.url))
  const version: unknown = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')).version
  if (typeof version !== 'string' || version.length === 0) throw new Error('desktop package version is invalid')
  for (const strategy of STRATEGIES) {
    const strategyArgs = strategy === 'zip-direct'
      ? [
          '--config.nsis.useZip=true',
          '--config.nsis.artifactName=DSH-Desktop-${version}-${arch}-Setup-zip-direct.${ext}',
        ]
      : [...windowsPayloadBuilderArgs(strategy)]
    run(process.execPath, [
      builderCli,
      '--config',
      builderConfig,
      '--win',
      'nsis',
      '--x64',
      '--prepackaged',
      prepackaged,
      '--publish',
      'never',
      '--config.win.signExecutable=false',
      '--config.npmRebuild=false',
      ...strategyArgs,
    ], desktopRoot, {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      DSH_WINDOWS_PAYLOAD_STRATEGY: strategy,
    })
    verifyWindowsInstaller({ desktopRoot, version, artifactSuffix: strategy })
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    packageWindowsPayloadVariants()
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  }
}

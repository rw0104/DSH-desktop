/** Build a measurable baseline installer from the released v2.0.15 payload. */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LEGACY_VERSION = '2.0.15'

/** Return the fixed artifact name used to identify the normalized baseline. */
export function legacyBaselineArtifactName(version = LEGACY_VERSION) {
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/u.test(version)) {
    throw new Error(`legacy baseline version is invalid: ${version}`)
  }
  return `DSH-Desktop-${version}-baseline-x64-Setup.exe`
}

/** Build arguments for electron-builder's prepackaged ZIP NSIS path. */
export function legacyBaselineBuilderArgs({ builderConfig, payloadDir, outputDir, version = LEGACY_VERSION }) {
  const extensionPlaceholder = `${String.fromCharCode(36)}{ext}`
  return [
    '--config', builderConfig,
    '--win', 'nsis',
    '--x64',
    '--prepackaged', payloadDir,
    '--publish', 'never',
    '--config.directories.output', outputDir,
    '--config.win.signExecutable=false',
    '--config.npmRebuild=false',
    '--config.nsis.useZip=true',
    '--config.nsis.include=installer.nsh',
    `--config.nsis.artifactName=DSH-Desktop-${version}-baseline-x64-Setup.${extensionPlaceholder}`,
  ]
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
}

function parseArguments(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (key === undefined || value === undefined || !key.startsWith('--')) {
      throw new Error('usage: legacy-baseline-installer.mjs --source <setup.exe> --output <directory> --seven-zip <7za.exe>')
    }
    values.set(key.slice(2), value)
  }
  for (const key of ['source', 'output', 'seven-zip']) {
    if (values.get(key) === undefined) {
      throw new Error(`missing required argument --${key}`)
    }
  }
  return values
}

/** Extract the released payload and wrap it in the current measurable NSIS shell. */
export function buildLegacyBaselineInstaller({
  sourceInstaller,
  outputDir,
  sevenZip,
  nodeExecutable = process.execPath,
  builderCli,
  builderConfig,
  desktopRoot,
  env = process.env,
}) {
  const source = resolve(sourceInstaller)
  const output = resolve(outputDir)
  const seven = resolve(sevenZip)
  if (!existsSync(source)) throw new Error(`legacy baseline source is missing: ${source}`)
  if (!existsSync(seven)) throw new Error(`7za executable is missing: ${seven}`)
  mkdirSync(output, { recursive: true })

  const workspace = mkdtempSync(join(tmpdir(), 'dsh-legacy-baseline-'))
  const payload = join(workspace, 'payload')
  mkdirSync(payload)
  try {
    run(seven, ['x', '-y', source, `-o${payload}`], dirname(source), env)
    run(nodeExecutable, [builderCli, ...legacyBaselineBuilderArgs({
      builderConfig,
      payloadDir: payload,
      outputDir: output,
    })], desktopRoot, env)
    const installer = join(output, legacyBaselineArtifactName())
    if (!existsSync(installer)) throw new Error(`legacy baseline installer was not produced: ${installer}`)
    return installer
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  const scriptRoot = dirname(fileURLToPath(import.meta.url))
  const desktopRoot = dirname(scriptRoot)
  const require = createRequire(import.meta.url)
  const installer = buildLegacyBaselineInstaller({
    sourceInstaller: args.get('source'),
    outputDir: args.get('output'),
    sevenZip: args.get('seven-zip'),
    builderCli: require.resolve('electron-builder/cli.js'),
    builderConfig: join(scriptRoot, 'electron-builder.config.mjs'),
    desktopRoot,
  })
  process.stdout.write(`${installer}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  }
}

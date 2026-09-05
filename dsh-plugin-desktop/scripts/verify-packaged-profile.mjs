/** Headless RunAsNode smoke for the packaged CLI, pnpm, and ASAR Profile. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

function runAsNode(application, args, cwd, environment) {
  const result = spawnSync(application, args, {
    cwd,
    env: {
      ...environment,
      APPDATA: cwd,
      DSH_HOME: cwd,
      ELECTRON_RUN_AS_NODE: '1',
    },
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `packaged RunAsNode command exited with ${String(result.status)}: ${result.stderr.trim()}`,
    )
  }
  return result.stdout.trim()
}

/** Verify the exact physical/ASAR split in a completed Windows package. */
export function verifyPackagedProfile(appOutDir, environment = process.env) {
  const root = resolve(appOutDir)
  const resources = join(root, 'resources')
  const application = join(root, 'DSH Desktop.exe')
  const appManifest = JSON.parse(readFileSync(join(resources, 'app.asar.unpacked', 'package.json'), 'utf8'))
  const pnpmManifest = JSON.parse(readFileSync(join(
    resources,
    'app.asar.unpacked',
    'node_modules',
    'pnpm',
    'package.json',
  ), 'utf8'))
  const probeRoot = mkdtempSync(join(tmpdir(), 'dsh-packaged-profile-probe-'))
  try {
    writeFileSync(join(probeRoot, 'package.json'), '{"private":true}\n')
    const cliEntry = join(resources, 'app.asar', 'lib', 'desktop-cli.js')
    const pnpmEntry = join(resources, 'app.asar', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
    const profileUrl = pathToFileURL(join(resources, 'app.asar', 'lib', 'profile.js')).href
    const profileCode = [
      `import { prepareDesktopProfile, desktopInstallAnchor, shippedPresetRoot } from ${JSON.stringify(profileUrl)};`,
      `import { installProfilePackageResolver } from ${JSON.stringify(new URL('./module-resolution.js', profileUrl).href)};`,
      `import { WindowsAgentPresets } from ${JSON.stringify(new URL('./windows-agent-presets.js', profileUrl).href)};`,
      "import { createRequire } from 'node:module';",
      "import { pathToFileURL } from 'node:url';",
      "const prepared = prepareDesktopProfile('1', process.env.DSH_HOME, 'win32');",
      "const release=installProfilePackageResolver(prepared.bareModuleBaseUrl);",
      "const installed=createRequire(desktopInstallAnchor());",
      "const {Context}=await import(pathToFileURL(installed.resolve('@deepseek-ai/cordis')).href);",
      "const context=new Context(); context.baseUrl=prepared.bareModuleBaseUrl;",
      "context.provide('sessionProjections',{register:()=>()=>{}});",
      "try {",
      `const presets=new WindowsAgentPresets(context,{default:'standard',includeShippedRoot:true,includeUserRoot:false,roots:[{path:shippedPresetRoot(${JSON.stringify(profileUrl)}),trust:'system'}]});`,
      "const standard=await presets.resolve('standard');",
      "if(standard.broken!==undefined)throw new Error('packaged Standard preset is broken: '+standard.broken);",
      'console.log(JSON.stringify({',
      "standardPreset: standard.id,",
      'anchor: desktopInstallAnchor(),',
      'layers: prepared.profile.layers.map(layer => layer.packageName),',
      `presetPath: shippedPresetRoot(${JSON.stringify(profileUrl)})`,
      '}));',
      "}finally{await context.fiber.dispose();release();}",
    ].join('\n')
    const cliVersion = runAsNode(application, [cliEntry, '--version'], probeRoot, environment)
    const pnpmVersion = runAsNode(application, [pnpmEntry, '--version'], probeRoot, environment)
    const profileOutput = runAsNode(
      application,
      ['--input-type=module', '--eval', profileCode],
      probeRoot,
      environment,
    )
    const profileLine = profileOutput.split(/\r?\n/u).filter(Boolean).at(-1)
    const profile = JSON.parse(profileLine ?? '{}')
    if (cliVersion !== appManifest.dependencies['@deepseek-ai/dsh']) {
      throw new Error(`packaged DSH CLI reported ${cliVersion} instead of ${appManifest.dependencies['@deepseek-ai/dsh']}`)
    }
    if (pnpmVersion !== pnpmManifest.version) {
      throw new Error(`packaged pnpm reported ${pnpmVersion} instead of ${pnpmManifest.version}`)
    }
    if (!String(profile.anchor).includes(`${join('resources', 'app.asar')}`)
      || !profile.layers.includes('@deepseek-ai/dsh-web-app')
      || !profile.layers.includes('dsh-better-sidebar')
      || !String(profile.presetPath).includes(`${join('app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets')}`)) {
      throw new Error(`packaged Profile produced an unexpected physical/ASAR split: ${JSON.stringify(profile)}`)
    }
    if (profile.standardPreset !== 'standard') throw new Error('packaged Standard preset was not verified')
    return { cliVersion, pnpmVersion, profile }
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyPackagedProfile(
      process.argv[2] ?? fileURLToPath(new URL('../dist/win-unpacked', import.meta.url)),
    )
    process.stdout.write(
      `verify-packaged-profile: DSH ${result.cliVersion}, pnpm ${result.pnpmVersion}, ${result.profile.layers.length} Profile layers.\n`,
    )
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  }
}

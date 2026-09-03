import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const packageRoot = new URL('../', import.meta.url)
const workspaceRoot = new URL('../', packageRoot)
const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) as {
  name?: unknown
  version?: unknown
  bin?: Record<string, unknown>
  exports?: Record<string, unknown>
  files?: unknown
  scripts?: Record<string, unknown>
  dsh?: { bundle?: { patch?: unknown }; client?: unknown }
  build?: {
    productName?: unknown
    appId?: unknown
    asarUnpack?: unknown
    afterPack?: unknown
    electronFuses?: unknown
    files?: unknown
    mac?: {
      hardenedRuntime?: unknown
      icon?: unknown
      mergeASARs?: unknown
      notarize?: unknown
      target?: unknown
      x64ArchFiles?: unknown
    }
    win?: { icon?: unknown; target?: unknown; artifactName?: unknown }
    nsis?: Record<string, unknown>
    portable?: Record<string, unknown>
    linux?: { icon?: unknown }
  }
  dependencies?: Record<string, unknown>
  optionalDependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
}
const workspaceManifest = JSON.parse(readFileSync(new URL('package.json', workspaceRoot), 'utf8')) as {
  version?: unknown
  resolutions?: Record<string, unknown>
  scripts?: Record<string, unknown>
}
const ciWorkflow = readFileSync(new URL('.github/workflows/ci.yml', workspaceRoot), 'utf8')
const releaseWorkflow = readFileSync(new URL('.github/workflows/desktop-release.yml', workspaceRoot), 'utf8')

describe('published package surface', () => {
  it('keeps GitHub Actions as a manual build verifier instead of rebuilding tag assets', () => {
    expect(releaseWorkflow).not.toContain('--clobber')
    expect(releaseWorkflow).toContain('workflow_dispatch:')
    expect(releaseWorkflow).not.toContain("tags:\n      - 'v*'")
    expect(releaseWorkflow).not.toContain('gh release upload')
    expect(releaseWorkflow).toContain('WINDOWS_SIGNING_CERTIFICATE_BASE64')
    expect(releaseWorkflow).toContain('signtool verify /pa /all')
    expect(releaseWorkflow).toContain("if: env.WINDOWS_SIGNING_CERTIFICATE_BASE64 == ''")
    expect(releaseWorkflow).toContain("$signature.Status -ne 'NotSigned'")
  })

  it('runs desktop and community market typechecks from the root command', () => {
    expect(workspaceManifest.scripts?.typecheck)
      .toBe('yarn workspace dsh-plugin-desktop typecheck && yarn workspace dsh-community-market typecheck')
  })

  it('runs desktop and community market tests from the root command', () => {
    expect(workspaceManifest.scripts?.test)
      .toBe('yarn workspace dsh-plugin-desktop test && yarn workspace dsh-community-market test')
  })

  it('registers both npm launcher names', () => {
    expect(manifest.name).toBe('dsh-plugin-desktop')
    expect(manifest.bin).toEqual({
      'dsh-plugin-desktop': 'lib/bin.js',
      'dsh-desktop': 'lib/bin.js',
    })
  })

  it('exposes the Host plugin and desktop-owned client face', () => {
    expect(manifest.exports).toHaveProperty('./client')
    expect(manifest.exports).toHaveProperty('./windows-pwsh-sandbox', {
      types: './lib/types/windows-pwsh-sandbox.d.ts',
      default: './lib/windows-pwsh-sandbox.js',
    })
    expect(manifest.exports).toHaveProperty('./windows-agent-presets', {
      types: './lib/types/windows-agent-presets.d.ts',
      default: './lib/windows-agent-presets.js',
    })
    expect(manifest.exports).toHaveProperty('./terminal', {
      types: './lib/types/terminal.d.ts',
      default: './lib/terminal.js',
    })
    expect(manifest.exports).toHaveProperty('./pnpm', {
      types: './lib/types/pnpm.d.ts',
      default: './lib/pnpm.js',
    })
    expect(manifest.exports).toHaveProperty('./profile-service', {
      types: './lib/types/profile-service.d.ts',
      default: './lib/profile-service.js',
    })
    expect(manifest.exports).toHaveProperty('./profiles', {
      types: './lib/types/profiles.d.ts',
      default: './lib/profiles.js',
    })
    expect(manifest.exports).toHaveProperty('./diagnostics', {
      types: './lib/types/diagnostics.d.ts',
      default: './lib/diagnostics.js',
    })
    expect(manifest.exports).toHaveProperty('./updates', {
      types: './lib/types/updates.d.ts',
      default: './lib/updates.js',
    })
    expect(manifest.exports).toHaveProperty('./notifications', {
      types: './lib/types/notifications.d.ts',
      default: './lib/notifications.js',
    })
    expect(manifest.exports).not.toHaveProperty('./windows-acl-runner')
    expect(manifest.exports).not.toHaveProperty('./desktop-cli')
    expect(manifest.exports).not.toHaveProperty('./desktop-runtime-environment')
    expect(manifest.exports).not.toHaveProperty('./desktop-terminal')
    expect(manifest.exports).not.toHaveProperty('./update-checker')
    expect(manifest.exports).not.toHaveProperty('./update-download')
    expect(manifest.exports).toHaveProperty('./package.json')
    expect(manifest.dsh?.bundle).toEqual({ patch: './cordis.patch.yml' })
    expect(manifest.dsh?.client).toEqual({
      platform: 'web',
      inject: [
        '@deepseek-ai/dsh-client-ui-theme',
      ],
    })
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: dsh-plugin-desktop')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: dsh-community-market')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: dsh-plugin-desktop/terminal')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: dsh-plugin-desktop/pnpm')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: dsh-plugin-desktop/profiles')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: dsh-plugin-desktop/diagnostics')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: dsh-plugin-desktop/notifications')
    expect(readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')).toContain('name: dsh-plugin-desktop/updates')
  })

  it('keeps unaudited marketplace packages out of the published runtime', () => {
    expect(manifest.dependencies).not.toHaveProperty('dshmarket')
    expect(manifest.optionalDependencies ?? {}).not.toHaveProperty('dshmarket')
  })

  it('patches app boot to accept an empty patch layer', () => {
    const patchPath = './.yarn/patches/@deepseek-ai-dsh-app-boot-npm-0.1.2-rc.1-14389ed4aa.patch'
    expect(workspaceManifest.resolutions).toMatchObject({
      '@deepseek-ai/dsh-app-boot@npm:0.1.2-rc.1': expect.stringContaining(patchPath),
      '@deepseek-ai/dsh-app-boot@npm:^0.1.2-rc.1': expect.stringContaining(patchPath),
    })
    const marker = 'if (parsed === void 0 || parsed === null) return [];'
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedBoot = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js',
      packageRoot,
    ), 'utf8')
    expect(patch).toContain(marker)
    expect(installedBoot).toContain(marker)
  })

  it('patches the browse panel with the Windows native-picker icon bridge', () => {
    const patchPath = './.yarn/patches/@deepseek-ai-dsh-client-ui-directory-picker-browse-npm-0.1.2-rc.1-2f66bbf842.patch'
    expect(workspaceManifest.resolutions).toMatchObject({
      '@deepseek-ai/dsh-client-ui-directory-picker-browse@npm:0.1.2-rc.1': expect.stringContaining(patchPath),
      '@deepseek-ai/dsh-client-ui-directory-picker-browse@npm:^0.1.2-rc.1': expect.stringContaining(patchPath),
    })
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedClient = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-client-ui-directory-picker-browse/lib/client.js',
      packageRoot,
    ), 'utf8')
    for (const marker of [
      'pickNativeDirectory',
      'validateDirectory',
      'openDirectory(path)',
      'openDirectory(targetPath)',
      'IconFolderOpen16',
      'nativePickerButton',
      'browser.nativePicker',
      'border:1px solid var(--dsw-alias-border-l2)',
      'background:var(--dsw-alias-bg-layer-2)',
    ]) {
      expect(patch).toContain(marker)
      expect(installedClient).toContain(marker)
    }
  })

  it('adds the system Explorer action to the official Workspace menu', () => {
    const patchFilename = '@deepseek-ai-dsh-client-ui-workspace-npm-0.1.2-rc.1-233ba8c0a7.patch'
    const patchPath = `.yarn/patches/${patchFilename}`
    expect(workspaceManifest.resolutions).toMatchObject({
      '@deepseek-ai/dsh-client-ui-workspace@npm:0.1.2-rc.1': expect.stringContaining(patchFilename),
      '@deepseek-ai/dsh-client-ui-workspace@npm:^0.1.2-rc.1': expect.stringContaining(patchFilename),
    })
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const installedClient = readFileSync(new URL(
      'node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js',
      packageRoot,
    ), 'utf8')
    expect(patch).toContain('在资源管理器中打开')
    expect(installedClient).toContain('在资源管理器中打开')
    expect(patch).toContain('/dsh-desktop/api/open-directory')
    expect(installedClient).toContain('/dsh-desktop/api/open-directory')
    expect(patch).toContain('onContextMenu: (event) =>')
    expect(installedClient).toContain('onContextMenu: (event) =>')
  })

  it('builds public Host plugins and their private native bootstraps', () => {
    const config = readFileSync(new URL('tsdown.config.ts', packageRoot), 'utf8')

    expect(config).toContain("'windows-pwsh-sandbox': 'src/windows-pwsh-sandbox.ts'")
    expect(config).toContain("'windows-agent-presets': 'src/windows-agent-presets.ts'")
    expect(config).toContain("'windows-acl-runner': 'src/windows-acl-runner.ts'")
    expect(config).toContain("'desktop-cli': 'src/desktop-cli.ts'")
    expect(config).toContain("'desktop-runtime-environment': 'src/desktop-runtime-environment.ts'")
    expect(config).toContain("'desktop-terminal': 'src/desktop-terminal.ts'")
    expect(config).toContain("'profile-manager': 'src/profile-manager.ts'")
    expect(config).toContain("'profile-service': 'src/profile-service.ts'")
    expect(config).toContain("pnpm: 'src/pnpm.ts'")
    expect(config).toContain("profiles: 'src/profiles.ts'")
    expect(config).toContain("diagnostics: 'src/diagnostics.ts'")
    expect(config).toContain("notifications: 'src/notifications.ts'")
    expect(config).toContain("'diagnostic-export-worker': 'src/diagnostic-export-worker.ts'")
    expect(config).toContain("entry: { preload: 'src/preload.ts' }")
    expect(config).toContain("entryFileNames: 'preload.cjs'")
    expect(config).toContain("terminal: 'src/terminal.ts'")
    expect(config).toContain("'update-download': 'src/update-download.ts'")
    expect(config).toContain("updates: 'src/updates.ts'")
  })

  it('installs Host command PATHs after the launch snapshot and before profile boot', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const recover = main.indexOf('await resolveDesktopShellEnvironment')
    const applyRecovered = main.indexOf('Object.entries(shellEnvironmentResolution.updates)')
    const snapshot = main.indexOf('const environment = loadLayeredEnv')
    const install = main.indexOf('const pnpmRuntime = installDesktopPnpmRuntime')
    const prepare = main.indexOf('const prepared = prepareDesktopProfile')
    const installDsh = main.indexOf('const dshRuntime = process.platform === \'win32\'')
    const ownPnpm = main.indexOf('const releasePnpmRuntime = generation.own(')
    const ownDsh = main.indexOf('const releaseDshRuntime = generation.own(')
    const boot = main.indexOf('const ctx = await boot')

    expect(recover).toBeGreaterThanOrEqual(0)
    expect(applyRecovered).toBeGreaterThan(recover)
    expect(snapshot).toBeGreaterThan(applyRecovered)
    expect(install).toBeGreaterThan(snapshot)
    expect(ownPnpm).toBeGreaterThan(install)
    expect(prepare).toBeGreaterThan(install)
    expect(installDsh).toBeGreaterThan(prepare)
    expect(ownDsh).toBeGreaterThan(installDsh)
    expect(boot).toBeGreaterThan(prepare)
    expect(boot).toBeGreaterThan(installDsh)
    expect(main).toContain("'dsh-plugin-desktop: packaged pnpm runtime PATH'")
    expect(main).toContain("'dsh-plugin-desktop: packaged dsh runtime PATH'")
    expect(main).toContain("args: ['--host', '127.0.0.1', '--port', String(prepared.port)]")
    expect(main).not.toContain("'--port', '0'")
    expect(main).toContain("import { DesktopStartupGeneration } from './startup-generation.ts'")
    expect(main).toContain('async () => { await generation.release() }')
    expect(main).not.toContain('disposePnpmRuntime')
    expect(main).not.toContain('disposeDshRuntime')
  })

  it('wires local crash evidence before Electron becomes ready', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const startCrashReporter = main.indexOf('startDesktopCrashReporting(crashReporter')
    const beginRun = main.indexOf('beginDesktopRun(')
    const childLogging = main.indexOf('installDesktopChildProcessLogging(app')
    const exitCoordinator = main.indexOf('createDesktopExitCoordinator(')
    const ready = main.indexOf('await app.whenReady()')
    const markClean = main.indexOf('desktopRun?.markClean()')
    const nativeExit = main.indexOf('app.exit(code)')

    expect(startCrashReporter).toBeGreaterThanOrEqual(0)
    expect(beginRun).toBeGreaterThan(startCrashReporter)
    expect(childLogging).toBeGreaterThan(beginRun)
    expect(exitCoordinator).toBeGreaterThan(childLogging)
    expect(nativeExit).toBeGreaterThan(exitCoordinator)
    expect(markClean).toBeGreaterThan(nativeExit)
    expect(ready).toBeGreaterThan(markClean)
  })

  it('claims plugin install recovery before profile composition and gates health in Electron main', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const fixedStatePath = main.indexOf("desktopInstallRecoveryStatePath(app.getPath('userData'))")
    const beginProfile = main.indexOf('profileStartup = beginDesktopProfileStartup(')
    const stateCommit = main.indexOf('const stateCommit = new DesktopStartupStateCommit({')
    const claim = main.indexOf('const recoveryClaim = await installRecovery.claim()')
    const observeClaim = main.indexOf('stateCommit.observeInstallRecoveryClaim(recoveryClaim)')
    const prepare = main.indexOf('const prepared = prepareDesktopProfile(')
    const monitor = main.indexOf('const rendererBoot = runtime.beginRendererBootMonitoring({')
    const commitHealthy = main.indexOf('commitHealthy: async () => {', monitor)
    const awaitRenderer = main.indexOf('const [, rendererVerdict] = await Promise.all([')
    const mount = main.indexOf('runtime.mountScheduled(),', awaitRenderer)
    const commitStateHealthy = main.indexOf('await stateCommit.commitHealthy()', commitHealthy)

    expect(fixedStatePath).toBeGreaterThanOrEqual(0)
    expect(main).toContain("import { DesktopStartupStateCommit } from './startup-state-commit.ts'")
    expect(main).not.toContain("desktopInstallRecoveryStatePath(app.getPath('userData'), process.env)")
    expect(main).not.toContain('process.env[DESKTOP_INSTALL_RECOVERY_STATE_ENV]')
    expect(beginProfile).toBeGreaterThan(fixedStatePath)
    expect(stateCommit).toBeGreaterThan(beginProfile)
    expect(claim).toBeGreaterThan(stateCommit)
    expect(observeClaim).toBeGreaterThan(claim)
    expect(prepare).toBeGreaterThan(claim)
    expect(main).toContain('installRecoveryStatePath,\n      generationId,')
    expect(monitor).toBeGreaterThan(prepare)
    expect(commitHealthy).toBeGreaterThan(monitor)
    expect(commitStateHealthy).toBeGreaterThan(commitHealthy)
    expect(awaitRenderer).toBeGreaterThan(commitStateHealthy)
    expect(mount).toBeGreaterThan(awaitRenderer)
    expect(main).not.toContain('verifyingInstall')
    expect(main).not.toContain('verifiedInstallToClear')
    expect(main).not.toContain('await installRecovery.markHealthy(')
    expect(main).not.toContain('markDesktopProfileHealthy(')
  })

  it('wires lifecycle evidence through key startup stages and terminal outcomes', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const createRecorder = main.indexOf('const lifecycleRecorder = createDesktopLifecycleRecorder({')
    const startRun = main.indexOf('lifecycleRecorder.startStartup(startupStage)')
    const finishRenderer = main.indexOf('lifecycleRecorder.finishRendererBoot(')
    const rendererStage = main.indexOf("startupStage = 'renderer-startup'")
    const startRenderer = main.indexOf('lifecycleRecorder.startRendererBoot()')
    const awaitRenderer = main.indexOf('const [, rendererVerdict] = await Promise.all([')
    const healthStage = main.indexOf("startupStage = 'health-commit'")
    const completeStartup = main.indexOf('lifecycleRecorder.completeStartup(startupStage, rendererReport)')
    const catchFailure = main.indexOf('} catch (cause) {')
    const failPendingRenderer = main.indexOf('lifecycleRecorder.failRendererBootIfPending(')
    const catchFailStartup = main.indexOf('lifecycleRecorder.failStartup(', failPendingRenderer)

    expect(main).toContain("import { createDesktopLifecycleRecorder } from './lifecycle-events.ts'")
    expect(createRecorder).toBeGreaterThanOrEqual(0)
    expect(startRun).toBeGreaterThan(createRecorder)
    for (const stage of [
      'shell-environment',
      'runtime-bootstrap',
      'profile-selection',
      'install-recovery',
      'profile-composition',
      'host-boot',
      'renderer-startup',
      'health-commit',
    ]) {
      expect(main).toContain(`startupStage = '${stage}'`)
    }
    expect(main).toContain('lifecycleRecorder.transitionStartupStage(startupStage)')
    expect(finishRenderer).toBeGreaterThan(createRecorder)
    expect(startRenderer).toBeGreaterThan(rendererStage)
    expect(startRenderer).toBeLessThan(awaitRenderer)
    expect(healthStage).toBeGreaterThan(startRenderer)
    expect(healthStage).toBeLessThan(awaitRenderer)
    expect(completeStartup).toBeGreaterThan(awaitRenderer)
    expect(failPendingRenderer).toBeGreaterThan(catchFailure)
    expect(catchFailStartup).toBeGreaterThan(failPendingRenderer)
    expect(main).toContain('lifecycleRendererFailureReason(runtime.rendererBootFailureReason)')
    expect(main).toContain('lifecycleStartupFailureReason(cause, runtime)')
  })

  it('routes protected and ordinary startup failures through the native recovery window', () => {
    const main = readFileSync(new URL('src/main.ts', packageRoot), 'utf8')
    const windows = [...main.matchAll(/await openStartupRecoveryWindow\(/gu)]
      .map(match => match.index)
    const prompt = main.indexOf("if (recoveryClaim.action === 'prompt')")
    const prepare = main.indexOf('const prepared = prepareDesktopProfile(')
    const commitFailure = main.indexOf('await startupStateCommit.commitFailure({')

    expect(windows).toHaveLength(2)
    expect(windows[0]).toBeGreaterThan(prompt)
    expect(windows[0]).toBeLessThan(prepare)
    expect(commitFailure).toBeGreaterThan(prepare)
    expect(windows[1]).toBeGreaterThan(commitFailure)
    expect(main).not.toContain('await installRecovery.restore(')
    expect(main).not.toContain('await installRecovery.recordFailure(')
    expect(main).not.toContain('markDesktopProfileFailed(')
    expect(main).toContain('quiesceForRecovery: () => generation.quiesceForRecovery()')
    expect(main).toContain('failureCommit.reopenLastKnownGood !== undefined')
    expect(main).toContain('failureStage: startupStage')
    expect(main).toContain("startupStage = 'profile-composition'")
    expect(main).toContain("startupStage = 'host-boot'")
    expect(main).toContain("startupStage = 'renderer-startup'")
    expect(main).toContain("return report.status === 'failed'")
    expect(main).not.toContain("return report.status === 'failed' && verifyingInstall !== undefined")
    expect(main).toContain('void run().catch(async (cause: unknown) => { await handleFatalLauncherFailure(cause) })')
    expect(main).toContain('await installRecovery.markRollbackNotified(')
  })

  it('uses the upstream child-environment scrub around login-shell recovery', () => {
    const shellEnvironment = readFileSync(new URL('src/shell-environment.ts', packageRoot), 'utf8')

    expect(shellEnvironment).toContain('scrubbedParentEnv')
    expect(shellEnvironment).toContain('SENSITIVE_ENV_PATTERN')
    expect(shellEnvironment).toContain('DSH_ENV_PREFIX')
    expect(shellEnvironment).toContain('DESKTOP_SHELL_ENVIRONMENT_KEYS')
  })

  it('fixes the installed application identity', () => {
    expect(manifest.version).toBe(workspaceManifest.version)
    expect(manifest.build?.productName).toBe('DSH Desktop')
    expect(manifest.build?.appId).toBe('ai.deepseek.dsh.desktop')
    expect(manifest.build?.asarUnpack).toEqual([
      'package.json',
      'cordis.patch.yml',
      'build/**',
      'lib/**',
      '!lib/types/**',
      'node_modules/pnpm/**',
    ])
    expect(manifest.build?.electronFuses).toEqual({ runAsNode: true })
    expect(manifest.files).toEqual(expect.arrayContaining([
      'build/app-icon.png',
      'build/app-icon-mac.png',
      'build/installer.nsh',
      'build/installer-7z-in-place.nsh',
      'build/physical-runtime-policy.json',
      'build/production-artifact-allowlist.json',
      'build/tray-icon.svg',
      'build/tray-icon*.png',
      'docs/**',
    ]))
    expect(manifest.build?.files).toEqual([
      'build/app-icon.png',
      'build/app-icon-mac.png',
      'build/installer-7z-in-place.nsh',
      'build/physical-runtime-policy.json',
      'build/production-artifact-allowlist.json',
      'build/tray-icon.svg',
      'build/tray-icon*.png',
      'cordis.patch.yml',
      'lib/**',
      'package.json',
      'THIRD_PARTY_NOTICES.md',
      '!node_modules/node-pty/build/**',
      '!**/*.map',
      '!**/*.d.ts',
      '!**/*.d.mts',
      '!**/*.d.cts',
      '!**/{test,tests,__tests__,fixture,fixtures,benchmark,benchmarks,example,examples}/**',
      '!**/{docs,documentation}/**',
      '!**/{README,README.*,CHANGELOG,CHANGELOG.*,CHANGES,CHANGES.*,HISTORY,HISTORY.*}',
      '!**/{Readme,Readme.*,Changelog,Changelog.*,Changes,Changes.*,History,History.*}',
      'node_modules/@deepseek-ai/dsh/config/agent-presets/**',
      'node_modules/dsh-community-market/docs/schemas/*.schema.json',
    ])
    expect(manifest.build?.mac?.icon).toBe('build/app-icon-mac.png')
    expect(manifest.build?.mac?.mergeASARs).toBe(false)
    expect(manifest.build?.win?.icon).toBe('build/app-icon.png')
    expect(manifest.build?.win?.target).toEqual([{
      target: 'nsis',
      arch: ['x64'],
    }])
    expect(manifest.build?.win?.artifactName).toBe('DSH-Desktop-${version}-${arch}-Portable.${ext}')
    expect(manifest.build?.nsis).toEqual({
      include: 'installer.nsh',
      oneClick: false,
      perMachine: false,
      selectPerMachineByDefault: false,
      allowElevation: true,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      differentialPackage: false,
      shortcutName: 'DSH Desktop',
      useZip: true,
      artifactName: 'DSH-Desktop-${version}-${arch}-Setup.${ext}',
    })
    expect(manifest.build?.linux?.icon).toBe('build/app-icon.png')
  })

  it('ships third-party notices without turning them into an EULA page', () => {
    expect(manifest.build?.nsis).not.toHaveProperty('license')
    expect(manifest.build?.files).toContain('THIRD_PARTY_NOTICES.md')
    expect(manifest.build?.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      selectPerMachineByDefault: false,
      allowElevation: true,
    })
  })

  it('separates unsigned smoke packaging from the signed macOS release', () => {
    const packageDir = readFileSync(new URL('scripts/package-dir.mjs', packageRoot), 'utf8')

    expect(manifest.scripts?.build).toContain('node scripts/generate-mac-app-icon.mjs')
    expect(manifest.scripts?.['package:dir']).toBe('yarn run build && node scripts/package-dir.mjs')
    expect(packageDir).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'")
    expect(packageDir).toContain("'--config.npmRebuild=false'")
    expect(manifest.scripts?.['dist:mac']).toBe('node scripts/release-mac.ts')
    expect(manifest.scripts?.['dist:mac-smoke']).toBe('node scripts/package-mac.ts')
    expect(manifest.scripts?.['dist:win']).toBe('node scripts/package-win.ts')
    expect(manifest.scripts?.['dist:win-portable']).toBe('node scripts/package-win-portable.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('yarn run build')
    expect(manifest.scripts?.['check:win-package']).toContain('yarn run typecheck')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/package-win.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/desktop-installer-quit.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/installer-nsh.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/verify-win-portable.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/update-checker.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/update-download.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('tests/windows-volume-diagnostics.spec.ts')
    expect(manifest.scripts?.['check:win-package']).toContain('yarn run verify:closure')
    expect(manifest.scripts?.['check:mac-package']).toBe('yarn run -T check')
    expect(manifest.scripts?.['verify:cli']).toBe('node scripts/verify-cli-runtime.mjs')
    expect(manifest.scripts?.check).toContain('yarn run verify:cli')
    expect(workspaceManifest.scripts?.['dist:mac'])
      .toBe('yarn workspace dsh-community-market build && yarn workspace dsh-plugin-desktop dist:mac')
    expect(workspaceManifest.scripts?.['dist:mac-smoke'])
      .toBe('yarn workspace dsh-community-market build && yarn workspace dsh-plugin-desktop dist:mac-smoke')
    expect(workspaceManifest.scripts?.['dist:win'])
      .toBe('yarn workspace dsh-community-market build && yarn workspace dsh-plugin-desktop dist:win')
    expect(workspaceManifest.scripts?.['dist:win-portable'])
      .toBe('yarn workspace dsh-community-market build && yarn workspace dsh-plugin-desktop dist:win-portable')
    expect(manifest.build?.afterPack).toBe('./scripts/verify-packaged-runtime.ts')
    expect(manifest.build?.mac).toEqual(expect.objectContaining({
      hardenedRuntime: true,
      mergeASARs: false,
      notarize: true,
      target: ['dir'],
      x64ArchFiles: expect.stringContaining('node-pty/prebuilds/darwin-*'),
    }))
    expect(manifest.build?.files).toContain('!node_modules/node-pty/build/**')
    expect(manifest.devDependencies?.['@electron/asar']).toBe('3.4.1')
  })

  it('keeps the complete profile smoke headless with an explicit no-open flag', () => {
    const profileSmoke = readFileSync(new URL('scripts/verify-profile-boot.mjs', packageRoot), 'utf8')
    const desktopPatch = readFileSync(new URL('cordis.patch.yml', packageRoot), 'utf8')
    expect(profileSmoke).toContain("'--no-open'")
    expect(profileSmoke).toContain('web-runtime may open a browser')
    expect(desktopPatch).toMatch(/- id: web-runtime\s+config:\s+openBrowser: false/u)
  })

  it('runs the full gate once before reusing native packaging outputs on Windows', () => {
    const windowsJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  desktop-windows:'),
      ciWorkflow.indexOf('  desktop-macos:'),
    )
    const macosJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  desktop-macos:'),
      ciWorkflow.indexOf('  upstream-command-windows:'),
    )

    expect(windowsJob).toContain('- run: yarn check')
    expect(windowsJob).toContain('run: yarn workspace dsh-plugin-desktop dist:win')
    expect(windowsJob).toContain('run: yarn workspace dsh-plugin-desktop dist:win-portable')
    expect(windowsJob).toContain('DSH_PACKAGE_CHECK_ALREADY_RAN: \'1\'')
    expect(macosJob).not.toContain('- run: yarn workspace dsh-community-market check')
    expect(macosJob).toContain('- run: yarn check')
    expect(macosJob).toContain('run: yarn workspace dsh-plugin-desktop dist:mac-smoke')
    expect(macosJob).toContain('DSH_PACKAGE_CHECK_ALREADY_RAN: \'1\'')
    expect(macosJob).not.toContain('- run: yarn dist:mac-smoke')
  })

  it('skips product packaging only for documentation-only changes', () => {
    const classifier = fileURLToPath(new URL('../../scripts/classify-ci-changes.mjs', import.meta.url))
    const classify = (paths: string[]): string => execFileSync(
      process.execPath,
      [classifier],
      { input: Buffer.from(`${paths.join('\0')}\0`), encoding: 'utf8' },
    ).trim()

    expect(classify([
      'docs/architecture.md',
      '.agents/notes/implemented/architecture/decision.md',
      '.agents/notes/implemented/architecture/decision.i18n.yaml',
      'dsh-community-market/docs/schema.json',
      '.github/ISSUE_TEMPLATE/feature_request.yml',
    ])).toBe('false')
    expect(classify(['README.md', 'dsh-plugin-desktop/src/index.ts'])).toBe('true')
    expect(classify(['.github/workflows/ci.yml'])).toBe('true')
    expect(classify(['THIRD_PARTY_NOTICES.md'])).toBe('true')
    expect(classify([])).toBe('true')

    expect(ciWorkflow).toContain('product="$(git diff --name-only -z')
    expect(ciWorkflow).toContain("if: needs.changes.outputs.product == 'true'")
    expect(ciWorkflow).toContain('Documentation-only change; product build and tests are not required.')
  })

  it('keeps one fixed brand-blue tray source for generated native assets', () => {
    const source = readFileSync(new URL('build/tray-icon.svg', packageRoot), 'utf8')

    expect(source.match(/#4D6BFE/gu)).toHaveLength(1)
    expect(source).not.toMatch(/<style\b|prefers-color-scheme/iu)
    for (const filename of [
      'tray-iconTemplate.png',
      'tray-iconTemplate@2x.png',
      'tray-icon-blue.png',
      'tray-icon-blue@1.25x.png',
      'tray-icon-blue@1.5x.png',
      'tray-icon-blue@2x.png',
    ]) {
      expect(readFileSync(new URL(`build/${filename}`, packageRoot)).byteLength).toBeGreaterThan(0)
    }
  })

  it('keeps the iOS Default source icon unmodified', () => {
    const digest = createHash('sha256')
      .update(readFileSync(new URL('build/app-icon.png', packageRoot)))
      .digest('hex')

    expect(digest).toBe('315fbc6e57ff1f34894f21f66fb7f9f26deccf78333c71fad21a6cec64e7de80')
  })

  it('generates a centered macOS icon with a 100-pixel visual inset', async () => {
    const source = await sharp(readFileSync(new URL('build/app-icon.png', packageRoot))).metadata()
    const icon = sharp(readFileSync(new URL('build/app-icon-mac.png', packageRoot)))
    const metadata = await icon.metadata()
    const { info } = await icon
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 })
      .toBuffer({ resolveWithObject: true })

    expect(metadata).toEqual(expect.objectContaining({
      format: 'png',
      width: 1024,
      height: 1024,
      space: 'rgb16',
      depth: 'ushort',
      bitsPerSample: 16,
      channels: 4,
      hasAlpha: true,
    }))
    expect(metadata.icc).toEqual(source.icc)
    expect(info).toEqual(expect.objectContaining({
      width: 824,
      height: 824,
      trimOffsetLeft: -100,
      trimOffsetTop: -100,
    }))
  })

  it('keeps Electron out of production dependencies consumed by electron-builder', () => {
    expect(manifest.dependencies).not.toHaveProperty('electron')
    expect(manifest.peerDependencies?.electron).toBe('43.4.0')
    expect(manifest.devDependencies?.electron).toBe('43.4.0')
    expect(manifest.dependencies?.pnpm).toBe('11.7.0')
  })

  it('pins the maintained latest Better Sidebar as the product Workbench', () => {
    expect(manifest.dependencies?.['dsh-better-sidebar'])
      .toBe('0.18.0')
    expect(manifest.dependencies?.cordis).toBe('4.0.0-rc.8')
    expect(manifest.dependencies?.['react-dom']).toBe('18.3.1')
  })

  it('ships the audited Better Sidebar 0.17.1 contracts and pinned-terminal fixes', () => {
    const require = createRequire(new URL('package.json', packageRoot))
    const sidebarManifestPath = require.resolve('dsh-better-sidebar/package.json')
    const sidebarManifest = JSON.parse(readFileSync(sidebarManifestPath, 'utf8')) as {
      version?: unknown
      peerDependencies?: Record<string, unknown>
    }
    const sidebarRoot = dirname(sidebarManifestPath)
    const client = readFileSync(require.resolve('dsh-better-sidebar/client'), 'utf8')
    const host = readFileSync(require.resolve('dsh-better-sidebar'), 'utf8')
    const bundlePatch = readFileSync(join(sidebarRoot, 'cordis.patch.yml'), 'utf8')
    const serviceSource = readFileSync(join(sidebarRoot, 'src/client/service.ts'), 'utf8')
    const pinnedSource = readFileSync(join(sidebarRoot, 'src/client/pinned.ts'), 'utf8')
    const stateSource = readFileSync(join(sidebarRoot, 'src/client/state.ts'), 'utf8')
    const terminalLinksSource = readFileSync(join(sidebarRoot, 'src/client/terminal-links.ts'), 'utf8')
    const terminalChunk = readFileSync(join(sidebarRoot, 'lib/client-terminal.js'), 'utf8')
    const hostSource = readFileSync(join(sidebarRoot, 'src/index.ts'), 'utf8')

    expect(sidebarManifest.version).toBe('0.18.0')
    expect(sidebarManifest.peerDependencies).not.toHaveProperty('cordis')
    expect(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json')).toBeTruthy()
    expect(serviceSource).toContain("export const SIDEBAR_SERVICE_VERSION = '0.18.0'")
    expect(client).toContain('"floatWindows"')
    expect(client).toContain('statusTruncated')
    expect(client).toContain('pinned:')
    expect(terminalChunk).toContain('registerLinkProvider')
    expect(pinnedSource).toContain('export function collectPinnedTabs(')
    expect(stateSource).toContain('getSessionStates(): ReadonlyMap<string, SidebarState>')
    expect(terminalLinksSource).toContain("const OPENABLE_SCHEMES = new Set(['http:', 'https:'])")
    expect(host).toContain('name: "sidebar_open"')
    expect(hostSource.indexOf("ctx.get('sessionPersistence')"))
      .toBeLessThan(hostSource.indexOf('return process.cwd()'))
    expect(bundlePatch).toContain("id: better-sidebar")
    expect(bundlePatch).toContain("name: 'dsh-better-sidebar'")
  })

  it('keeps removed Vision Toolkit out of the desktop dependency graph', () => {
    expect(manifest.dependencies).not.toHaveProperty('@anionex/dsh-vision-toolkit')
  })

  it('gives the Desktop settings section a dedicated display icon', () => {
    const patchPath = './.yarn/patches/@deepseek-ai-dsh-client-ui-settings-general-npm-0.1.2-rc.1-7f824ae1d5.patch'
    expect(workspaceManifest.resolutions).toMatchObject({
      '@deepseek-ai/dsh-client-ui-settings-general@npm:0.1.2-rc.1': expect.stringContaining(patchPath),
      '@deepseek-ai/dsh-client-ui-settings-general@npm:^0.1.2-rc.1': expect.stringContaining(patchPath),
    })
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const require = createRequire(new URL('package.json', packageRoot))
    const webRequire = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'))
    const installedClient = readFileSync(
      webRequire.resolve('@deepseek-ai/dsh-client-ui-settings-general/client'),
      'utf8',
    )
    for (const marker of [
      'function IconDesktopSettings',
      'if (id === "desktop")',
      'M5 14h6M8 11.5V14',
    ]) {
      expect(patch).toContain(marker)
      expect(installedClient).toContain(marker)
    }
  })

  it('keeps the chat attachment drag mask outside the desktop Workspace drop target', () => {
    const patchPath = './.yarn/patches/@deepseek-ai-dsh-client-ui-attachment-npm-0.1.2-rc.1-d0fc3a3050.patch'
    const conversationPatchPath = './.yarn/patches/@deepseek-ai-dsh-client-ui-conversation-npm-0.1.2-rc.1-2ae03ac40e.patch'
    expect(workspaceManifest.resolutions).toMatchObject({
      '@deepseek-ai/dsh-client-ui-attachment@npm:0.1.2-rc.1': expect.stringContaining(patchPath),
      '@deepseek-ai/dsh-client-ui-attachment@npm:^0.1.2-rc.1': expect.stringContaining(patchPath),
      '@deepseek-ai/dsh-client-ui-conversation@npm:0.1.2-rc.1': expect.stringContaining(conversationPatchPath),
      '@deepseek-ai/dsh-client-ui-conversation@npm:^0.1.2-rc.1': expect.stringContaining(conversationPatchPath),
    })
    const patch = readFileSync(new URL(patchPath, workspaceRoot), 'utf8')
    const conversationPatch = readFileSync(new URL(conversationPatchPath, workspaceRoot), 'utf8')
    const require = createRequire(new URL('package.json', packageRoot))
    const webRequire = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'))
    const installedClient = readFileSync(webRequire.resolve('@deepseek-ai/dsh-client-ui-attachment/client'), 'utf8')
    const installedConversation = readFileSync(webRequire.resolve('@deepseek-ai/dsh-client-ui-conversation/client'), 'utf8')
    for (const source of [patch, installedClient]) {
      expect(source).toContain('[data-dsh-workspace-drop-target]')
      expect(source).toContain('[data-dsh-conversation-drop-target]')
      expect(source).toContain('data-dsh-chat-drop-overlay')
      expect(source).toContain('workspaceDropTarget(event)')
      expect(source).toContain('reset()')
    }
    for (const source of [conversationPatch, installedConversation]) {
      expect(source).toContain('data-dsh-conversation-drop-target')
      expect(source).toContain('position: "relative"')
    }
  })

  it('ships explicit native image capability controls in the upstream model settings client', () => {
    const require = createRequire(new URL('package.json', packageRoot))
    const webRequire = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'))
    const settingsModels = readFileSync(webRequire.resolve('@deepseek-ai/dsh-client-ui-settings-models/client'), 'utf8')

    expect(settingsModels).toContain('modelImageInput')
    expect(settingsModels).toContain('inputModalities')
    expect(settingsModels).toContain('patch(index, { input: event.target.checked ? ["text", "image"] : ["text"] })')
  })

  it('shows native image capability in the upstream model selector', () => {
    const require = createRequire(new URL('package.json', packageRoot))
    const webRequire = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'))
    const selector = readFileSync(webRequire.resolve('@deepseek-ai/dsh-client-ui-model-selection/client'), 'utf8')

    expect(selector).toContain('modelAcceptsImages')
    expect(selector).toContain('inputModalities')
  })

  it('retains host and adapter image safety gates after adding capability metadata', () => {
    const require = createRequire(new URL('package.json', packageRoot))
    const host = readFileSync(require.resolve('@deepseek-ai/dsh-api-session-controller'), 'utf8')
    const adapter = readFileSync(require.resolve('@deepseek-ai/dsh-llm-deepseek'), 'utf8')

    expect(host).toContain('MODEL_DOES_NOT_SUPPORT_IMAGES')
    expect(host).toContain('inputModalities.includes("image")')
    expect(adapter).toContain('does not accept image input')
    expect(adapter).toContain('inputModalities?.includes("image") !== true')
  })

  it('ships both authorized deliverable copy actions in the upstream produced-files row', () => {
    const require = createRequire(new URL('package.json', packageRoot))
    const webRequire = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'))
    const deliverables = readFileSync(webRequire.resolve('@deepseek-ai/dsh-client-ui-deliverables/client'), 'utf8')

    expect(deliverables).toContain('copyAbsolutePath')
    expect(deliverables).toContain('copyTextContent')
    expect(deliverables).toContain('/dsh-desktop/api/deliverables/copy')
  })

  it('packages the native-compiled Koffi Windows runtime', () => {
    const lockfile = readFileSync(new URL('yarn.lock', workspaceRoot), 'utf8')

    expect(manifest.dependencies?.koffi).toBe('3.1.5')
    expect(workspaceManifest.resolutions).toMatchObject({
      'koffi@npm:^3.1.0': '3.1.5',
    })
    expect(lockfile).toContain('"koffi@npm:3.1.5":')
    expect(lockfile).toContain('@koromix/koffi-win32-x64@npm:3.1.5')
    expect(lockfile).not.toContain('"koffi@npm:3.1.4":')
    expect(lockfile).not.toContain('@koromix/koffi-win32-x64@npm:3.1.4')
  })

  it('resolves electron-builder through the pinned app-builder-lib packaging fixes', () => {
    const patchResolution = 'patch:app-builder-lib@npm%3A26.15.7#./patches/app-builder-lib@26.15.7.patch'
    const lockfile = readFileSync(new URL('yarn.lock', workspaceRoot), 'utf8')
    const patch = readFileSync(new URL('patches/app-builder-lib@26.15.7.patch', workspaceRoot), 'utf8')
    const workspaceRequire = createRequire(new URL('package.json', packageRoot))
    const electronBuilderManifest = workspaceRequire.resolve('electron-builder/package.json')
    const electronBuilderRequire = createRequire(electronBuilderManifest)
    const appBuilderManifest = electronBuilderRequire.resolve('app-builder-lib/package.json')
    const installedCodeSign = readFileSync(join(dirname(appBuilderManifest), 'out/codeSign/macCodeSign.js'), 'utf8')
    const installedNpmCollector = readFileSync(
      join(dirname(appBuilderManifest), 'out/node-module-collector/npmNodeModulesCollector.js'),
      'utf8',
    )
    const installedNsisExtractor = readFileSync(
      join(dirname(appBuilderManifest), 'templates/nsis/include/extractAppPackage.nsh'),
      'utf8',
    )

    expect(workspaceManifest.resolutions).toMatchObject({
      'app-builder-lib@npm:26.15.7': patchResolution,
    })
    expect(manifest.devDependencies?.['electron-builder']).toBe('26.15.7')
    expect(lockfile).toContain('app-builder-lib@patch:app-builder-lib@npm%3A26.15.7#./patches/app-builder-lib@26.15.7.patch')
    expect(patch).toContain('importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)')
    expect(patch).toContain('"-k", keychainPassword, keychainFile')
    expect(patch).toContain('"--workspaces=false"')
    expect(patch).toContain('tree.devDependencies?.[packageName]')
    expect(patch).toContain('DSH_7Z_IN_PLACE')
    expect(installedCodeSign).toContain('importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)')
    expect(installedCodeSign).toContain('"-k", keychainPassword, keychainFile')
    expect(installedNpmCollector).toContain('"--workspaces=false"')
    expect(installedNpmCollector).toContain('tree.devDependencies?.[packageName]')
    expect(installedNsisExtractor).toContain('DSH_7Z_IN_PLACE')
  })

  it('starts restricted Windows shells with a hidden console show state', () => {
    const patchResolution = 'patch:@deepseek-ai/dsh-win32-process@npm%3A0.1.2-rc.1#./.yarn/patches/@deepseek-ai-dsh-win32-process-npm-0.1.2-rc.1-4a5022946b.patch'
    const lockfile = readFileSync(new URL('yarn.lock', workspaceRoot), 'utf8')
    const patch = readFileSync(new URL('.yarn/patches/@deepseek-ai-dsh-win32-process-npm-0.1.2-rc.1-4a5022946b.patch', workspaceRoot), 'utf8')
    const workspaceRequire = createRequire(new URL('package.json', packageRoot))
    const sandboxManifest = workspaceRequire.resolve('@deepseek-ai/dsh-sandbox-windows-acl/package.json')
    const sandboxLocalManifest = workspaceRequire.resolve('@deepseek-ai/dsh-sandbox-local/package.json')
    const sandboxLocalRequire = createRequire(sandboxLocalManifest)
    const sandboxLib = join(dirname(sandboxManifest), 'lib')
    const runtimeChunks = readdirSync(sandboxLib).filter(name => /^types-.*\.js$/u.test(name))

    expect(workspaceManifest.resolutions).toMatchObject({
      '@deepseek-ai/dsh-win32-process@npm:0.1.2-rc.1': patchResolution,
      '@deepseek-ai/dsh-win32-process@npm:^0.1.2-rc.1': patchResolution,
    })
    expect(sandboxLocalRequire.resolve('@deepseek-ai/dsh-sandbox-windows-acl/package.json'))
      .toBe(sandboxManifest)
    expect(lockfile).toContain('@deepseek-ai/dsh-win32-process@patch:@deepseek-ai/dsh-win32-process@npm%3A0.1.2-rc.1#./.yarn/patches/@deepseek-ai-dsh-win32-process-npm-0.1.2-rc.1-4a5022946b.patch')
    expect(patch.match(/^\+\s*dwFlags: 257,\r?$/gmu)).toHaveLength(2)
    expect(patch.match(/^\+\s*wShowWindow: 0,\r?$/gmu)).toHaveLength(2)
    expect(runtimeChunks).toHaveLength(1)
    const installedRuntime = readFileSync(join(dirname(require.resolve('@deepseek-ai/dsh-win32-process/package.json')), 'lib/index.js'), 'utf8')
    expect(installedRuntime.match(/dwFlags: 257,/gu)).toHaveLength(2)
    expect(installedRuntime.match(/wShowWindow: 0,/gu)).toHaveLength(2)
    expect(installedRuntime).toContain('createProcessAsUserW(options.token, null, commandLine, null, null, 1, creationFlags, null')
  })
})

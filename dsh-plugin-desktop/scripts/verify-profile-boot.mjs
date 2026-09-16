/** Headless smoke for the complete published DSH Web profile and renderer manifest. */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { removeIsolatedTree } from '../../scripts/remove-isolated-tree.mjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { assembleContextFor } from '@deepseek-ai/dsh-agent'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import {
  createLaunchEnvironmentSnapshot,
  DSH_LAUNCH_ENVIRONMENT_KEY,
} from '@deepseek-ai/dsh-launch-environment'
import { DESKTOP_SETTINGS_NAMESPACE } from '../lib/index.js'
import { installDesktopPnpmRuntime } from '../lib/desktop-runtime-environment.js'
import { installProfilePackageResolver } from '../lib/module-resolution.js'
import { prepareDesktopProfile } from '../lib/profile.js'
import { DesktopProfileService } from '../lib/profile-service.js'
import { verifyClientRegistrations } from './verify-client-bundles.ts'

const BIN_NAME = 'dsh-plugin-desktop-profile-smoke'
const HOST_SERVICE_PLUGIN_NAME = 'dsh-desktop-host-services-smoke-plugin'
const HOST_SERVICE_PROBE_KEY = 'desktopHostServiceProbe'
const diagnostic = process.argv.includes('--diagnostic')
const requestedMode = process.argv.includes('--system') ? 'compatibility' : 'advanced'
const expectedMode = diagnostic ? 'compatibility' : requestedMode
const uiStatePath = process.env.DSH_UI_STATE_FILE
const rendererReports = []
const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-profile-'))
let ctx
let releasePackageResolver
let pnpmRuntime
let mountedSpec
let nativeThemeSource = 'system'
const trayItems = []
let uiProvider

try {
  let uiProviderPort
  if (uiStatePath) {
    uiProvider = createServer(async (req, res) => {
      for await (const _part of req) { /* consume the fixture request */ }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Isolated UI fixture response.' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
    })
    await new Promise(resolve => uiProvider.listen(0, '127.0.0.1', resolve))
    uiProviderPort = uiProvider.address().port
  }
  writeFileSync(join(home, 'settings.yaml'), [
    'dsh-desktop:',
    `  mode: ${requestedMode}`,
    ...(uiStatePath ? ['dsh-desktop-voice:', '  enabled: true', 'agent-default-model:', '  provider: surface-fixture', '  model: surface-chat', 'llm-pi-ai:', '  providers:', '    surface-fixture:', '      api: openai-completions', '      apiKeyEnv: DSH_UI_FIXTURE_KEY', `      baseURL: http://127.0.0.1:${uiProviderPort}/v1`, '      models:', '        - id: surface-chat', '          input: [text, image]'] : []),
    'agent-presets:',
    '  default: minimal',
    '',
  ].join('\n'))
  if (uiStatePath) {
    process.env.DASHSCOPE_API_KEY = 'isolated-surface-fixture'
    process.env.DEEPSEEK_API_KEY = 'isolated-surface-fixture'
  }
  const prepared = prepareDesktopProfile('1', home, 'win32', 'desktop', undefined, { experience: diagnostic ? 'upstream-diagnostic' : 'desktop' })
  const hostServicePluginDir = join(
    prepared.profile.dir,
    'node_modules',
    HOST_SERVICE_PLUGIN_NAME,
  )
  if (!diagnostic) {
    mkdirSync(join(prepared.profile.dir, 'node_modules'), { recursive: true })
    cpSync(
      fileURLToPath(new URL('../tests/fixtures/desktop-host-services-smoke-plugin/', import.meta.url)),
      hostServicePluginDir,
      { recursive: true, force: false, errorOnExist: true },
    )
  }
  const patches = [
    // Deliberately compose the consumer before the desktop-pnpm provider row.
    // Its required injection must keep it pending until that service mounts.
    ...diagnostic ? [] : [{
      insert: [{
        id: 'desktop-host-services-smoke-plugin',
        name: HOST_SERVICE_PLUGIN_NAME,
      }],
    }],
    ...prepared.patches,
  ]
  const packageRoot = new URL('../', import.meta.url)
  const productVersion = uiStatePath ? JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')).version : '2.0.4'
  const pnpmBinPath = fileURLToPath(new URL('node_modules/pnpm/bin/pnpm.mjs', packageRoot))
  const electronVersion = JSON.parse(
    readFileSync(new URL('node_modules/electron/package.json', packageRoot), 'utf8'),
  ).version
  pnpmRuntime = installDesktopPnpmRuntime({
    platform: process.platform,
    appExecutable: process.execPath,
    pnpmBinPath,
    electronVersion,
    stateDir: join(home, 'runtime-commands'),
    environment: process.env,
  })
  releasePackageResolver = installProfilePackageResolver(prepared.bareModuleBaseUrl)
  const runtime = {
    platform: 'win32',
    locale: 'en',
    updates: {
      isPackaged: false,
      canDownload: true,
      currentVersion: productVersion,
      statePath: join(home, 'update-state.json'),
      request: async () => { throw new Error('profile smoke must not perform update requests') },
      confirmDownload: async () => false,
      showManualCheckResult: async () => {},
      showDownloadFailure: async () => {},
      downloadAndOpen: async () => {},
      notify: () => {},
      writeClipboardText: () => {},
    },
    schedule(spec) {
      mountedSpec = spec
      return async () => {}
    },
    async mountScheduled() {
      if (mountedSpec === undefined) throw new Error('desktop shell was not registered')
      runtime.setLocalePreference(mountedSpec.readLocalePreference())
      nativeThemeSource = mountedSpec.readThemeSource()
    },
    show() {},
    async pickDirectory() { return home },
    async validateDirectory(path) { return path === home || path.startsWith(`${home}${process.platform === 'win32' ? '\\' : '/'}`) },
    reportRendererBoot(report) { rendererReports.push(report) },
    registerTrayItem(item) {
      trayItems.push(item)
      return {
        refresh() {},
        dispose() {
          const index = trayItems.indexOf(item)
          if (index >= 0) trayItems.splice(index, 1)
        },
      }
    },
    openTerminal() {},
    setLocalePreference(preference) { runtime.locale = preference ?? 'en' },
    setThemeSource(source) { nativeThemeSource = source },
    async requestRestart() {},
    prepareToQuit() {},
  }
  ctx = await boot(
    BIN_NAME,
    prepared.rootConfig,
    patches,
    async (host) => {
      host.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([]))
      host.provide('desktopRuntime', runtime)
      host.provide('desktopPnpmBootstrap', {
        activeProfileName: 'desktop',
        activeProfileDir: prepared.profile.dir,
        homeDir: prepared.homeDir,
        appExecutable: process.execPath,
        pnpmBinPath,
        electronVersion,
        nodeBinDir: pnpmRuntime.nodeBinDir,
        nodeShimPath: pnpmRuntime.nodeShimPath,
        clearEnvironmentPath: pnpmRuntime.clearEnvironmentPath,
        dshBootstrapPath: fileURLToPath(new URL('../lib/desktop-cli.js', import.meta.url)),
        installRecoveryStatePath: join(home, 'plugin-install-recovery', 'state.json'),
        generationId: 'profile-smoke-generation',
      })
      await host.plugin(DesktopProfileService, {
        current: {
          name: 'desktop',
          dir: prepared.profile.dir,
        },
        list: () => [{
          name: 'desktop',
          dir: prepared.profile.dir,
          exists: true,
          bundles: prepared.profile.layers.map(layer => layer.packageName),
          webCapable: true,
        }],
        persistSelection: () => {},
        requestRestart: () => {},
      })
      provideCmdline(host, {
        args: ['--host', '127.0.0.1', '--port', '0', '--no-open'],
        exit: () => {},
      })
    },
    prepared.bareModuleBaseUrl,
  )
  if (uiStatePath) {
    for (const ref of ['DASHSCOPE_API_KEY', 'DEEPSEEK_API_KEY', 'DSH_UI_FIXTURE_KEY']) {
      if (!(await ctx.credentials.describe(ref)).configured) await ctx.credentials.set(ref, 'sk-isolated-surface-fixture')
    }
  }
  await runtime.mountScheduled()

  if (ctx.webStartup?.openBrowser !== false) {
    throw new Error(`profile smoke did not apply --no-open: ${JSON.stringify(ctx.webStartup)}`)
  }
  const webRuntimeEntry = ctx.loader.resolve('include:web-runtime')
  if (webRuntimeEntry?.options.config?.openBrowser !== false) {
    throw new Error(`profile smoke web-runtime may open a browser: ${JSON.stringify(webRuntimeEntry?.options.config)}`)
  }

  if (!diagnostic && ctx.get('desktopPnpm') === undefined) {
    throw new Error('assembled desktop profile is missing the desktop pnpm Host capability')
  }
  if (ctx.desktopProfiles.current.name !== 'desktop'
    || ctx.desktopProfiles.current.dir !== prepared.profile.dir) {
    throw new Error('assembled desktop profile service has the wrong active identity')
  }
  const agentPresets = ctx.get('agentPresets')
  if (agentPresets === undefined) {
    throw new Error('assembled Windows profile is missing the agent preset roster')
  }
  const presetIds = (await agentPresets.list()).map(preset => preset.id)
  if (presetIds.includes('minimal') || !presetIds.includes('standard')) {
    throw new Error(`assembled Windows profile exposes unexpected presets: ${presetIds.join(', ')}`)
  }
  if (agentPresets.defaultId !== 'standard') {
    throw new Error(`assembled Windows profile selected unsupported default ${agentPresets.defaultId}`)
  }
  const standardPreset = await agentPresets.resolve('standard')
  if (standardPreset.broken !== undefined) throw new Error(`Standard preset cannot mount: ${standardPreset.broken}`)
  const created = await ctx.sessionController.create({ cwd: home, agentPreset: 'standard' })
  if (typeof created.sessionId !== 'string' || created.agentPreset !== 'standard') {
    throw new Error('assembled Profile could not create a Standard session')
  }
  console.log('verify-profile-session: Standard session created without an LLM request.')
  const nativeAgent = ctx.agents.get(created.sessionId)
  if (!nativeAgent || ctx.tools.get('DesktopGenerateImage', nativeAgent)
    || ctx.commands.list(nativeAgent).some(command => command.name === 'generation')) {
    throw new Error('The removed controlled-generation feature remains mounted')
  }
  const normalPrompt = await ctx.systemPrompt.assemble(assembleContextFor(nativeAgent, new AbortController().signal))
  if (!normalPrompt.tools.some(tool => tool.name === 'subagent')) throw new Error('Normal Agent tools were restricted by image generation')
  console.log('verify-profile-generation: no forced generation mode; normal Standard tools remain available.')
  const legacyPreset = await agentPresets.resolve('minimal')
  if (legacyPreset.id !== 'minimal') {
    throw new Error(`assembled Windows profile remapped legacy preset to ${legacyPreset.id}`)
  }
  const hostServiceProbe = diagnostic ? undefined : ctx.get(HOST_SERVICE_PROBE_KEY)
  if (!diagnostic && (hostServiceProbe?.current?.name !== 'desktop'
    || hostServiceProbe.current.dir !== prepared.profile.dir
    || hostServiceProbe.pnpm?.serviceName !== 'desktopPnpm'
    || hostServiceProbe.pnpm.lookupRun !== 'function'
    || hostServiceProbe.pnpm.run !== 'function'
    || hostServiceProbe.pnpm.runPlugin !== 'function'
    || hostServiceProbe.pnpm.installPlugin !== 'function'
    || hostServiceProbe.pnpm.recoveredInstallReceiptIds !== 'function'
    || hostServiceProbe.pnpm.acknowledgeRecoveredInstall !== 'function'
    || hostServiceProbe.pnpm.rollbackPluginInstall !== 'function')) {
    throw new Error(
      `profile-local Host service plugin produced an unexpected probe: ${JSON.stringify(hostServiceProbe)}`,
    )
  }

  const picker = ctx.directoryPicker.capability()
  if (picker.kind !== 'browse') {
    throw new Error(`assembled Windows profile selected ${picker.kind} directory picker`)
  }
  const listing = await picker.list(home)
  if (listing.path !== home) {
    throw new Error(`assembled Windows browse picker listed ${listing.path} instead of ${home}`)
  }

  const expectedUrl = mountedSpec?.url ?? `http://127.0.0.1:${String(ctx.webServer.port)}/`
  const mountedUrl = new URL(expectedUrl)
  const mountedDriveLetters = mountedUrl.searchParams.get('dsh-desktop-drives')
  const hasExpectedDriveLetters = process.platform === 'win32'
    ? /^[A-Z]+$/u.test(mountedDriveLetters ?? '')
    : mountedDriveLetters === null
  if (mountedUrl.origin !== `http://127.0.0.1:${String(ctx.webServer.port)}`
    || mountedUrl.pathname !== '/'
    || mountedUrl.searchParams.get('dsh-desktop-mode') !== expectedMode
    || mountedUrl.searchParams.get('dsh-desktop-platform') !== 'win32'
    || mountedUrl.searchParams.get('dsh-desktop-version') !== productVersion
    || !hasExpectedDriveLetters) {
    throw new Error(`desktop plugin produced an unexpected renderer URL: ${String(mountedSpec?.url)}`)
  }
  if (mountedSpec?.mode !== expectedMode) {
    throw new Error(`desktop plugin produced an unexpected shell mode: ${String(mountedSpec?.mode)}`)
  }
  if (nativeThemeSource !== 'system') {
    throw new Error(`desktop plugin produced an unexpected native theme source: ${nativeThemeSource}`)
  }
  const desktopSettings = ctx.settings.get(DESKTOP_SETTINGS_NAMESPACE)
  if (desktopSettings?.mode !== requestedMode) {
    throw new Error('assembled Host settings are missing the advanced dsh-desktop mode')
  }
  if (!diagnostic && !trayItems.some(item => item.label() === 'Check for Updates…')) {
    throw new Error('assembled desktop profile is missing the update tray command')
  }
  if (!diagnostic && process.platform !== 'linux'
    && !trayItems.some(item => item.label() === 'Open DSH Terminal')) {
    throw new Error('assembled desktop profile is missing the terminal tray command')
  }
  const profileMenu = diagnostic ? undefined : trayItems.find(item => item.label() === 'Profile: desktop')
  if (!diagnostic && profileMenu?.submenu?.()[0]?.label() !== 'desktop') {
    throw new Error('assembled desktop profile is missing the active profile tray submenu')
  }
  // RC1 protects the index route with the Host browser-auth token. Keep the
  // product URL assertions above token-free, then authenticate only this
  // headless probe through the mounted Connection service.
  const connection = ctx.get('connection')
  const fetchUrl = typeof connection?.authenticatedUrl === 'function'
    ? (() => {
      const authenticated = new URL(connection.authenticatedUrl(expectedUrl))
      for (const [key, value] of new URL(expectedUrl).searchParams) authenticated.searchParams.set(key, value)
      return authenticated.href
    })()
    : expectedUrl
  let response = await fetch(fetchUrl, { redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    const setCookie = response.headers.get('set-cookie')
    if (setCookie !== null) {
      const cookie = setCookie.split(';', 1)[0]
      response = await fetch(expectedUrl, { headers: { cookie } })
    }
  }
  const html = await response.text()
  if (response.status !== 200) {
    throw new Error(`assembled Web root returned HTTP ${String(response.status)}`)
  }
  const bootMatch = html.match(/(?:window\.__DSH_BOOT__|globalThis\["__DSH_BOOT__"\]) = (\{.*?\})<\/script>/u)
  if (bootMatch?.[1] === undefined) {
    throw new Error('assembled Web root is missing window.__DSH_BOOT__')
  }
  const graph = JSON.parse(bootMatch[1])
  for (const batch of graph.batches) {
    const bundle = await fetch(new URL(batch.url, expectedUrl))
    if (bundle.status !== 200) throw new Error(`client batch returned HTTP ${bundle.status}: ${batch.url}`)
    verifyClientRegistrations(await bundle.text(), batch.entries, batch.url)
  }
  console.log(`verify-profile-client-batches: ${graph.batches.length} HTTP batches parsed and registered.`)
  const ids = new Set(graph.entries.map(entry => entry.id))
  for (const id of [
    'dsh-plugin-desktop',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-sidebar',
    '@deepseek-ai/dsh-client-ui-directory-picker-browse',
  ]) {
    if (!ids.has(id)) throw new Error(`assembled advanced Web graph is missing ${id}`)
  }
  for (const id of [
    '@deepseek-ai/dsh-client-ui-directory-picker-native',
  ]) {
    if (ids.has(id)) throw new Error(`assembled advanced Web graph unexpectedly includes ${id}`)
  }
  if (ids.has('@deepseek-ai/dsh-client-ui-layout') !== (expectedMode === 'compatibility')) throw new Error('Wrong upstream layout composition')
  for (const name of ['dsh-better-sidebar', 'dsh-community-market']) {
    if (ids.has(name) === diagnostic) throw new Error(`Wrong ${name} diagnostic composition`)
  }
  if (uiStatePath) {
    let finish
    const done = new Promise(resolve => { finish = resolve })
    const timer = setTimeout(() => finish(), 240_000)
    const disposeRoute = ctx.webServer.register({ kind: 'exact', path: '/dsh-desktop/api/ui-smoke/finish', handler: (req, res) => {
      if (req.method !== 'POST' || req.headers['x-dsh-ui-smoke'] !== '1') { res.writeHead(403); res.end(); return }
      res.writeHead(204); res.end(); finish()
    } })
    const disposeStatus = ctx.webServer.register({ kind: 'exact', path: '/dsh-desktop/api/ui-smoke/status', handler: (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ rendererReports }))
    } })
    writeFileSync(uiStatePath, JSON.stringify({ url: expectedUrl, root: home, sessionId: created.sessionId, version: productVersion, mode: expectedMode, diagnostic, doneUrl: new URL('/dsh-desktop/api/ui-smoke/finish', expectedUrl).href }))
    console.log(`verify-profile-ui: ready (${expectedMode}, diagnostic=${diagnostic})`)
    await done
    clearTimeout(timer)
    disposeRoute()
    disposeStatus()
  }
} finally {
  await ctx?.fiber.dispose()
  uiProvider?.closeAllConnections()
  uiProvider?.close()
  releasePackageResolver?.()
  pnpmRuntime?.dispose()
  removeIsolatedTree(home)
}

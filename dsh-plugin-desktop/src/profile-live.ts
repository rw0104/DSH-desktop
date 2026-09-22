/** Launcher policy around the official alpha Profile and Plugin Manager services. */
import type { Context } from '@deepseek-ai/cordis'
import { createProfileResolutionGeneration, PluginPackages, reconcileProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import type { AppReady } from '@deepseek-ai/dsh-cmdline'
import type { ChangeResult } from '@deepseek-ai/dsh-plugin-manager/types'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { DesktopPnpmBootstrap } from './pnpm.ts'
import { DesktopInstallRecoveryStore } from './install-recovery.ts'
import { desktopInstallAnchor, type PreparedDesktopProfile } from './profile.ts'

const OWNED_ROWS = new Set(['settings', 'webserver', 'ui-layout', 'ui-sidebar', 'ui-conversation'])

/** Supplied only by the Desktop launcher; callers cannot choose another Profile or WAL. */
export interface DesktopPluginManagerPolicy {
  protectedPlugin(id: string | undefined, moduleName: string): boolean
  protectedBundle(name: string): boolean
  change(reason: string, request: Pick<ChangeResult, 'stage' | 'target'>, operation: () => Promise<ChangeResult>): Promise<ChangeResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context { desktopPluginManagerPolicy: DesktopPluginManagerPolicy }
}

/** Wrap a whole official operation while its caller holds the Profile lock. */
export function createDesktopPluginManagerPolicy(options: {
  diagnostic: boolean
  protectedBundles: readonly string[]
  store: DesktopInstallRecoveryStore
  restoreRuntime(): Promise<void>
}): DesktopPluginManagerPolicy {
  const refuse = (request: Pick<ChangeResult, 'stage' | 'target'>, diagnostic: string): ChangeResult => ({
    ...request, changed: false, application: 'failed', error: { code: 'operation-error', diagnostic },
  })
  return {
    protectedPlugin: (id, moduleName) => options.diagnostic || id?.startsWith('desktop-') === true
      || OWNED_ROWS.has(id ?? '') || moduleName.startsWith('dsh-plugin-desktop') || moduleName === 'dsh-community-market',
    protectedBundle: name => options.diagnostic || options.protectedBundles.includes(name),
    async change(reason, request, operation) {
      // Diagnostic startup and controls must not inspect or consume normal WAL state.
      if (options.diagnostic) return refuse(request, 'Manage plugins from the normal Desktop experience.')
      if (await options.store.read() !== undefined) return refuse(request, 'Restart Desktop to verify the pending plugin change before making another change.')
      if (reason !== 'install' && reason !== 'remove') return operation()
      const transaction = await options.store.begin({
        packageName: 'profile-plugin-change', packageVersion: 'unresolved', receiptId: `profile:${randomUUID()}`,
      })
      const rollback = async () => {
        const restored = await options.store.restoreCurrentInstall(transaction.transactionId, 'install-failed')
        if (restored.status !== 'restored') throw new Error('Plugin recovery requires a Desktop restart.')
        try {
          await options.restoreRuntime()
          await options.store.clear(transaction.transactionId)
        } catch (cause) {
          await options.store.markManualRecoveryRequired(transaction.transactionId, 'recovery-failed')
          throw cause
        }
      }
      let result: ChangeResult
      try { result = await operation() } catch (cause) {
        await rollback()
        throw cause
      }
      if (result.application === 'failed' || result.application === 'cancelled') {
        await rollback()
        return { ...result, changed: false }
      }
      try { await options.store.seal(transaction.transactionId) } catch (cause) {
        await rollback()
        throw cause
      }
      // Live Host activation is useful; the next Renderer boot still verifies
      // persistent installation state through the existing Desktop health gate.
      return { ...result, application: 'restart-required' }
    },
  }
}

/** Install the official resolver and profile facts before the Loader evaluates bundle conditions. */
export async function installDesktopProfileLive(ctx: Context, options: {
  prepared: PreparedDesktopProfile
  bootstrap: DesktopPnpmBootstrap
  recompose(): PreparedDesktopProfile
  telemetryDisabled?: string | undefined
}): Promise<{ ready: AppReady; commitReady(): void }> {
  const { prepared, bootstrap } = options
  const diagnostic = prepared.experience === 'upstream-diagnostic'
  const store = new DesktopInstallRecoveryStore({
    statePath: bootstrap.installRecoveryStatePath, profileName: prepared.profile.name,
    profileDir: prepared.profile.dir, generationId: bootstrap.generationId,
  })
  const installed = createDesktopPluginManagerPolicy({
    diagnostic, store,
    protectedBundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-better-sidebar', 'dsh-plugin-desktop', 'dsh-community-market'],
    restoreRuntime: async () => {
      const apply = async () => { await reconcileProfilePatches(ctx.root, options.recompose().patches, 'dsh-plugin-desktop') }
      const hmr = ctx.get('hmr') as { runExclusive<T>(operation: () => Promise<T>): Promise<T> } | undefined
      if (hmr) await hmr.runExclusive(apply)
      else await apply()
    },
  })
  ctx.provide('desktopPluginManagerPolicy', installed)
  const path = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
  const profileContext: ProfileContext & { composePatches(): PreparedDesktopProfile['patches'] } = {
    name: prepared.profile.name, dir: prepared.profile.dir, patchPath: prepared.profile.patchPath,
    installAnchor: desktopInstallAnchor(), cwd: prepared.profile.dir, home: prepared.homeDir,
    startedBundles: prepared.profile.layers.map(layer => layer.packageName), overlays: [],
    telemetryDisabledEnv: options.telemetryDisabled,
    composePatches: () => options.recompose().patches,
    packageManager: {
      command: bootstrap.appExecutable,
      args: ['--import', pathToFileURL(bootstrap.clearEnvironmentPath).href, bootstrap.pnpmBinPath],
      env: {
        PATH: path ? `${bootstrap.nodeBinDir}${delimiter}${path}` : bootstrap.nodeBinDir,
        NODE: bootstrap.nodeShimPath, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: bootstrap.homeDir,
        CI: 'true', npm_config_runtime: 'electron', npm_config_target: bootstrap.electronVersion,
        npm_config_disturl: 'https://electronjs.org/headers',
      },
    },
  }
  ctx.provide('profileContext', profileContext)
  await ctx.plugin(PluginPackages, {
    generation: await createProfileResolutionGeneration({ installAnchor: desktopInstallAnchor(), home: prepared.homeDir, profile: prepared.profile }),
    behavior: 'enforce',
  })
  let committed = false
  let closed = false
  const listeners = new Set<() => void>()
  ctx.effect(() => () => { closed = true; listeners.clear() }, 'desktop: Profile readiness')
  return {
    ready: { onReady(listener) {
      if (committed && !closed) listener()
      else if (!closed) listeners.add(listener)
      return () => { listeners.delete(listener) }
    } },
    commitReady() {
      if (closed || committed) return
      committed = true
      for (const listener of listeners) listener()
      listeners.clear()
    },
  }
}

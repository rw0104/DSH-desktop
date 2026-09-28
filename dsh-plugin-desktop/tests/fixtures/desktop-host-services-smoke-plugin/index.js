/** Real profile-local Host plugin used by the complete Loader smoke. */
import { createRequire } from 'node:module'
import { marker as privateEsm } from 'dsh-profile-private-value'
import '@deepseek-ai/dsh-commands'
import '@deepseek-ai/dsh-llm'
import 'zod'

const privateCjs = createRequire(import.meta.url)('dsh-profile-private-value').marker
const runtimeUrls = Object.fromEntries(['@deepseek-ai/dsh-commands', '@deepseek-ai/dsh-llm', 'zod']
  .map(name => [name, import.meta.resolve(name)]))

export const name = 'desktop-host-services-smoke-plugin'

/** Both Desktop services must exist before Loader may activate this entry. */
export const inject = ['desktopProfiles', 'desktopPnpm']

/** Read the supported contracts and publish an assertion-friendly result. */
export function apply(ctx) {
  const current = ctx.desktopProfiles.current
  const pnpm = ctx.desktopPnpm
  ctx.provide('desktopHostServiceProbe', Object.freeze({
    privateEsm, privateCjs, runtimeUrls,
    current: Object.freeze({ name: current.name, dir: current.dir }),
    pnpm: Object.freeze({
      serviceName: pnpm.name,
      lookupRun: typeof ctx.get('desktopPnpm')?.run,
      run: typeof pnpm.run,
      runPlugin: typeof pnpm.runPlugin,
      installPlugin: typeof pnpm.installPlugin,
      recoveredInstallReceiptIds: typeof pnpm.recoveredInstallReceiptIds,
      acknowledgeRecoveredInstall: typeof pnpm.acknowledgeRecoveredInstall,
      rollbackPluginInstall: typeof pnpm.rollbackPluginInstall,
    }),
  }))
}

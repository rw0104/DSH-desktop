import type { Context } from '@deepseek-ai/cordis'
import type { DesktopPnpm } from './pnpm.ts'
import type { DesktopProfiles } from './profile-service.ts'
import type { DesktopRuntime } from './runtime.ts'
import { installPluginMarketRoutes } from './plugin-market-routes.ts'

export interface DesktopPluginCatalogEntry {
  readonly id: string
  readonly name: string
  readonly repository: string
  readonly description: string
  readonly spec: string
}

export interface DesktopPluginMarketEntry extends DesktopPluginCatalogEntry {
  readonly installed: boolean
  readonly removable: boolean
}

export interface DesktopPluginMarketSnapshot {
  readonly profile: string
  readonly entries: readonly DesktopPluginMarketEntry[]
}

export interface DesktopPluginMutationResult {
  readonly snapshot: DesktopPluginMarketSnapshot
  readonly restartRequired: true
  readonly output: string
}

export const DESKTOP_PLUGIN_CATALOG: readonly DesktopPluginCatalogEntry[] = [
  {
    id: '@huanlin/dsh-plugin-better-sidebar-plugin-office',
    name: 'Office preview',
    repository: 'https://github.com/HuanLinOTO/dsh-plugin-better-sidebar-plugin-office',
    description: 'DOCX, XLSX and PPTX preview support for Better Sidebar.',
    spec: '@huanlin/dsh-plugin-better-sidebar-plugin-office',
  },
  {
    id: 'dsh-video-preview',
    name: 'Video preview',
    repository: 'https://github.com/zemul/dsh-video-preview',
    description: 'Inline video preview for common media formats.',
    spec: 'dsh-video-preview',
  },
  {
    id: 'dsh-sidebar-qa',
    name: 'Sidebar Q&A',
    repository: 'https://github.com/ChenRuoT/dsh-sidebar-qa',
    description: 'Ask a focused follow-up question from selected content.',
    spec: 'git+https://github.com/ChenRuoT/dsh-sidebar-qa.git',
  },
] as const

const PRODUCT_PLUGIN_IDS = new Set(['@anionex/dsh-vision-toolkit', 'dsh-better-sidebar', 'dsh-plugin-desktop'])
const MAX_OUTPUT_CHARS = 32_768

/** Host-owned allowlisted plugin market backed by the active Desktop profile. */
export class DesktopPluginMarket {
  private operation: Promise<DesktopPluginMutationResult> | undefined
  private disposed = false

  constructor(
    private readonly pnpm: DesktopPnpm,
    private readonly profiles: DesktopProfiles,
    private readonly runtime: DesktopRuntime,
  ) {}

  snapshot(): DesktopPluginMarketSnapshot {
    this.assertLive()
    const profile = this.profiles.current.name
    const summary = this.profiles.list().find(item => item.name === profile)
    const installed = new Set(summary?.bundles ?? [])
    return {
      profile,
      entries: DESKTOP_PLUGIN_CATALOG.map(entry => ({
        ...entry,
        installed: installed.has(entry.id),
        removable: !PRODUCT_PLUGIN_IDS.has(entry.id),
      })),
    }
  }

  install(id: string): Promise<DesktopPluginMutationResult> {
    return this.mutate('add', id)
  }

  remove(id: string): Promise<DesktopPluginMutationResult> {
    return this.mutate('remove', id)
  }

  dispose(): void {
    this.disposed = true
  }

  private mutate(action: 'add' | 'remove', id: string): Promise<DesktopPluginMutationResult> {
    this.assertLive()
    const entry = DESKTOP_PLUGIN_CATALOG.find(candidate => candidate.id === id)
    if (entry === undefined) return Promise.reject(new Error('plugin-not-allowlisted'))
    if (action === 'remove' && PRODUCT_PLUGIN_IDS.has(entry.id)) return Promise.reject(new Error('plugin-not-removable'))
    if (this.operation !== undefined) return Promise.reject(new Error('plugin-operation-busy'))
    const task = this.run(action, entry)
    this.operation = task
    void task.finally(() => {
      if (this.operation === task) this.operation = undefined
    })
    return task
  }

  private async run(action: 'add' | 'remove', entry: DesktopPluginCatalogEntry): Promise<DesktopPluginMutationResult> {
    const profile = this.profiles.current
    const handle = this.pnpm.runPlugin([action, action === 'add' ? entry.spec : entry.id], profile.dir)
    const [stdout, stderr, outcome] = await Promise.all([
      readBounded(handle.stdout),
      readBounded(handle.stderr),
      handle.done,
    ])
    const output = `${stdout}${stderr === '' ? '' : `\n${stderr}`}`.slice(-MAX_OUTPUT_CHARS)
    if (outcome.exitCode !== 0) throw new Error(`plugin-${action}-failed:${output || String(outcome.exitCode)}`)
    this.runtime.requestRestart().catch(() => {})
    return { snapshot: this.snapshot(), restartRequired: true, output }
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('plugin-market-disposed')
  }
}

async function readBounded(stream: AsyncIterable<Uint8Array | string>): Promise<string> {
  let value = ''
  for await (const chunk of stream) {
    value += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    if (value.length > MAX_OUTPUT_CHARS) value = value.slice(-MAX_OUTPUT_CHARS)
  }
  return value
}

export const name = 'desktop-plugin-market'
export const inject = ['desktopPnpm', 'desktopProfiles', 'desktopRuntime']

export function apply(ctx: Context): void {
  const market = new DesktopPluginMarket(ctx.desktopPnpm, ctx.desktopProfiles, ctx.desktopRuntime)
  const disposeService = ctx.provide('desktopPluginMarket', market)
  const disposeRoute = installPluginMarketRoutes(ctx, market)
  ctx.effect(() => () => {
    disposeRoute()
    market.dispose()
    void disposeService()
  }, 'dsh-plugin-desktop: plugin market lifetime')
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopPluginMarket: DesktopPluginMarket
  }
}

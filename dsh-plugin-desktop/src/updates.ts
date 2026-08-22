/** Cordis Host plugin for scheduled and interactive DSH Desktop updates. */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from './runtime.ts'
import { startDesktopUpdateLifecycle, type DesktopUpdateLifecycle } from './update-lifecycle.ts'

/** Stable Cordis plugin name. */
export const name = 'desktop-updates'

/** Native adapter required for network, tray, confirmation, and installer access. */
export const inject = ['desktopRuntime', 'webServer']

/** Same-origin renderer action used by the About settings button. */
export const UPDATE_CHECK_PATH = '/dsh-desktop/api/check-updates'

const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Scheduled update policy. */
export interface Config {
  /** Enable background checks in packaged applications. */
  enabled: boolean
  /** Delay before the first background check after plugin activation. */
  initialDelayMs: number
  /** Delay between completion of one background check and the next attempt. */
  intervalMs: number
  /** Maximum duration of one version request before caller-owned cancellation. */
  requestTimeoutMs: number
}

/** Validated scheduled update policy. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  initialDelayMs: z.number().step(1).min(0).max(MAX_TIMER_DELAY_MS).default(60_000),
  intervalMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(6 * 60 * 60 * 1000),
  requestTimeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(15_000),
})

/**
 * Register effect-scoped update polling and its dynamic tray command.
 * @param ctx - Host context carrying the desktop native adapter.
 * @param config - validated polling and timeout values.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => {
    const lifecycle = startDesktopUpdateLifecycle({
      adapter: ctx.desktopRuntime.updates,
      policy: config,
      locale: () => ctx.desktopRuntime.locale,
      registerTrayItem: item => ctx.desktopRuntime.registerTrayItem(item),
    })
    const disposeRoute = installUpdateCheckRoute(ctx, lifecycle)
    return () => {
      disposeRoute()
      return lifecycle.dispose()
    }
  }, 'dsh-plugin-desktop: update polling, confirmation, and installer handoff')
}

/** Install the renderer-facing manual check route for one lifecycle. */
export function installUpdateCheckRoute(ctx: Context, lifecycle: Pick<DesktopUpdateLifecycle, 'checkNow'>): () => void {
  return ctx.webServer.register({
    kind: 'exact',
    path: UPDATE_CHECK_PATH,
    handler: async (req, res) => {
      if (!sameOrigin(ctx, req)) return writeJson(res, 403, { error: 'origin rejected' })
      if (req.method !== 'POST') return writeJson(res, 405, { error: 'method not allowed' })
      if (req.headers['x-dsh-desktop-action'] !== 'check-updates') {
        return writeJson(res, 403, { error: 'action header rejected' })
      }
      await lifecycle.checkNow()
      return writeJson(res, 200, { ok: true })
    },
  })
}

function sameOrigin(ctx: Context, req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return origin === undefined || origin === `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

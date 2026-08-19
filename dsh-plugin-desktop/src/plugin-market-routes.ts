import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { DesktopPluginMarket } from './plugin-market.ts'

const PLUGIN_MARKET_PATH = '/dsh-desktop/api/plugins/market'
const MAX_BODY_BYTES = 16 * 1024

/** Host API for the allowlisted Desktop plugin market. */
export function installPluginMarketRoutes(ctx: Context, market: DesktopPluginMarket): () => void {
  return ctx.webServer.register({
    kind: 'exact',
    path: PLUGIN_MARKET_PATH,
    handler: async (req, res) => {
      try {
        if (!sameOrigin(ctx, req)) return writeJson(res, 403, { error: 'origin rejected' })
        if (req.method === 'GET') return writeJson(res, 200, market.snapshot())
        if (req.method !== 'POST') return writeJson(res, 405, { error: 'method not allowed' })
        if (req.headers['x-dsh-workbench-action'] !== 'plugins') return writeJson(res, 403, { error: 'action header rejected' })
        const body = await readJson(req)
        const id = typeof body.id === 'string' ? body.id : ''
        if (body.action === 'install') return writeJson(res, 202, await market.install(id))
        if (body.action === 'remove') return writeJson(res, 202, await market.remove(id))
        return writeJson(res, 400, { error: 'unsupported plugin action' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const code = message.split(':', 1)[0] || 'plugin-market-failed'
        const status = code === 'plugin-not-allowlisted' || code === 'plugin-not-removable' ? 400 : 500
        return writeJson(res, status, { error: code, message })
      }
    },
  })
}

function sameOrigin(ctx: Context, req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return origin === undefined || origin === `http://${ctx.webServer.host}:${String(ctx.webServer.port)}`
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    bytes += buffer.byteLength
    if (bytes > MAX_BODY_BYTES) throw new Error('plugin-request-too-large')
    text += buffer.toString('utf8')
  }
  if (text.trim() === '') return {}
  const value: unknown = JSON.parse(text)
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

export { PLUGIN_MARKET_PATH }

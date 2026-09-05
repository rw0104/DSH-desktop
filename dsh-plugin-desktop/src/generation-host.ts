import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { GenerationPolicy } from './generation-policy.ts'
import { snapshotGenerationRoute, type ImageGenerationRoute } from './generation-broker.ts'

export const GENERATION_SETTINGS_NAMESPACE = 'dsh-desktop-generation'
export const GENERATION_SETTINGS_PATH = '/dsh-desktop/api/generation/settings'
export interface GenerationSettings { routes: ImageGenerationRoute[] }
export const GenerationSettingsSchema: z<GenerationSettings> = z.object({ routes: z.array(z.object({
  provider: z.string().min(1).max(200), model: z.string().min(1).max(200),
  protocol: z.union(['openai-images'] as const), endpoint: z.string().max(1000),
  credentialRef: z.string().max(200), responseFormat: z.union(['b64_json', 'native'] as const),
})).max(50).default([]) })

export function registerGenerationHost(ctx: Context): void {
  const settings = ctx.settings.register(GENERATION_SETTINGS_NAMESPACE, GenerationSettingsSchema, {
    applies: 'live', validate: value => { for (const route of value.routes) snapshotGenerationRoute(route.provider, value.routes) },
  })
  ctx.inject(['tools', 'systemPrompt', 'agents'], policyCtx => { new GenerationPolicy(policyCtx, () => settings.get().routes) })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: GENERATION_SETTINGS_PATH, handler: async (req, res) => {
    const send = (status: number, value: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value))
    }
    if ((req.headers.origin !== undefined || req.method !== 'GET') && req.headers.origin !== `http://127.0.0.1:${ctx.webServer.port}`
      || req.headers['x-dsh-desktop-action'] !== 'generation-settings') return send(403, { message: 'Forbidden' })
    if (req.method === 'GET') return send(200, settings.get())
    if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') return send(405, { message: 'JSON POST required.' })
    const chunks: Buffer[] = []; let size = 0
    try {
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length
        if (size > 64 * 1024) return send(413, { message: 'Generation settings are too large.' })
        chunks.push(bytes)
      }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as GenerationSettings
      if (!value || !Array.isArray(value.routes)) return send(400, { message: 'Expected generation routes.' })
      await settings.update({ routes: value.routes })
      send(200, { ok: true })
    } catch { send(400, { message: 'Invalid route: choose a unique provider, image model, HTTPS Images API endpoint, protocol and credential reference.' }) }
  } }), 'desktop: controlled generation settings')
}

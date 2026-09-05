import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { credentialKeyId, isCredentialRefName, parseCredentialKey } from '@deepseek-ai/dsh-credentials'

/** Explicit operator configuration. Model names never select a wire protocol. */
export interface ImageGenerationRoute {
  provider: string
  model: string
  protocol: 'openai-images'
  endpoint: string
  credentialRef: string
  responseFormat: 'b64_json' | 'native'
}
export interface GenerationAudit {
  capability: 'image'; provider: string; model: string; destination: string;
  authorization: 'user-generation-route'; outcome: string;
}
export class GenerationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'GenerationError' }
}

const MAX_RESPONSE = 16 * 1024 * 1024
const MAX_IMAGE = 10 * 1024 * 1024

function validCredentialReference(ref: string, provider: string): boolean {
  if (ref.length > 200) return false
  if (isCredentialRefName(ref)) return true
  try { return credentialKeyId(parseCredentialKey(ref)) === provider } catch { return false }
}

export function snapshotGenerationRoute(provider: string, routes: readonly ImageGenerationRoute[]): Readonly<ImageGenerationRoute> {
  const matches = routes.filter(route => route.provider === provider)
  if (matches.length !== 1) throw new GenerationError('NOT_CONFIGURED', '当前供应商的生图能力未配置。请在“受控生成”设置中明确模型和协议；不会调用其他服务或寻找凭据。/generation off 返回普通 Agent 模式。 / Image generation is not configured for the selected provider; no fallback is allowed. Use /generation off to restore ordinary Agent tools.')
  const route = matches[0]!
  let endpoint: URL
  try { endpoint = new URL(route.endpoint) } catch { throw new GenerationError('INVALID_ROUTE', 'Invalid image endpoint.') }
  if (route.protocol !== 'openai-images' || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || !endpoint.pathname.endsWith('/images/generations') || !route.model.trim() || route.model.length > 200
    || !validCredentialReference(route.credentialRef, provider) || !['b64_json', 'native'].includes(route.responseFormat)) {
    throw new GenerationError('INVALID_ROUTE', 'Configure an explicit HTTPS Images API endpoint, output model, protocol, and credential reference.')
  }
  return Object.freeze({ ...route, endpoint: endpoint.href })
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    await response.body?.cancel().catch(() => {})
    throw new GenerationError('INVALID_RESPONSE', 'Image provider did not return JSON.')
  }
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE) {
    await response.body?.cancel().catch(() => {})
    throw new GenerationError('RESPONSE_LIMIT', 'Image response exceeded the configured size limit.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new GenerationError('INVALID_RESPONSE', 'Image provider returned an empty response.')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE) throw new GenerationError('RESPONSE_LIMIT', 'Image response exceeded the configured size limit.')
      chunks.push(value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
    catch { throw new GenerationError('INVALID_RESPONSE', 'Image provider returned invalid JSON.') }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

function decodeImage(value: unknown): { data: Buffer; mediaType: ImageMediaType } {
  const response = value as { data?: { b64_json?: unknown }[] } | null
  const encoded = Array.isArray(response?.data) && response.data.length === 1 ? response.data[0]?.b64_json : undefined
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length % 4 !== 0 || encoded.length > Math.ceil(MAX_IMAGE / 3) * 4 || /[^A-Za-z0-9+/=]/u.test(encoded)) {
    throw new GenerationError('INVALID_IMAGE', 'Expected exactly one bounded inline image. Remote image URLs are not fetched; no alternate endpoint is used.')
  }
  const data = Buffer.from(encoded, 'base64')
  if (data.toString('base64') !== encoded) throw new GenerationError('INVALID_IMAGE', 'Provider returned invalid base64 image data.')
  if (data.length > MAX_IMAGE) throw new GenerationError('IMAGE_LIMIT', 'Generated image exceeded the configured size limit.')
  const mediaType = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
    : data[0] === 255 && data[1] === 216 && data[2] === 255 ? 'image/jpeg'
    : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : undefined
  if (!mediaType) throw new GenerationError('INVALID_IMAGE', 'Provider output is not a supported raster image.')
  return { data, mediaType }
}

/** One request, one explicit credential, no retries, redirects, URL downloads, CLI, or fallback. */
export async function generateImage(route: Readonly<ImageGenerationRoute>, prompt: string, caller: AbortSignal, deps: {
  resolveCredential(ref: string): Promise<string | undefined>
  fetch?: typeof globalThis.fetch
  audit(event: GenerationAudit): void
  timeoutMs?: number
}): Promise<{ data: Buffer; mediaType: ImageMediaType }> {
  route = snapshotGenerationRoute(route.provider, [route])
  const audit = (outcome: string): void => deps.audit({ capability: 'image', provider: route.provider, model: route.model,
    destination: new URL(route.endpoint).host, authorization: 'user-generation-route', outcome })
  const deadline = AbortSignal.timeout(deps.timeoutMs ?? 120_000)
  const signal = AbortSignal.any([caller, deadline])
  try {
    signal.throwIfAborted()
    if (!prompt.trim() || prompt.length > 12_000) throw new GenerationError('INVALID_PROMPT', 'Image prompt must contain 1–12000 characters.')
    const key = await deps.resolveCredential(route.credentialRef)
    signal.throwIfAborted()
    if (!key?.trim()) throw new GenerationError('MISSING_CREDENTIAL', 'The configured image credential is unavailable. No other credential will be searched.')
    audit('started')
    const response = await (deps.fetch ?? globalThis.fetch)(route.endpoint, {
      method: 'POST', redirect: 'error', signal,
      headers: { ...attributionHeaders(), 'content-type': 'application/json', accept: 'application/json', 'accept-encoding': 'identity', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: route.model, prompt, n: 1, ...(route.responseFormat === 'b64_json' ? { response_format: 'b64_json' } : {}) }),
    })
    signal.throwIfAborted()
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new GenerationError(`HTTP_${response.status}`, `Image provider returned HTTP ${response.status}. Stopped without switching provider or credentials.`)
    }
    const image = decodeImage(await readBoundedJson(response, signal))
    signal.throwIfAborted()
    audit('received')
    return image
  } catch (cause) {
    const error = caller.aborted ? new GenerationError('CANCELLED', 'Image generation was cancelled.')
      : deadline.aborted ? new GenerationError('TIMEOUT', 'Image generation timed out; no fallback was attempted.')
      : cause instanceof GenerationError ? cause : new GenerationError('TRANSPORT', 'Image request failed; no fallback was attempted.')
    audit(error.code)
    throw error
  }
}

import { describe, expect, it, vi } from 'vitest'
import { generateImage, snapshotGenerationRoute, type ImageGenerationRoute } from '../src/generation-broker.ts'

const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAZkAAAAASUVORK5CYII='
const route: ImageGenerationRoute = { provider: 'gateway-a', model: 'explicit-image-model', protocol: 'openai-images', endpoint: 'https://gateway-a.invalid/v1/images/generations', credentialRef: 'GATEWAY_A_KEY', responseFormat: 'b64_json' }
const response = () => new Response(JSON.stringify({ data: [{ b64_json: image }] }), { headers: { 'content-type': 'application/json' } })

describe('controlled image broker', () => {
  it('fails closed for an absent, ambiguous or unsafe route without guessing a model protocol', () => {
    expect(() => snapshotGenerationRoute('gateway-b', [route])).toThrow(/未配置/)
    expect(() => snapshotGenerationRoute('gateway-a', [route, route])).toThrow(/未配置/)
    for (const endpoint of ['http://gateway-a.invalid/images/generations', 'https://user:secret@gateway-a.invalid/images/generations', route.endpoint + '?key=secret', 'https://gateway-a.invalid/chat/completions']) {
      expect(() => snapshotGenerationRoute('gateway-a', [{ ...route, endpoint }])).toThrow()
    }
    expect(() => snapshotGenerationRoute('gateway-a', [{ ...route, protocol: 'guessed' } as never])).toThrow()
  })
  it('sends one explicit image route and credential without including chat history', async () => {
    const fetch = vi.fn().mockResolvedValue(response()), resolveCredential = vi.fn().mockResolvedValue('fixture-secret'), audit = vi.fn()
    const result = await generateImage(route, 'a lighthouse', new AbortController().signal, { fetch, resolveCredential, audit })
    expect(result.mediaType).toBe('image/png')
    expect(resolveCredential.mock.calls).toEqual([['GATEWAY_A_KEY']])
    expect(fetch).toHaveBeenCalledExactlyOnceWith(route.endpoint, expect.objectContaining({ method: 'POST', redirect: 'error',
      body: JSON.stringify({ model: route.model, prompt: 'a lighthouse', n: 1, response_format: 'b64_json' }) }))
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(/fixture-secret|a lighthouse|b64_json|GATEWAY_A_KEY/)
  })
  for (const status of [401, 403, 429, 500]) it(`does not retry, switch credentials or query balances after HTTP ${status}`, async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('secret echoed by provider', { status }))
    const resolveCredential = vi.fn().mockResolvedValue('fixture-secret'), audit = vi.fn()
    await expect(generateImage(route, 'test', new AbortController().signal, { fetch, resolveCredential, audit })).rejects.toMatchObject({ code: `HTTP_${status}` })
    expect(fetch).toHaveBeenCalledTimes(1); expect(resolveCredential).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(audit.mock.calls)).not.toContain('secret')
  })
  it('does not search a second credential when the configured key is missing', async () => {
    const fetch = vi.fn(), resolveCredential = vi.fn().mockResolvedValue(undefined)
    await expect(generateImage(route, 'test', new AbortController().signal, { fetch, resolveCredential, audit: vi.fn() })).rejects.toMatchObject({ code: 'MISSING_CREDENTIAL' })
    expect(fetch).not.toHaveBeenCalled(); expect(resolveCredential).toHaveBeenCalledTimes(1)
  })
  it('does not download provider URLs or execute a second representation', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://other-provider.invalid/image.png' }] }), { headers: { 'content-type': 'application/json' } }))
    await expect(generateImage(route, 'test', new AbortController().signal, { fetch, resolveCredential: async () => 'fixture', audit: vi.fn() })).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects oversized, malformed and non-image responses', async () => {
    for (const response of [
      new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(17 * 1024 * 1024) } }),
      new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }),
      new Response(JSON.stringify({ data: [{ b64_json: 'PHNjcmlwdD4=' }] }), { headers: { 'content-type': 'application/json' } }),
    ]) {
      const fetch = vi.fn().mockResolvedValue(response)
      await expect(generateImage(route, 'test', new AbortController().signal, { fetch, resolveCredential: async () => 'fixture', audit: vi.fn() })).rejects.toThrow()
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })
  it('snapshots the route before credential resolution and honors cancellation after that await', async () => {
    const controller = new AbortController(), fetch = vi.fn(), mutable = { ...route }
    await expect(generateImage(mutable, 'test', controller.signal, { fetch, audit: vi.fn(), resolveCredential: async () => {
      mutable.endpoint = 'https://other.invalid/v1/images/generations'; controller.abort(); return 'fixture'
    } })).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('aborts a timed-out request without another request', async () => {
    const fetch = vi.fn((_url: unknown, init: RequestInit | undefined) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))))
    await expect(generateImage(route, 'test', new AbortController().signal, { fetch, resolveCredential: async () => 'fixture', audit: vi.fn(), timeoutMs: 10 })).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('uses native base64 only when explicitly configured', async () => {
    const fetch = vi.fn().mockResolvedValue(response())
    await generateImage({ ...route, responseFormat: 'native' }, 'test', new AbortController().signal, { fetch, resolveCredential: async () => 'fixture', audit: vi.fn() })
    expect(JSON.parse(fetch.mock.calls[0]![1].body as string)).not.toHaveProperty('response_format')
  })
})

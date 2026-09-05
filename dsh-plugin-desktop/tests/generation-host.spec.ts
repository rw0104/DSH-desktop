import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it, vi } from 'vitest'
import { GenerationSettingsSchema, registerGenerationHost } from '../src/generation-host.ts'

function host() {
  let route: WebRoute | undefined
  const update = vi.fn().mockResolvedValue(undefined)
  const ctx = {
    settings: { register: () => ({ get: () => ({ routes: [] }), update }) },
    inject: vi.fn(), effect: (fn: () => unknown) => fn(),
    webServer: { port: 32100, register: (value: WebRoute) => { route = value; return () => {} } },
  } as unknown as Context
  registerGenerationHost(ctx)
  return { update, async request(method: string, headers: Record<string, string>, body = '') {
    let status = 0, data: unknown
    const req = { method, headers, async *[Symbol.asyncIterator]() { yield Buffer.from(body) } } as unknown as IncomingMessage
    const res = { writeHead: (value: number) => { status = value }, end: (value: string) => { data = JSON.parse(value) } } as unknown as ServerResponse
    await route!.handler(req, res)
    return { status, data }
  } }
}

describe('controlled generation settings boundary', () => {
  it('has no default provider, model, endpoint or credential', () => {
    expect(GenerationSettingsSchema({} as never)).toEqual({ routes: [] })
  })
  it('requires same-origin JSON and a custom action header before persisting routes', async () => {
    const test = host()
    const headers = { origin: 'http://127.0.0.1:32100', 'content-type': 'application/json', 'x-dsh-desktop-action': 'generation-settings' }
    expect((await test.request('POST', { ...headers, origin: 'https://untrusted.invalid' }, '{"routes":[]}')).status).toBe(403)
    expect((await test.request('POST', { 'content-type': 'application/json', 'x-dsh-desktop-action': 'generation-settings' }, '{"routes":[]}')).status).toBe(403)
    expect((await test.request('POST', { ...headers, 'x-dsh-desktop-action': '' }, '{"routes":[]}')).status).toBe(403)
    expect(test.update).not.toHaveBeenCalled()
    expect((await test.request('POST', headers, '{"routes":[]}')).status).toBe(200)
    expect(test.update).toHaveBeenCalledExactlyOnceWith({ routes: [] })
  })
  it('bounds settings bodies and allows same-origin browser GET without an Origin header', async () => {
    const test = host()
    expect(await test.request('GET', { 'x-dsh-desktop-action': 'generation-settings' })).toEqual({ status: 200, data: { routes: [] } })
    expect((await test.request('POST', { origin: 'http://127.0.0.1:32100', 'content-type': 'application/json', 'x-dsh-desktop-action': 'generation-settings' }, ' '.repeat(70 * 1024))).status).toBe(413)
    expect(test.update).not.toHaveBeenCalled()
  })
})

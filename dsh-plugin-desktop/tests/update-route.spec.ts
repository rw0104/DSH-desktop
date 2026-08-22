import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { installUpdateCheckRoute, UPDATE_CHECK_PATH } from '../src/updates.ts'

describe('renderer update check route', () => {
  it('accepts only the same-origin POST action and invokes the lifecycle', async () => {
    const checkNow = vi.fn(async () => {})
    const routes = new Map<string, (req: any, res: any) => Promise<void>>()
    const context = {
      webServer: {
        host: '127.0.0.1',
        port: 43120,
        register: (route: any) => { routes.set(route.path, route.handler); return () => {} },
      },
    } as any
    const dispose = installUpdateCheckRoute(context, { checkNow })
    const handler = routes.get(UPDATE_CHECK_PATH)
    if (handler === undefined) throw new Error('update route not installed')
    try {
      const response = responseRecorder()
      await handler(request(), response)
      expect(response.statusCode).toBe(200)
      expect(checkNow).toHaveBeenCalledOnce()

      const rejected = responseRecorder()
      await handler(request({ origin: 'http://evil.example' }), rejected)
      expect(rejected.statusCode).toBe(403)
      expect(checkNow).toHaveBeenCalledOnce()
    } finally {
      dispose()
    }
  })
})

function request(extraHeaders: Record<string, string> = {}) {
  return Object.assign(Readable.from([]), {
    method: 'POST',
    url: UPDATE_CHECK_PATH,
    headers: { 'x-dsh-desktop-action': 'check-updates', ...extraHeaders },
  })
}

function responseRecorder() {
  let body = ''
  return {
    statusCode: 0,
    setHeader: vi.fn(),
    end: (value: string) => { body = value },
    json: () => JSON.parse(body) as unknown,
  }
}

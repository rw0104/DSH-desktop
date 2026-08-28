import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  installUpdateCheckRoute,
  installUpdateStateRoutes,
  UPDATE_CHECK_PATH,
} from '../src/updates.ts'
import {
  DESKTOP_UPDATE_STATE_EVENTS_PATH,
  DESKTOP_UPDATE_STATE_PATH,
  type DesktopUpdateUiState,
} from '../src/update-ui-state.ts'

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

  it('serves a read-only snapshot and generation-scoped state events', async () => {
    let state: DesktopUpdateUiState = { generation: 7, revision: 2, phase: 'checking' }
    const listeners = new Set<(value: DesktopUpdateUiState) => void>()
    const disposers: ReturnType<typeof vi.fn>[] = []
    const routes = new Map<string, (req: any, res: any) => Promise<void>>()
    const context = {
      webServer: {
        host: '127.0.0.1',
        port: 43120,
        register: (route: any) => {
          routes.set(route.path, route.handler)
          const dispose = vi.fn()
          disposers.push(dispose)
          return dispose
        },
      },
    } as any
    const dispose = installUpdateStateRoutes(context, {
      getUiState: () => state,
      subscribeUiState: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    })
    try {
      const snapshot = responseRecorder()
      await routes.get(DESKTOP_UPDATE_STATE_PATH)!(getRequest(DESKTOP_UPDATE_STATE_PATH), snapshot)
      expect(snapshot.statusCode).toBe(200)
      expect(snapshot.json()).toEqual(state)

      const rejected = responseRecorder()
      await routes.get(DESKTOP_UPDATE_STATE_PATH)!(
        getRequest(DESKTOP_UPDATE_STATE_PATH, { origin: 'http://evil.example' }),
        rejected,
      )
      expect(rejected.statusCode).toBe(403)

      const events = responseRecorder()
      const streamRequest = Object.assign(new EventEmitter(), {
        method: 'GET',
        url: DESKTOP_UPDATE_STATE_EVENTS_PATH,
        headers: {},
      })
      await routes.get(DESKTOP_UPDATE_STATE_EVENTS_PATH)!(streamRequest, events)
      expect(events.statusCode).toBe(200)
      expect(events.text()).toContain(`data: ${JSON.stringify(state)}`)
      expect(listeners).toHaveLength(1)

      state = {
        generation: 7,
        revision: 3,
        phase: 'downloading',
        version: '2.0.12',
        receivedBytes: 42,
        totalBytes: 100,
      }
      for (const listener of listeners) listener(state)
      expect(events.text()).toContain(`data: ${JSON.stringify(state)}`)

      dispose()
      expect(listeners).toHaveLength(0)
      expect(events.writableEnded).toBe(true)
      expect(disposers.every(candidate => candidate.mock.calls.length === 1)).toBe(true)
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

function getRequest(path: string, extraHeaders: Record<string, string> = {}) {
  return Object.assign(Readable.from([]), {
    method: 'GET',
    url: path,
    headers: extraHeaders,
  })
}

function responseRecorder() {
  const chunks: string[] = []
  let ended = false
  return {
    statusCode: 0,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    once: vi.fn(),
    get writableEnded() { return ended },
    write: (value: string) => { chunks.push(value); return true },
    end: (value?: string) => {
      if (value !== undefined) chunks.push(value)
      ended = true
    },
    text: () => chunks.join(''),
    json: () => JSON.parse(chunks.join('')) as unknown,
  }
}

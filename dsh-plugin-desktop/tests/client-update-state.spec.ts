import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readDesktopUpdateUiState,
  subscribeDesktopUpdateUiState,
} from '../src/client/update-state.ts'
import {
  DESKTOP_UPDATE_STATE_EVENTS_PATH,
  DESKTOP_UPDATE_STATE_PATH,
  parseDesktopUpdateUiState,
  type DesktopUpdateUiState,
} from '../src/update-ui-state.ts'

class FakeEventSource {
  static readonly instances: FakeEventSource[] = []
  readonly listeners = new Map<string, Set<(event: Event) => void>>()
  readonly close = vi.fn()

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(name: string, listener: EventListener): void {
    const listeners = this.listeners.get(name) ?? new Set()
    listeners.add(listener)
    this.listeners.set(name, listeners)
  }

  removeEventListener(name: string, listener: EventListener): void {
    this.listeners.get(name)?.delete(listener)
  }

  emit(name: string, data: string): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data } as unknown as MessageEvent<string>)
    }
  }
}

afterEach(() => {
  FakeEventSource.instances.splice(0)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('desktop update Renderer state client', () => {
  it('reads and validates the current same-origin snapshot', async () => {
    const state: DesktopUpdateUiState = {
      generation: 5,
      revision: 9,
      phase: 'downloading',
      version: '2.0.12',
      receivedBytes: 40,
      totalBytes: 100,
    }
    const fetch = vi.fn(async () => Response.json(state))
    vi.stubGlobal('fetch', fetch)

    await expect(readDesktopUpdateUiState()).resolves.toEqual(state)
    expect(fetch).toHaveBeenCalledWith(DESKTOP_UPDATE_STATE_PATH, expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
    }))
    expect(parseDesktopUpdateUiState({ ...state, receivedBytes: -1 })).toBeUndefined()
    expect(parseDesktopUpdateUiState({ ...state, phase: 'failed', code: 'C:\\secret' })).toBeUndefined()
  })

  it('lets multiple About surfaces observe one Host event without issuing actions', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const first = vi.fn()
    const second = vi.fn()
    const disposeFirst = subscribeDesktopUpdateUiState(first)
    const disposeSecond = subscribeDesktopUpdateUiState(second)
    const state: DesktopUpdateUiState = {
      generation: 8,
      revision: 3,
      phase: 'verifying',
      version: '2.0.12',
      totalBytes: 100,
    }

    expect(FakeEventSource.instances.map(instance => instance.url))
      .toEqual([DESKTOP_UPDATE_STATE_EVENTS_PATH, DESKTOP_UPDATE_STATE_EVENTS_PATH])
    for (const instance of FakeEventSource.instances) instance.emit('state', JSON.stringify(state))
    expect(first).toHaveBeenCalledWith(state)
    expect(second).toHaveBeenCalledWith(state)

    FakeEventSource.instances[0]!.emit('state', '{invalid')
    expect(first).toHaveBeenCalledOnce()
    disposeFirst()
    disposeSecond()
    expect(FakeEventSource.instances.every(instance => instance.close.mock.calls.length === 1)).toBe(true)
  })
})

import { describe, expect, it, vi } from 'vitest'

const { createNativeSurface } = await vi.importActual<{
  createNativeSurface(ctx: unknown, records: unknown): {
    openTab(value: { sessionId: string; kind: string; params: { sidebarTabId: string; title: string }; revealIfOpened: boolean }): void
    close(sessionId: string, tabId: string): { type: string; title: string } | undefined
    dispose(): void
  }
}>('dsh-better-sidebar/src/client/native/surface.ts')
const { currentSidebarSession } = await vi.importActual<{
  currentSidebarSession(snapshot: unknown): string | undefined
}>('dsh-better-sidebar/src/client/session-selection.ts')

function harness() {
  const tabs = new Map<string, Array<{ id: string; kind: string; title: string }>>()
  let inventoryChanged = () => {}
  const unsubscribe = vi.fn()
  const records = { get: vi.fn(), drop: vi.fn(), has: vi.fn(), update: vi.fn() }
  const api = {
    tabsIn: (id: string) => tabs.get(id) ?? [],
    openTabs: { subscribe: (listener: () => void) => { inventoryChanged = listener; return unsubscribe } },
    openTabIn: vi.fn((sessionId: string, kind: string) => {
      tabs.get(sessionId)!.push({ id: `native:${sessionId}`, kind, title: kind })
      // Real inventory notifications are synchronous; this must not replay twice.
      inventoryChanged()
    }),
    closeIn: vi.fn(),
  }
  const surface = createNativeSurface({ get: () => api, sessions: { list: {
    subscribe: () => () => {}, getSnapshot: () => ({ byId: { main: { id: 'main', retainedBy: { mainView: 1 } } } }),
  } } }, records)
  const open = (id: string) => surface.openTab({ sessionId: id, kind: 'fixture', params: { sidebarTabId: 'caller-id', title: 'Fixture' }, revealIfOpened: true })
  return { surface, tabs, api, records, unsubscribe, open, changed: () => inventoryChanged() }
}

describe('native Sidebar Session scope bridge', () => {
  it('derives the main selection from ownership instead of the retired catalog current field', () => {
    expect(currentSidebarSession({ byId: { a: { id: 'a', retainedBy: { controllerOperation: 2 } }, b: { id: 'b', retainedBy: { mainView: 1 } } } })).toBe('b')
  })
  it('keeps unadopted opens queued and closes one scope without disturbing another', () => {
    const h = harness()
    h.open('a'); h.open('b')
    expect(h.api.openTabIn).not.toHaveBeenCalled()
    expect(h.surface.close('a', 'caller-id')).toEqual({ type: 'fixture', title: 'Fixture' })
    h.tabs.set('a', [{ id: 'guide-a', kind: 'guide', title: 'Guide' }])
    h.tabs.set('b', [{ id: 'guide-b', kind: 'guide', title: 'Guide' }])
    h.changed()
    expect(h.api.openTabIn).toHaveBeenCalledOnce()
    expect(h.api.openTabIn).toHaveBeenCalledWith('b', 'fixture', expect.anything())
    expect(h.surface.close('b', 'caller-id')).toEqual({ type: 'fixture', title: 'Fixture' })
    expect(h.api.closeIn).toHaveBeenCalledWith('b', 'native:b')
    h.surface.dispose()
    expect(h.unsubscribe).toHaveBeenCalledOnce()
  })
  it('refuses a native tab belonging to another Session', () => {
    const h = harness()
    h.records.get.mockReturnValue({ scope: { sessionId: 'b' }, tab: { type: 'fixture', title: 'B' } })
    expect(h.surface.close('a', 'native:b')).toBeUndefined()
    expect(h.api.closeIn).not.toHaveBeenCalled()
    expect(h.records.drop).not.toHaveBeenCalled()
    h.surface.dispose()
  })
})

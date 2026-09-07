import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'
import type { DesktopVoiceController } from '../src/client/voice-controller.ts'
import { VoiceOverlay } from '../src/client/voice-ui.tsx'
import { DesktopVoiceController as Controller } from '../src/client/voice-controller.ts'

// The maintained source carries its own legacy Cordis declaration graph. Load
// it at runtime without merging that graph into the Desktop client contracts.
interface SidebarStore {
  getPrefs(): { openByDefault: boolean; tabsEnabled: Record<string, boolean> }
  setPrefs(value: ReturnType<SidebarStore['getPrefs']>): void
  setSession(id: string): void
  getSnapshot(): { state?: { panelOpen: boolean } }
}
const { createSidebarStore } = await vi.importActual<{ createSidebarStore(): SidebarStore }>('dsh-better-sidebar/src/client/state.ts')
const { createBetterSidebarService } = await vi.importActual<{ createBetterSidebarService(store: SidebarStore): unknown }>('dsh-better-sidebar/src/client/service.ts')

// Root styling and file intake do not own voice registration. Keep the real
// desktop plugin, controller and Sidebar state machine at this regression seam.
vi.mock('../src/client/advanced-shell.ts', () => ({ applyAdvancedShell() {} }))
vi.mock('../src/client/experience.tsx', () => ({ installClientExperience() {} }))

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function composition(mode: 'advanced' | 'compatibility', enabled = true) {
  vi.useFakeTimers()
  vi.stubGlobal('window', { location: { search: `?dsh-desktop-mode=${mode}&dsh-desktop-platform=win32` }, innerWidth: 1440, setTimeout, clearTimeout })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })
  const store = createSidebarStore()
  store.setPrefs({ ...store.getPrefs(), openByDefault: false, tabsEnabled: { 'desktop:voice': enabled } })
  store.setSession('voice-test')
  const sidebar = createBetterSidebarService(store)
  const registrations: { name: string; id?: string; inject?: () => { controller: DesktopVoiceController }; component: unknown }[] = []
  const ctx = {
    get: (name: string) => name === 'betterSidebar' ? sidebar : undefined,
    effect: (effect: () => unknown, name: string) => name.endsWith('realtime voice sidebar tab') ? effect() : undefined,
    locale: { subscribe: () => () => {}, getLocale: () => ({ active: 'en' }), bind: () => (key: string) => key },
    settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {} }) },
    remote: { credentials: { describe: async () => ({ ok: true, value: {} }) } },
    slots: {
      inject: (_name: string, install: () => unknown) => install(),
      register: (options: Omit<(typeof registrations)[number], 'component'>, component: unknown) => { registrations.push({ ...options, component }); return () => {} },
    },
  }
  apply(ctx as never)
  const controller = registrations.find(item => item.name === 'conversation.input.right')!.inject!().controller
  return { registrations, controller, store }
}

describe('voice presentation in the actual desktop composition', () => {
  it.each(['advanced', 'compatibility'] as const)('mounts the same independent voice surface in %s with the sidebar collapsed', mode => {
    const { registrations, controller, store } = composition(mode)
    const overlays = registrations.filter(item => item.component === VoiceOverlay)
    expect(overlays).toHaveLength(1)
    expect(overlays[0]!.inject!().controller).toBe(controller)
    controller.open('voice-test')
    expect(controller.panel.getSnapshot()).toBe('voice-test')
    expect(store.getSnapshot().state?.panelOpen).toBe(false)
    controller.minimizePanel()
    expect(controller.minimized.getSnapshot()).toBe(true)
    controller.restorePanel()
    expect(controller.minimized.getSnapshot()).toBe(false)
  })

  it('does not depend on the legacy voice tab being enabled', () => {
    const { controller, store } = composition('advanced', false)
    controller.open('voice-test')
    expect(controller.panel.getSnapshot()).toBe('voice-test')
    expect(store.getSnapshot().state?.panelOpen).toBe(false)
  })

  it('does not request a ticket or microphone until the intended panel is visible', async () => {
    const { controller } = composition('advanced')
    controller.store.set({ ...controller.getSnapshot(), settings: { ...controller.getSnapshot().settings, enabled: true } })
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'fixture denial' }), { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const opening = controller.openAndStart('voice-test')
    controller.presentation.attach('different-session', () => true)
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
    let visible = false
    controller.presentation.attach('voice-test', () => visible)
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
    visible = true
    controller.presentation.check()
    await opening
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().error).toBe('fixture denial')
  })

  it('coalesces repeated clicks and reports a covered panel without requesting audio', async () => {
    const { controller } = composition('advanced')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const opening = controller.openAndStart('voice-test')
    expect(controller.openAndStart('other-session')).toBe(opening)
    expect(controller.panel.getSnapshot()).toBe('voice-test')
    controller.presentation.attach('voice-test', () => false)
    await vi.advanceTimersByTimeAsync(2_001)
    await opening
    expect(fetch).not.toHaveBeenCalled()
    expect(controller.getSnapshot().error).toBe('voice_panel_not_visible')
  })

  it('cancels a pending mount on close and restores an active call in its original session', async () => {
    const { controller } = composition('advanced')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const opening = controller.openAndStart('voice-test')
    await controller.closePanel()
    controller.presentation.attach('voice-test', () => true)
    await opening
    expect(fetch).not.toHaveBeenCalled()
    controller.open('voice-test')
    controller.store.set({ ...controller.getSnapshot(), status: 'listening' })
    controller.minimizePanel()
    await controller.openAndStart('different-session')
    expect(controller.panel.getSnapshot()).toBe('voice-test')
    expect(controller.minimized.getSnapshot()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('unsubscribes once and closes an unmounted controller without starting a delayed call', async () => {
    vi.useFakeTimers()
    const unsubscribe = vi.fn()
    const controller = new Controller({
      settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => unsubscribe }) },
      remote: { credentials: { describe: async () => ({ ok: true, value: {} }) } },
    } as never)
    const opening = controller.openAndStart('session')
    await controller.dispose()
    await controller.dispose()
    await opening
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(controller.panel.getSnapshot()).toBeNull()
    await controller.openAndStart('session')
    expect(controller.panel.getSnapshot()).toBeNull()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useId: () => 'menu-owner',
  useLayoutEffect: (effect: () => (() => void) | undefined) => { hooks.cleanup = effect() },
}))
const { useSidebarSubmenuPlacement } = await vi.importActual<{
  useSidebarSubmenuPlacement(menu: { x: number; y: number } | null): string
}>('dsh-better-sidebar/src/client/menu-placement.ts')

afterEach(() => { hooks.cleanup?.(); hooks.cleanup = undefined; vi.unstubAllGlobals() })

describe('Sidebar menu focus and listener ownership', () => {
  it.each([true, false])('restores focus only when Escape originates in its own menu: %s', async owned => {
    class ElementFixture { isConnected = true; focus = vi.fn() }
    const trigger = new ElementFixture()
    const ownedItem = {}
    const otherItem = {}
    const listeners = new Map<string, (event: { key: string }) => void>()
    const root = { contains: (item: unknown) => item === ownedItem, querySelectorAll: () => [] }
    const doc = {
      activeElement: trigger as unknown,
      body: {},
      querySelectorAll: () => [{ getAttribute: () => 'menu-owner', closest: () => root }],
      addEventListener: (name: string, listener: (event: { key: string }) => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    }
    const disconnect = vi.fn()
    vi.stubGlobal('HTMLElement', ElementFixture)
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', { innerWidth: 800, innerHeight: 600, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect = disconnect })
    expect(useSidebarSubmenuPlacement({ x: 760, y: 40 })).toBe('menu-owner')
    doc.activeElement = owned ? ownedItem : otherItem
    listeners.get('keydown')!({ key: 'Escape' })
    await Promise.resolve()
    expect(trigger.focus).toHaveBeenCalledTimes(owned ? 1 : 0)
    hooks.cleanup?.(); hooks.cleanup = undefined
    expect(disconnect).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
  })
})

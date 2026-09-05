import { createContext, createElement, useContext, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdvancedFrame } from '../src/client/AdvancedFrame.tsx'
import { DesktopLayoutState } from '../src/client/layout-state.ts'

// Exercise the real frame/child rendering; geometry and browser effects are independent.
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useCallback: (fn: unknown) => fn, useEffect: () => {}, useRef: (value: unknown) => ({ current: value }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}))
afterEach(() => vi.unstubAllGlobals())
describe('advanced frame Session scope', () => {
  for (const selected of [false, true]) it(`provides the strict details scope when selected=${selected}`, () => {
    vi.stubGlobal('window', { innerWidth: 1280 })
    const scope = createContext(false)
    function Details() { if (!useContext(scope)) throw new Error('strict details rendered without scope'); return createElement('span', {}, 'scoped-details') }
    function SessionProvider({ children }: { children: ReactNode }) { return selected ? createElement(scope.Provider, { value: true }, children) : null }
    const props = { layout: new DesktopLayoutState(), platform: 'win32', SessionProvider,
      useSessions: (select: (value: unknown) => unknown) => select({ current: selected ? 'session' : undefined, byId: { session: { blank: false } } }),
      renderSlot: (name: string) => name === 'details' ? createElement(Details) : null,
    }
    const html = renderToStaticMarkup(createElement(AdvancedFrame, props as never))
    expect(html.includes('scoped-details')).toBe(selected)
  })
})

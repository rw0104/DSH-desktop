import { createContext, createElement, useContext, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { AdvancedFrame } from '../src/client/AdvancedFrame.tsx'
import { DesktopLayoutState } from '../src/client/layout-state.ts'

vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useCallback: (fn: unknown) => fn, useEffect: () => {}, useRef: (value: unknown) => ({ current: value }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}))
afterEach(() => vi.unstubAllGlobals())

describe('advanced frame rc.2 root slots', () => {
  it.each([false, true])('leaves Session binding to the rightbar owner: selected=%s', selected => {
    vi.stubGlobal('window', { innerWidth: 1440 })
    const scope = createContext(false)
    function SessionContent() {
      if (!useContext(scope)) throw new Error('rightbar content rendered without its owner scope')
      return createElement('span', {}, 'scoped-rightbar')
    }
    function SessionProvider({ children }: { children: ReactNode }) {
      return selected ? createElement(scope.Provider, { value: true }, children) : null
    }
    function Rightbar() { return createElement(SessionProvider, { children: createElement(SessionContent) }) }
    const layout = new DesktopLayoutState()
    layout.openRightbar(true, false)
    const renderSlot = vi.fn((name: string) => name === 'rightbar' ? createElement(Rightbar) : null)
    const html = renderToStaticMarkup(createElement(AdvancedFrame, { layout, platform: 'win32', renderSlot } as never))
    expect(html.includes('scoped-rightbar')).toBe(selected)
    expect(renderSlot).toHaveBeenCalledWith('main', {}, { entryKey: 'conversation' })
    expect(renderSlot).toHaveBeenCalledWith('rightbar', { width: 360, viewportWidth: 1440, canShow: true })
    expect(renderSlot.mock.calls.some(([name]) => name === 'details' || name === 'conversation')).toBe(false)
  })

  it('renders global main panels even without a selected Session', () => {
    vi.stubGlobal('window', { innerWidth: 1440 })
    const layout = new DesktopLayoutState(id => id === 'fixture-panel')
    layout.selectPanel('fixture-panel' as MainPanelId)
    const renderSlot = vi.fn((name: string) => name === 'main' ? createElement('span', {}, 'global-panel') : null)
    const html = renderToStaticMarkup(createElement(AdvancedFrame, { layout, platform: 'win32', renderSlot } as never))
    expect(html).toContain('global-panel')
    expect(renderSlot).toHaveBeenCalledWith('main', {}, { entryKey: 'fixture-panel' })
  })

  it('keeps a fullscreen rightbar mounted while removing the external resize handle', () => {
    vi.stubGlobal('window', { innerWidth: 1440 })
    const layout = new DesktopLayoutState()
    layout.openRightbar(false, true)
    const renderSlot = vi.fn(() => null)
    const html = renderToStaticMarkup(createElement(AdvancedFrame, { layout, platform: 'win32', renderSlot } as never))
    expect(html).toContain('data-rightbar-fullscreen="true"')
    expect(html).not.toContain('data-side="details"')
    expect(renderSlot).toHaveBeenCalledWith('rightbar', { width: 360, viewportWidth: 1440, canShow: true })
  })
})

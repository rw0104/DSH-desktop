import { describe, expect, it } from 'vitest'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { DesktopLayoutState } from '../src/client/layout-state.ts'

describe('Desktop layout rc.2 navigation and rightbar contract', () => {
  it('cancels stale navigation and refuses unregistered panels without losing selection', () => {
    const panel = 'fixture-panel' as MainPanelId
    const layout = new DesktopLayoutState(id => id === panel)
    const first = layout.beginNavigation()
    const second = layout.beginNavigation()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
    layout.selectPanel(panel)
    expect(second.aborted).toBe(true)
    expect(layout.getSnapshot().panelInfo.activePanelId).toBe(panel)
    expect(() => layout.selectPanel('missing' as MainPanelId)).toThrow('not registered')
    expect(layout.getSnapshot().panelInfo.activePanelId).toBe(panel)
    const last = layout.beginNavigation()
    layout.dispose()
    expect(last.aborted).toBe(true)
  })

  it('reports docked, overlay and fullscreen geometry independently of visibility', () => {
    const layout = new DesktopLayoutState()
    layout.setNarrow(true)
    layout.toggleSidebar()
    layout.openRightbar(true, false)
    expect(layout.getSnapshot()).toMatchObject({ rightbarShown: true, rightbarTrack: true, rightbarFullscreen: false, narrowExpanded: false })
    layout.setDetails(420)
    layout.openRightbar(false, true)
    expect(layout.getSnapshot()).toMatchObject({ details: 420, rightbarShown: true, rightbarTrack: false, rightbarFullscreen: true })
    layout.closeRightbar()
    expect(layout.getSnapshot()).toMatchObject({ details: 420, rightbarShown: false, rightbarTrack: false, rightbarFullscreen: false })
    layout.openRightbar(true, false)
    expect(layout.getSnapshot().details).toBe(420)
  })
})

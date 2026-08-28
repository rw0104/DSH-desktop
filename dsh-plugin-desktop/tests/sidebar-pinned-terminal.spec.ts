import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  allLeaves,
  makeDefaultState,
  openTabInActivePane,
  reconcileAgentTerminals,
  sanitizeState,
  setTabPin,
  tabOpenIn,
  type SidebarState,
  type SidebarTab,
} from 'dsh-better-sidebar/src/client/state.ts'
import {
  collectPinnedTabs,
  createPinnedVirtualTab,
  getPinnedHomeScope,
} from 'dsh-better-sidebar/src/client/pinned.ts'
import {
  buildTerminalLinks,
  findTerminalUrlsInLine,
  openTerminalUrl,
  shouldActivateTerminalLink,
} from 'dsh-better-sidebar/src/client/terminal-links.ts'

function withTabs(...tabs: SidebarTab[]): SidebarState {
  let state = makeDefaultState(400, true, 'none')
  for (const tab of tabs) state = openTabInActivePane(state, tab)
  return state
}

function tab(state: SidebarState, id: string): SidebarTab | undefined {
  return allLeaves(state.splits)
    .concat(allLeaves(state.bottomSplits))
    .flatMap(leaf => leaf.tabs)
    .concat(state.floats.map(float => float.tab))
    .find(candidate => candidate.id === id)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Better Sidebar 0.17.1 pinned terminal consumer contract', () => {
  it('loads legacy state and fail-soft sanitizes damaged pin metadata', () => {
    const legacy = JSON.parse(JSON.stringify(withTabs(
      { id: 'terminal:legacy', type: 'terminal', title: 'Legacy' },
      { id: 'terminal:bad-scope', type: 'terminal', title: 'Bad scope' },
      { id: 'terminal:bad-cwd', type: 'terminal', title: 'Bad cwd' },
      { id: 'editor:bad-pin', type: 'editor', title: 'Editor' },
    ))) as SidebarState
    const tabs = allLeaves(legacy.splits).flatMap(leaf => leaf.tabs) as unknown as Array<Record<string, unknown>>
    tabs.find(value => value.id === 'terminal:bad-scope')!.pin = { scope: 'session', homeCwd: 'C:\\work' }
    tabs.find(value => value.id === 'terminal:bad-cwd')!.pin = { scope: 'workspace', homeCwd: 42 }
    tabs.find(value => value.id === 'editor:bad-pin')!.pin = { scope: 'global' }

    const restored = sanitizeState(legacy)
    expect(restored).toBeDefined()
    expect(tab(restored!, 'terminal:legacy')?.pin).toBeUndefined()
    expect(tab(restored!, 'terminal:bad-scope')?.pin).toBeUndefined()
    expect(tab(restored!, 'terminal:bad-cwd')?.pin).toEqual({ scope: 'workspace' })
    expect(tab(restored!, 'editor:bad-pin')?.pin).toBeUndefined()
  })

  it('pins idempotently and unpins without closing the home terminal', () => {
    const state = withTabs({ id: 'terminal:1', type: 'terminal', title: 'Terminal 1' })
    const pinned = setTabPin(state, 'terminal:1', { scope: 'workspace', homeCwd: 'C:\\work' })
    expect(tab(pinned, 'terminal:1')?.pin).toEqual({ scope: 'workspace', homeCwd: 'C:\\work' })
    expect(setTabPin(pinned, 'terminal:1', { scope: 'workspace', homeCwd: 'C:\\work' })).toBe(pinned)

    const unpinned = setTabPin(pinned, 'terminal:1', null)
    expect(tabOpenIn(unpinned, 'terminal:1')).toBe(true)
    expect(tab(unpinned, 'terminal:1')?.pin).toBeUndefined()
  })

  it('resolves workspace and global pins without crossing workspace boundaries', () => {
    let home = withTabs(
      { id: 'terminal:workspace', type: 'terminal', title: 'Workspace' },
      { id: 'terminal:global', type: 'terminal', title: 'Global' },
    )
    home = setTabPin(home, 'terminal:workspace', { scope: 'workspace', homeCwd: 'C:\\work' })
    home = setTabPin(home, 'terminal:global', { scope: 'global', homeCwd: 'C:\\work' })
    const sessions = new Map([['home-session', home]])

    expect(collectPinnedTabs(sessions, { sessionId: 'same-workspace', cwd: 'C:\\work' })
      .map(entry => entry.tab.id)).toEqual(['terminal:workspace', 'terminal:global'])
    expect(collectPinnedTabs(sessions, { sessionId: 'other-workspace', cwd: 'D:\\other' })
      .map(entry => entry.tab.id)).toEqual(['terminal:global'])
    expect(collectPinnedTabs(new Map([['same-workspace', home]]), {
      sessionId: 'same-workspace',
      cwd: 'C:\\work',
    })).toEqual([])
  })

  it('keeps the home session, cwd, and tab id on virtual pinned tabs', () => {
    const virtual = createPinnedVirtualTab({
      homeSessionId: 'home-session',
      tab: {
        id: 'agent:terminal-id',
        type: 'terminal',
        title: 'Agent terminal',
        pin: { scope: 'workspace', homeCwd: '\\\\server\\share\\repo' },
      },
    })
    expect(virtual.id).toBe('pinned:home-session:agent:terminal-id')
    expect(getPinnedHomeScope(virtual)).toEqual({
      sessionId: 'home-session',
      cwd: '\\\\server\\share\\repo',
      tabId: 'agent:terminal-id',
    })
  })

  it('retains a temporarily offline pinned Agent terminal during reconciliation', () => {
    let state = withTabs(
      { id: 'agent:pinned', type: 'terminal', title: 'Pinned agent' },
      { id: 'agent:ephemeral', type: 'terminal', title: 'Ephemeral agent' },
    )
    state = setTabPin(state, 'agent:pinned', { scope: 'global' })

    const reconciled = reconcileAgentTerminals(state, [])
    expect(tabOpenIn(reconciled, 'agent:pinned')).toBe(true)
    expect(tabOpenIn(reconciled, 'agent:ephemeral')).toBe(false)
    expect(reconcileAgentTerminals(reconciled, [{ uuid: 'pinned', title: 'Pinned agent' }]))
      .toBe(reconciled)
  })

  it('keeps terminal URL activation modifier-gated and http(s)-only', () => {
    expect(findTerminalUrlsInLine(
      'open <https://example.com/docs> and (http://localhost:3000/path) then file:///etc/passwd',
    )).toEqual([
      { start: 6, text: 'https://example.com/docs' },
      { start: 37, text: 'http://localhost:3000/path' },
    ])
    expect(buildTerminalLinks('x https://example.com', 7)).toEqual([{
      text: 'https://example.com',
      range: { start: { x: 3, y: 7 }, end: { x: 21, y: 7 } },
    }])
    expect(shouldActivateTerminalLink({ ctrlKey: false, metaKey: false } as MouseEvent)).toBe(false)
    expect(shouldActivateTerminalLink({ ctrlKey: true, metaKey: false } as MouseEvent)).toBe(true)

    const open = vi.fn().mockReturnValue(null)
    vi.stubGlobal('window', { open })
    expect(openTerminalUrl('file:///C:/Windows/System32')).toBe(false)
    expect(openTerminalUrl('javascript:alert(1)')).toBe(false)
    expect(openTerminalUrl('https://example.com/path')).toBe(true)
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith(
      'https://example.com/path',
      '_blank',
      'noopener,noreferrer',
    )
  })
})

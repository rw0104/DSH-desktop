import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationActions } from '../src/client/conversation-context-menu.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ writeClipboard: vi.fn(async () => true) }))
afterEach(() => vi.unstubAllGlobals())

describe('conversation semantic copy routing', () => {
  it('routes a closing assistant body to the separate tail in the same turn', async () => {
    vi.stubGlobal('window', { getSelection: () => null })
    const copyCurrent = vi.fn()
    const copyOther = vi.fn()
    // Production ChatNodeSeat has separate assistant-step and turn-tail siblings.
    const tails = [
      { getAttribute: () => '1', querySelectorAll: () => [{ click: copyOther }] },
      { getAttribute: () => '2', querySelectorAll: () => [{ click: copyCurrent }] },
    ]
    const row = {
      getAttribute: (key: string) => key === 'data-turn-process-answer' ? 'true' : '2',
      parentElement: { querySelectorAll: () => tails },
      querySelectorAll: () => [],
    }
    const target = { closest: (selector: string) => selector === '[data-chat-flow-kind]' ? row : null } as unknown as Element
    const actions = conversationActions(target, false)
    expect(actions.map(action => action.label)).toEqual(['Copy message'])
    await actions[0]?.run()
    expect(copyCurrent).toHaveBeenCalledOnce()
    expect(copyOther).not.toHaveBeenCalled()
  })
  it('leaves editable fields and non-conversation Sidebar surfaces to their owners', () => {
    const sidebar = { closest: () => null } as unknown as Element
    expect(conversationActions(sidebar, true)).toEqual([])
    const editable = { closest: () => ({}) } as unknown as Element
    expect(conversationActions(editable, false)).toEqual([])
  })
})

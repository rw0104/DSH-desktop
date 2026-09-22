import { describe, expect, it, vi } from 'vitest'

const { registerTurnTailInterception } = await vi.importActual<{
  registerTurnTailInterception(ctx: unknown, store: unknown): () => void
}>('dsh-better-sidebar/src/client/intercept.tsx')

describe('Sidebar on the alpha turn-tail list slot', () => {
  it('renders from the list owner without relying on the old chain matched prop', () => {
    let render: ((props: unknown) => { props: { matched: readonly string[] } } | null) | undefined
    let suspended = false
    let enabled = true
    const dispose = vi.fn()
    registerTurnTailInterception({ slots: {
      inject: (name: string, activate: () => unknown) => { expect(name).toBe('conversation.chat.turnTail'); return activate() },
      register: (options: { id?: string }, component: typeof render) => {
        // Alpha list slots reject contributions without a stable entry identity.
        if (!options.id) throw new Error('list slot requires options.id')
        render = component
        return dispose
      },
    } }, { getSuspended: () => suspended, getPrefs: () => ({ tabsEnabled: { editor: enabled } }) })

    const owner = { seq: 8, turn: { data: new Map([['deliverables', {
      produced: [{ seq: 2, path: 'notes.txt' }, { seq: 9, path: 'future.txt' }],
    }]]) } }
    expect(render?.(owner)?.props.matched).toEqual(['notes.txt'])
    expect(render?.({ seq: 1, turn: { data: new Map() } })).toBeNull()
    suspended = true
    expect(render?.(owner)).toBeNull()
    suspended = false
    enabled = false
    expect(render?.(owner)).toBeNull()
  })
})

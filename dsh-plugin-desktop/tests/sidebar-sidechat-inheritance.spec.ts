import { describe, expect, it, vi } from 'vitest'
import { Inbox, type CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import { Session, type SessionEvent, type SessionId, type UserMessage } from '@deepseek-ai/dsh-session'

type Event = { type: string; seq: number; time: number; data: Record<string, unknown> }
const message = (id: string, text: string) => ({ id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
const splice = (target: string, text: string): Event => ({
  type: 'agent/inbox/spliced', seq: 0, time: 1,
  data: { target, start: 0, inserted: [message('parent-pending', text)] },
})
const inboxOf = (session: Session) => new Inbox(session, { inserted() {}, discarded() {}, claimed() {} })

// Load the maintained package's route, not a Desktop copy of its inheritance logic.
const { buildSidechatApi } = await vi.importActual<{
  buildSidechatApi(ctx: unknown): Record<string, (payload: Record<string, unknown>) => Promise<unknown>>
}>('dsh-better-sidebar/src/sidechat-routes.ts')

describe('Sidebar RC1 fork inheritance at the route boundary', () => {
  it.each(['next-turn', 'next-step', 'empty'])('does not consume parent %s input in a new or restored child', async target => {
    const events = target === 'empty' ? [] : [splice(target, 'belongs to parent')]
    const original = structuredClone(events)
    const parentSession = Session.create('parent' as SessionId, events as unknown as SessionEvent[])
    const parentInbox = inboxOf(parentSession)
    const parent = {
      id: 'parent', options: { provider: 'test', model: 'isolated-model' },
      session: { id: 'parent', header: { cwd: 'C:\\fixture', delegationDepth: 0 }, snapshotEvents: () => events },
    }
    let options: CreateAgentOptions | undefined
    const child = { id: 'child', session: { id: 'child' }, inject: vi.fn(), followup: vi.fn() }
    const services: Record<string, unknown> = {
      agents: {
        get: (id: string) => id === 'parent' ? parent : child,
        create: async (input: CreateAgentOptions) => { options = input; return { agent: child, dispose: async () => {} } },
      },
      sessionTitle: { rename: vi.fn() },
    }
    const api = buildSidechatApi({ get: (key: string) => services[key] })
    await api['sidechat.start']!({ sessionId: 'parent', question: 'child question' })
    expect(options).toBeDefined()
    const created = options!
    expect(created.meta?.isSeeded).toBe(true)
    expect(created.inheritedEventCount).toBe(created.seed!.length)
    const childSession = Session.create(created.sessionId!, created.seed, {
      version: 0, id: created.sessionId!, createdAt: Date.now(), ...created.meta, isSeeded: created.meta?.isSeeded ?? false,
    }, created.inheritedEventCount)
    const freshInbox = inboxOf(childSession)
    expect([freshInbox.nextTurn.length, freshInbox.nextStep.length]).toEqual([0, 0])
    // Replay the actual persisted event/header shape as a cold session would.
    const restored = Session.create(childSession.id, childSession.snapshotEvents(), childSession.header, created.inheritedEventCount)
    expect([inboxOf(restored).nextTurn.length, inboxOf(restored).nextStep.length]).toEqual([0, 0])
    freshInbox.append('next-turn', message('child-new', 'new child input') as UserMessage)
    expect(freshInbox.claim('next-turn', 1).map(value => value.id)).toEqual(['child-new'])
    expect(events).toEqual(original)
    expect([parentInbox.nextTurn.length, parentInbox.nextStep.length]).toEqual(
      target === 'next-turn' ? [1, 0] : target === 'next-step' ? [0, 1] : [0, 0],
    )
    if (target !== 'empty') expect(parentInbox.claim('next-turn', 1).map(value => value.id)).toEqual(['parent-pending'])
    expect(child.inject).toHaveBeenCalledTimes(1)
    expect(child.followup).toHaveBeenCalledTimes(1)
    expect(child.followup.mock.calls[0]?.[0]).toMatchObject({ content: [{ type: 'text', text: 'child question' }] })
  })
})

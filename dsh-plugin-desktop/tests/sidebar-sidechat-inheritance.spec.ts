import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { sidechatRuntime } from './fixtures/sidechat-runtime.ts'

const { buildSidechatApi } = await vi.importActual<{
  buildSidechatApi(ctx: unknown): {
    'sidechat.start'(payload: { sessionId: string }): Promise<{ childId: string }>
    'sidechat.prompt'(payload: { childId: string; text: string }): Promise<unknown>
    'sidechat.dispose'(payload: { childId: string }): Promise<unknown>
  }
}>('dsh-better-sidebar/src/sidechat-routes.ts')
const runtimes: Awaited<ReturnType<typeof sidechatRuntime>>[] = []
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose() })
const message = (text: string) => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })

describe('Sidebar V3 fork inheritance through real Agents and JSONL handles', () => {
  it('preserves a cold child\'s own unconsumed work while binding its model', async () => {
    const runtime = await sidechatRuntime(); runtimes.push(runtime)
    const { ctx, calls } = runtime
    const { agent: parent } = await ctx.agents.create({
      sessionId: SessionId('parent-own-queue'), agentOptions: { provider: 'parent-provider', model: 'parent-model' },
    })
    const api = buildSidechatApi(ctx)
    const { childId } = await api['sidechat.start']({ sessionId: parent.id })
    await api['sidechat.dispose']({ childId })
    // Simulate work durably queued immediately before a process interruption.
    const stored = await ctx.sessionPersistence.open(SessionId(childId), 'write')
    try {
      const { events, eventState } = await stored.read()
      const session = Session.fromRestore(SessionId(childId), events, stored.header, stored.inheritedEventCount, eventState)
      const queued = session.append('agent/inbox/spliced', {
        target: 'next-turn', start: 0, inserted: [message('child pending work')],
      })
      await stored.append([queued])
      await stored.flush()
    } finally { await stored.close() }
    await api['sidechat.prompt']({ childId, text: 'new child question' })
    await ctx.agents.get(SessionId(childId))!.whenIdle()
    expect(JSON.stringify(calls)).toContain('child pending work')
    expect(JSON.stringify(calls)).toContain('new child question')
    await api['sidechat.dispose']({ childId })
  })

  it.each(['next-turn', 'next-step', 'empty'] as const)('isolates parent %s input during creation and disk-backed cold resume', async target => {
    const runtime = await sidechatRuntime(); runtimes.push(runtime)
    const { ctx, calls } = runtime
    const { agent: parent } = await ctx.agents.create({
      sessionId: SessionId('parent'), agentOptions: { provider: 'parent-provider', model: 'parent-model' },
    })
    if (target !== 'empty') parent.inbox.append(target, message('belongs only to parent'))
    const original = structuredClone(parent.session.snapshotEvents())
    const api = buildSidechatApi(ctx)
    const { childId } = await api['sidechat.start']({ sessionId: parent.id })
    const child = ctx.agents.get(SessionId(childId))!
    expect(child.session.header).toMatchObject({ version: SESSION_FORMAT_VERSION, isSeeded: true, parentSession: parent.id })
    expect([child.inbox.nextTurn.length, child.inbox.nextStep.length]).toEqual([0, 0])
    expect(calls).toHaveLength(0)
    await api['sidechat.dispose']({ childId })
    expect(ctx.agents.get(SessionId(childId))).toBeUndefined()

    // Read the real artifact; no reconstructed in-memory Session stands in for persistence.
    const stored = await ctx.sessionPersistence.open(SessionId(childId), 'read')
    try {
      expect(stored.header.version).toBe(3)
      expect(stored.inheritedEventCount).toBeGreaterThanOrEqual(original.length)
      expect((await stored.read()).events.some(event => event.type === 'session/end-seed')).toBe(true)
    } finally { await stored.close() }
    await api['sidechat.prompt']({ childId, text: 'child question' })
    const resumed = ctx.agents.get(SessionId(childId))!
    await resumed.whenIdle()
    expect(calls).toHaveLength(1)
    expect(JSON.stringify(calls[0]?.messages)).toContain('child question')
    expect(JSON.stringify(calls[0]?.messages)).not.toContain('belongs only to parent')
    expect([resumed.inbox.nextTurn.length, resumed.inbox.nextStep.length]).toEqual([0, 0])
    expect(parent.session.snapshotEvents()).toEqual(original)
    expect([parent.inbox.nextTurn.length, parent.inbox.nextStep.length]).toEqual(
      target === 'next-turn' ? [1, 0] : target === 'next-step' ? [0, 1] : [0, 0],
    )
    if (target !== 'empty') {
      parent.followup(message('wake parent'))
      await parent.whenIdle()
      expect(JSON.stringify(calls.slice(1))).toContain('belongs only to parent')
    }
    await api['sidechat.dispose']({ childId })
  })
})

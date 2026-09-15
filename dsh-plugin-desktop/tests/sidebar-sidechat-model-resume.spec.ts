import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { sidechatRuntime } from './fixtures/sidechat-runtime.ts'
import { installSidechatModelSelection as sourceBinding } from 'dsh-better-sidebar/src/sidechat-model.ts'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const builtModule: { installSidechatModelSelection: typeof sourceBinding } = await import(
  pathToFileURL(join(dirname(createRequire(import.meta.url).resolve('dsh-better-sidebar')), 'sidechat-model.js')).href)
const builtBinding = builtModule.installSidechatModelSelection

const { buildSidechatApi } = await vi.importActual<{
  buildSidechatApi(ctx: unknown): Record<string, (payload: Record<string, unknown>) => Promise<unknown>>
}>('dsh-better-sidebar/src/sidechat-routes.ts')

describe.each([['source', sourceBinding], ['published JavaScript', builtBinding]] as const)('Sidechat %s model assembly contract', (_name, installSidechatModelSelection) => {
  it('keeps adapter-default reasoning effort implicit when restoring a request header', async () => {
    const listeners = new Map<string, (...args: any[]) => Promise<any>>()
    const selection = { provider: 'used-provider', model: 'used-model', reasoningEffort: 'low' }
    const agent = { options: {}, session: { requestHeader: () => ({ config: selection, adapterDefaults: { reasoningEffort: true } }) } }
    const agentCtx = { on: (key: string, listener: (...args: any[]) => Promise<any>) => { listeners.set(key, listener); return () => listeners.delete(key) } }
    const host = { get: (key: string) => key === 'sessionProjections' ? { stateOf: () => ({ pending: null, lastUsed: selection }) } : undefined }
    installSidechatModelSelection(host as unknown as Context, agentCtx as unknown as Context, agent as unknown as Agent)
    await listeners.get('system-prompt/assemble')!({}, {}, async () => ({ variables: {} }))
    expect(await listeners.get('agent/request')!({}, async () => ({}))).toEqual({ provider: 'used-provider', model: 'used-model' })
  })
  it.each([true, false])('uses explicit Agent options before defaults without a projection registry: %s', async explicit => {
    const listeners = new Map<string, (...args: any[]) => Promise<any>>()
    const options = explicit ? { provider: 'stored-provider', model: 'stored-model', reasoningEffort: 'low' } : {}
    const agent = { session: { requestHeader: () => undefined }, options }
    const agentCtx = { on: (key: string, listener: (...args: any[]) => Promise<any>) => { listeners.set(key, listener); return () => listeners.delete(key) } }
    const host = { get: (key: string) => key === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) } : undefined }
    installSidechatModelSelection(host as unknown as Context, agentCtx as unknown as Context, agent as unknown as Agent)
    await listeners.get('system-prompt/assemble')!({}, {}, async () => ({ variables: {} }))
    const config = await listeners.get('agent/request')!({}, async () => ({ reasoningEffort: 'inherited' }))
    expect(config).toEqual(explicit ? options : { provider: 'default-provider', model: 'default-model' })
  })
  it.each([
    { pending: { provider: 'pending-provider', model: 'next-model' }, lastUsed: { provider: 'used-provider', model: 'used-model' }, expected: { provider: 'pending-provider', model: 'next-model' } },
    { pending: null, lastUsed: { provider: 'used-provider', model: 'used-model' }, expected: { provider: 'used-provider', model: 'used-model' } },
  ])('binds the persisted selection for prompt variables and request routing: $expected.model', async ({ pending, lastUsed, expected }) => {
    const listeners = new Map<string, (...args: any[]) => Promise<any>>()
    const agent = { session: { snapshotEvents: () => [], requestHeader: () => undefined }, options: {}, inject: vi.fn(), followup: vi.fn() }
    const agentCtx = { agent, get: (key: string) => key === 'agent' ? agent : undefined,
      on: (key: string, listener: (...args: any[]) => Promise<any>) => { listeners.set(key, listener); return () => listeners.delete(key) } }
    const mounted = vi.fn(async () => {})
    const closed = vi.fn(async () => {})
    const opened = vi.fn(async () => ({ header: { agentPreset: 'standard' }, read: async () => ({ events: [] }), close: closed }))
    const services: Record<string, unknown> = {
      agents: { get: () => undefined, resume: async (options: { setup(ctx: unknown, agent: unknown): Promise<void> }) => {
        await options.setup(agentCtx, agent)
        return { agent, dispose: async () => {} }
      } },
      sessionPersistence: { open: opened },
      agentPresets: { resolve: async () => ({ id: 'standard' }), mount: mounted },
      agentDefaultModel: { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) },
      sessionProjections: { stateOf: () => ({ pending, lastUsed }) },
    }
    const api = buildSidechatApi({ get: (key: string) => services[key] })
    await api['sidechat.prompt']!({ childId: 'child', text: 'resume this child' })
    expect(opened).toHaveBeenCalledWith('child', 'read')
    expect(closed).toHaveBeenCalledOnce()
    expect(mounted).toHaveBeenCalledOnce()
    const assemble = listeners.get('system-prompt/assemble')
    expect(assemble, 'cold resume must install the public rc.2 model binding').toBeDefined()
    const assembly = await assemble!({}, {}, async () => ({ variables: { preserved: 'value' } }))
    expect(assembly.variables).toMatchObject({ ...expected, preserved: 'value' })
    const request = await listeners.get('agent/request')!({}, async () => ({ provider: 'wrong', model: 'wrong', reasoningEffort: 'inherited-effort' }))
    expect(request).toEqual(expected)
    expect(agent.followup).toHaveBeenCalledOnce()
  })
})

const runtimes: Awaited<ReturnType<typeof sidechatRuntime>>[] = []
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose() })

it('closes the read handle and does not resume or admit input when the persisted log is corrupt', async () => {
  const close = vi.fn(async () => {})
  const resume = vi.fn()
  const services: Record<string, unknown> = {
    agents: { get: () => undefined, resume },
    sessionPersistence: { open: async () => ({
      header: {}, read: async () => { throw new Error('fixture corrupt log') }, close,
    }) },
  }
  const api = buildSidechatApi({ get: (key: string) => services[key] })
  await expect(api['sidechat.prompt']!({ childId: 'corrupt-child', text: 'must not be admitted' })).rejects.toThrow('fixture corrupt log')
  expect(close).toHaveBeenCalledOnce()
  expect(resume).not.toHaveBeenCalled()
})

it('uses the last persisted model after actual Sidechat disposal and cold resume', async () => {
  const runtime = await sidechatRuntime(); runtimes.push(runtime)
  const { ctx, calls } = runtime
  const { agent: parent } = await ctx.agents.create({
    sessionId: SessionId('model-parent'), agentOptions: { provider: 'parent-provider', model: 'selected-model' },
  })
  parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'parent request' }] }))
  await parent.whenIdle()
  expect(parent.session.requestHeader()?.config).toMatchObject({ provider: 'parent-provider', model: 'selected-model' })
  const api = buildSidechatApi(ctx)
  const result = await api['sidechat.start']!({ sessionId: parent.id, question: 'child request' }) as { childId: string }
  await ctx.agents.get(SessionId(result.childId))!.whenIdle()
  await api['sidechat.dispose']!({ childId: result.childId })
  expect(ctx.agents.get(SessionId(result.childId))).toBeUndefined()
  await api['sidechat.prompt']!({ childId: result.childId, text: 'cold request' })
  const resumed = ctx.agents.get(SessionId(result.childId))!
  await resumed.whenIdle()
  expect(calls).toHaveLength(3)
  expect(calls.map(call => [call.provider, call.model])).toEqual(Array(3).fill(['parent-provider', 'selected-model']))
  expect(JSON.stringify(calls.at(-1)?.messages)).toContain('parent-provider / selected-model')
  expect(resumed.session.requestHeader()?.config).toMatchObject({ provider: 'parent-provider', model: 'selected-model' })
  await api['sidechat.dispose']!({ childId: result.childId })
})

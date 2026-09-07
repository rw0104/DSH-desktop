import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installSidechatModelSelection } from 'dsh-better-sidebar/src/sidechat-model.ts'

const { buildSidechatApi } = await vi.importActual<{
  buildSidechatApi(ctx: unknown): Record<string, (payload: Record<string, unknown>) => Promise<unknown>>
}>('dsh-better-sidebar/src/sidechat-routes.ts')

describe('Sidechat cold resume model assembly contract', () => {
  it('keeps adapter-default reasoning effort implicit when restoring a request header', async () => {
    const listeners = new Map<string, (...args: any[]) => Promise<any>>()
    const selection = { provider: 'used-provider', model: 'used-model', reasoningEffort: 'low' }
    const agent = { options: {}, session: { requestHeader: () => ({ config: selection, adapterDefaults: { reasoningEffort: true } }) } }
    const agentCtx = { agent, on: (key: string, listener: (...args: any[]) => Promise<any>) => { listeners.set(key, listener); return () => listeners.delete(key) } }
    const host = { get: (key: string) => key === 'sessionProjections' ? { stateOf: () => ({ pending: null, lastUsed: selection }) } : undefined }
    installSidechatModelSelection(host as unknown as Context, agentCtx as unknown as Context)
    await listeners.get('system-prompt/assemble')!({}, {}, async () => ({ variables: {} }))
    expect(await listeners.get('agent/request')!({}, async () => ({}))).toEqual({ provider: 'used-provider', model: 'used-model' })
  })
  it.each([true, false])('uses explicit Agent options before defaults without a projection registry: %s', async explicit => {
    const listeners = new Map<string, (...args: any[]) => Promise<any>>()
    const options = explicit ? { provider: 'stored-provider', model: 'stored-model', reasoningEffort: 'low' } : {}
    const agent = { session: {}, options }
    const agentCtx = { agent, on: (key: string, listener: (...args: any[]) => Promise<any>) => { listeners.set(key, listener); return () => listeners.delete(key) } }
    const host = { get: (key: string) => key === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) } : undefined }
    installSidechatModelSelection(host as unknown as Context, agentCtx as unknown as Context)
    await listeners.get('system-prompt/assemble')!({}, {}, async () => ({ variables: {} }))
    const config = await listeners.get('agent/request')!({}, async () => ({ reasoningEffort: 'inherited' }))
    expect(config).toEqual(explicit ? options : { provider: 'default-provider', model: 'default-model' })
  })
  it.each([
    { pending: { provider: 'pending-provider', model: 'next-model' }, lastUsed: { provider: 'used-provider', model: 'used-model' }, expected: { provider: 'pending-provider', model: 'next-model' } },
    { pending: null, lastUsed: { provider: 'used-provider', model: 'used-model' }, expected: { provider: 'used-provider', model: 'used-model' } },
  ])('binds the persisted selection for prompt variables and request routing: $expected.model', async ({ pending, lastUsed, expected }) => {
    const listeners = new Map<string, (...args: any[]) => Promise<any>>()
    const agent = { session: { snapshotEvents: () => [] }, options: {}, inject: vi.fn(), followup: vi.fn() }
    const agentCtx = { agent, get: (key: string) => key === 'agent' ? agent : undefined,
      on: (key: string, listener: (...args: any[]) => Promise<any>) => { listeners.set(key, listener); return () => listeners.delete(key) } }
    const mounted = vi.fn(async () => {})
    const services: Record<string, unknown> = {
      agents: { get: () => undefined, resume: async (options: { setup(ctx: unknown): Promise<void> }) => {
        await options.setup(agentCtx)
        return { agent, dispose: async () => {} }
      } },
      sessionPersistence: { inspect: async () => ({ meta: { agentPreset: 'standard' }, events: [] }) },
      agentPresets: { resolve: async () => ({ id: 'standard' }), mount: mounted },
      agentDefaultModel: { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) },
      sessionProjections: { stateOf: () => ({ pending, lastUsed }) },
    }
    const api = buildSidechatApi({ get: (key: string) => services[key] })
    await api['sidechat.prompt']!({ childId: 'child', text: 'resume this child' })
    expect(mounted).toHaveBeenCalledOnce()
    const assemble = listeners.get('system-prompt/assemble')
    expect(assemble, 'cold resume must install the public RC1 model binding').toBeDefined()
    const assembly = await assemble!({}, {}, async () => ({ variables: { preserved: 'value' } }))
    expect(assembly.variables).toMatchObject({ ...expected, preserved: 'value' })
    const request = await listeners.get('agent/request')!({}, async () => ({ provider: 'wrong', model: 'wrong', reasoningEffort: 'inherited-effort' }))
    expect(request).toEqual(expected)
    expect(agent.followup).toHaveBeenCalledOnce()
  })
})

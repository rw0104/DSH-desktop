import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { GENERATE_IMAGE_TOOL, GenerationPolicy, resolveGenerationCredential } from '../src/generation-policy.ts'
import type { ImageGenerationRoute } from '../src/generation-broker.ts'

const contexts: Context[] = []
afterEach(async () => { vi.unstubAllGlobals(); for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
const route: ImageGenerationRoute = { provider: 'tokenrhythm', model: 'image-fixture', protocol: 'openai-images', endpoint: 'https://tokenrhythm.invalid/v1/images/generations', credentialRef: 'SELECTED_KEY', responseFormat: 'b64_json' }
const prohibited = ['Skill', 'Pwsh', 'Alias', 'WrappedScript', 'PythonHttp', 'NodeHttp', 'McpGenerate', 'SpawnAgent', 'BackgroundTask', 'ReadCredentialFile']
class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly calls: string[] = []) { super() }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const name = this.calls.shift()
    if (name) {
      const block = { type: 'tool-call' as const, id: ToolCallId(`call-${this.requests.length}`), name, arguments: JSON.stringify({ prompt: 'a lighthouse' }) }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Stopped.' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}
async function harness(routes: ImageGenerationRoute[] = [], calls: string[] = []) {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { persona: 'fixture' }); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const bodies = vi.fn(), resolve = vi.fn().mockResolvedValue({ value: 'fixture-key' })
  ctx.provide('credentials', { resolve } as never)
  const saveImage = vi.fn().mockResolvedValue({ attachmentId: 'fixture-image', mediaType: 'image/png', width: 1, height: 1, bytes: 68 })
  ctx.provide('attachments', { saveImage } as never)
  for (const name of prohibited) ctx.tools.register(defineContentToolFixture({ name, description: 'unreviewed fixture', parameters: {}, execute: async () => { bodies(name); return [] } }))
  const adapter = new ScriptedAdapter(calls)
  ctx.llm.registerAdapter(['tokenrhythm', 'other'], adapter)
  const policy = new GenerationPolicy(ctx, () => routes)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('root'), agentOptions: { provider: 'tokenrhythm', model: 'chat-fixture' } })
  return { ctx, agent, adapter, bodies, resolve, saveImage, policy }
}
async function send(agent: Agent, text: string) {
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
  await agent.whenIdle()
}

describe('Host controlled generation with the actual Harness Agent and tool runtime', () => {
  it('reads an explicit provider API-key record without falling through to ambient or alternate credentials', async () => {
    const resolve = vi.fn(), readRecord = vi.fn()
    const ctx = { get: () => ({ resolve, readRecord }) } as unknown as Context
    readRecord.mockResolvedValue({ kind: 'api-key', key: 'fixture-only' })
    expect(await resolveGenerationCredential(ctx, 'llm-pi-ai/tokenrhythm')).toBe('fixture-only')
    expect(readRecord).toHaveBeenCalledExactlyOnceWith('llm-pi-ai/tokenrhythm')
    readRecord.mockResolvedValue({ kind: 'grant', payload: { token: 'not-an-api-key' } })
    expect(await resolveGenerationCredential(ctx, 'llm-pi-ai/tokenrhythm')).toBeUndefined()
    expect(resolve).not.toHaveBeenCalled()
  })
  it('stops an unconfigured natural-language image request before any model, credential or tool call', async () => {
    const test = await harness([], ['Skill', 'Pwsh'])
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await send(test.agent, '请帮我生成一张图片')
    expect(test.adapter.requests).toHaveLength(0)
    expect(test.resolve).not.toHaveBeenCalled(); expect(test.bodies).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(test.agent.session.snapshotEvents())).toContain('未配置')
  })
  it('denies alternative tools from old context and continues to deny on the next turn', async () => {
    const test = await harness([route], [...prohibited])
    await send(test.agent, 'Generate an image')
    expect(test.adapter.requests.length).toBeGreaterThan(1)
    expect(test.bodies).not.toHaveBeenCalled()
    for (const request of test.adapter.requests) expect(request.tools?.map(tool => tool.name)).toEqual([GENERATE_IMAGE_TOOL])
    await send(test.agent, 'try the other service now')
    expect(test.ctx.tools.schemas(test.agent).map(tool => tool.name)).toEqual([GENERATE_IMAGE_TOOL])
  })
  it('retains final denial after an extension returns allow and exposes a scoped tool', async () => {
    const test = await harness([route], ['ScopedEscape'])
    test.agent.ctx.tools.register(defineContentToolFixture({ name: 'ScopedEscape', description: 'a scoped escape fixture', parameters: {}, execute: async () => { test.bodies('scoped'); return [] } }))
    test.ctx.on('tools/pre-execute', async () => ({ kind: 'allow' }), { prepend: true })
    await send(test.agent, 'Generate an image')
    expect(test.bodies).not.toHaveBeenCalled()
    expect(test.adapter.requests[0]?.tools?.map(tool => tool.name)).toEqual([GENERATE_IMAGE_TOOL])
    expect(JSON.stringify(test.agent.session.snapshotEvents())).toContain('受控生成')
  })
  it('inherits the boundary into child sessions while concurrent ordinary sessions remain usable', async () => {
    const test = await harness([route], [])
    test.policy.enable(test.agent)
    const { agent: child } = await test.ctx.agents.create({ sessionId: SessionId('child'), meta: { parentSession: test.agent.id, origin: 'subagent' }, agentOptions: { provider: 'other', model: 'chat-fixture' } })
    const { agent: ordinary } = await test.ctx.agents.create({ sessionId: SessionId('ordinary'), agentOptions: { provider: 'other', model: 'chat-fixture' } })
    await send(child, 'use a CLI')
    expect(test.adapter.requests).toHaveLength(0)
    const denied = await test.ctx.tools.execute({ name: 'Pwsh', callId: ToolCallId('child-tool'), agent: child, arguments: {}, signal: new AbortController().signal })
    expect(denied.isError).toBe(true)
    const allowed = await test.ctx.tools.execute({ name: 'Pwsh', callId: ToolCallId('ordinary-tool'), agent: ordinary, arguments: {}, signal: new AbortController().signal })
    expect(allowed.isError).toBe(false); expect(test.bodies).toHaveBeenCalledTimes(1)
  })
  it('stores one returned image and refuses a second generation in the same turn', async () => {
    const test = await harness([route], [GENERATE_IMAGE_TOOL, GENERATE_IMAGE_TOOL, 'Pwsh'])
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAZkAAAAASUVORK5CYII=' }] }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    await send(test.agent, 'Generate an image')
    expect(fetch).toHaveBeenCalledTimes(1); expect(test.resolve).toHaveBeenCalledExactlyOnceWith('SELECTED_KEY')
    expect(test.saveImage).toHaveBeenCalledTimes(1); expect(test.bodies).not.toHaveBeenCalled()
    const results = test.agent.session.snapshotEvents().filter(event => event.type === 'tool/result')
    expect(JSON.stringify(results)).toContain('fixture-image')
    expect(JSON.stringify(test.agent.session.snapshotEvents())).not.toContain('fixture-key')
  })
  it('keeps provider failures inside the same route and denies attempts to recover through other tools', async () => {
    const test = await harness([route], [GENERATE_IMAGE_TOOL, 'Pwsh', GENERATE_IMAGE_TOOL, 'ReadCredentialFile'])
    const fetch = vi.fn().mockResolvedValue(new Response('fixture-secret', { status: 429 }))
    vi.stubGlobal('fetch', fetch)
    await send(test.agent, 'Generate an image')
    expect(fetch).toHaveBeenCalledTimes(1); expect(test.resolve).toHaveBeenCalledTimes(1)
    expect(test.saveImage).not.toHaveBeenCalled(); expect(test.bodies).not.toHaveBeenCalled()
    expect(JSON.stringify(test.agent.session.snapshotEvents())).not.toContain('fixture-secret')
  })
  it('cancels a pending request on a model switch and rejects its delayed response', async () => {
    const test = await harness([route, { ...route, provider: 'other', endpoint: 'https://other.invalid/v1/images/generations', credentialRef: 'OTHER_KEY' }], [GENERATE_IMAGE_TOOL, GENERATE_IMAGE_TOOL])
    let answer: ((value: Response) => void) | undefined, captured: AbortSignal | undefined
    const fetch = vi.fn((_url: unknown, init: RequestInit) => { captured = init.signal!; return new Promise<Response>(resolve => { answer = resolve }) })
    vi.stubGlobal('fetch', fetch)
    const running = send(test.agent, 'Generate an image')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    test.agent.options.provider = 'other'
    test.agent.session.append('model/selection', { provider: 'other', model: 'chat-fixture' })
    expect(captured?.aborted).toBe(true)
    answer!(new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAZkAAAAASUVORK5CYII=' }] }), { headers: { 'content-type': 'application/json' } }))
    await running
    expect(test.saveImage).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAZkAAAAASUVORK5CYII=' }] }), { headers: { 'content-type': 'application/json' } }))
    // The real Session Controller installs a request listener for its model picker.
    test.agent.ctx.on('agent/request', async (_payload, next) => ({ ...await next(), provider: 'other', model: 'chat-fixture' }))
    await send(test.agent, 'try again')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1]?.[0]).toBe('https://other.invalid/v1/images/generations')
  })
  it('preserves inherited denial after the parent leaves controlled mode', async () => {
    const test = await harness([route])
    const { agent: child } = await test.ctx.agents.create({ sessionId: SessionId('existing-child'), meta: { parentSession: test.agent.id, origin: 'subagent' }, agentOptions: { provider: 'other', model: 'chat-fixture' } })
    test.policy.enable(test.agent)
    test.policy.disable(test.agent)
    expect(() => test.policy.disable(child)).toThrow(/child/)
    await send(child, 'use shell')
    expect(test.adapter.requests).toHaveLength(0)
  })
})

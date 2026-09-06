import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, createUserMessage, createAssistantMessage, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { AttachmentId, ImageVariantId } from '@deepseek-ai/dsh-attachment'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
const PiAi = await import(pathToFileURL(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm-pi-ai')).href)
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQyLz0HwAEQwJTHlVcYAAAAABJRU5ErkJggg=='
const imageRef = { attachmentId: AttachmentId('sha256:' + 'a'.repeat(64)), mediaType: 'image/png' as const, bytes: Buffer.from(PNG, 'base64').length, width: 1, height: 1 }
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
async function setup(model = 'google/gemini-3.1-flash-image-preview', extra: Record<string, unknown> = {}, route: { provider?: string; api?: string; baseURL?: string } = {}) {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  ctx.provide('credentials', { resolve: vi.fn().mockResolvedValue({ value: 'fixture-key' }), readRecord: async () => undefined, listRecords: async () => [] } as never)
  const saveImages = vi.fn().mockResolvedValue([imageRef])
  ctx.provide('attachments', { saveImages, imageLimits: { maxImagesPerMessage: 8, maxImageBytes: 20 * 1024 * 1024, maxMessageImageBytes: 40 * 1024 * 1024 },
    imageHostPath: () => undefined,
    readImage: async () => ({ attachment: imageRef, data: Buffer.from(PNG, 'base64') }),
    readImageRequest: async () => ({ attachment: imageRef, data: Buffer.from(PNG, 'base64'), mediaType: 'image/png', bytes: imageRef.bytes, width: 1, height: 1, variantId: ImageVariantId('sha256:' + 'b'.repeat(64)), depth: 'uchar', space: 'srgb', hasAlpha: true }),
  } as never)
  await ctx.plugin(PiAi, { providers: { [route.provider ?? 'openrouter']: { apiKeyEnv: 'FIXTURE_KEY', ...(route.api ? { api: route.api } : {}), ...(route.baseURL ? { baseURL: route.baseURL } : {}), models: [{ id: model, ...extra }] } } })
  return { ctx, saveImages }
}
async function run(ctx: Context, model = 'google/gemini-3.1-flash-image-preview', messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '画一张灯塔图片' }] })], provider = 'openrouter') {
  const chunks: StreamChunk[] = []
  for await (const chunk of ctx.llm.stream({ provider, model, messages, tools: [{ name: 'pwsh', description: 'fixture shell', parameters: { type: 'object' } }] })) chunks.push(chunk)
  return chunks
}
function imageReply() {
  return new Response('data: ' + JSON.stringify({ id: 'native-image', choices: [{ index: 0, delta: { images: [{ index: 0, type: 'image_url', image_url: { url: 'data:image/png;base64,' + PNG } }] }, finish_reason: null }] })
    + '\n\ndata: ' + JSON.stringify({ id: 'native-image', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 5 } }) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
}
describe('selected model native image output', () => {
  it('routes a manually added Aliyun Qwen image model to the same workspace native API and saves its signed result URL', async () => {
    const baseURL = 'https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
    const imageURL = 'https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/image.png?Expires=fixture'
    const { ctx, saveImages } = await setup('qwen-image-2.0-pro', {}, { provider: 'aliyun', api: 'openai-completions', baseURL })
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('/api/v1/services/aigc/multimodal-generation/generation')) return new Response(JSON.stringify({ output: { choices: [{ message: { role: 'assistant', content: [{ image: imageURL }] }, finish_reason: 'stop' }] } }), { headers: { 'content-type': 'application/json' } })
      if (String(url) === imageURL) return new Response(Buffer.from(PNG, 'base64'), { headers: { 'content-type': 'image/png' } })
      return new Response(null, { status: 400 })
    }); vi.stubGlobal('fetch', fetch)
    const messages = [createUserMessage({ source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }, content: [{ type: 'text', text: 'irrelevant Agent instructions '.repeat(600) }] }), createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '生成一张小猫坐在充满阳光的餐桌上的图像' }] })]
    const chunks = await run(ctx, 'qwen-image-2.0-pro', messages, 'aliyun')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]?.[0]).toBe('https://llm-fixture.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({ model: 'qwen-image-2.0-pro', input: { messages: [{ role: 'user', content: [{ text: '生成一张小猫坐在充满阳光的餐桌上的图像' }] }] } })
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer fixture-key')
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).has('authorization')).toBe(false)
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit' })
    expect(saveImages).toHaveBeenCalledTimes(1)
  })
  it.each([400, 413])('does not misclassify an empty HTTP %s from a custom provider as context overflow', async status => {
    const { ctx } = await setup('ordinary-chat', {}, { provider: 'custom', api: 'openai-completions', baseURL: 'https://fixture.invalid/v1' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    const chunks = await run(ctx, 'ordinary-chat', undefined, 'custom')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'INVALID_REQUEST' } } })
  })
  it('retains explicit context-overflow errors on compatible providers', async () => {
    const { ctx } = await setup('ordinary-chat', {}, { provider: 'custom', api: 'openai-completions', baseURL: 'https://fixture.invalid/v1' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Your input exceeds the context window of this model' } }), { status: 400, headers: { 'content-type': 'application/json' } })))
    const chunks = await run(ctx, 'ordinary-chat', undefined, 'custom')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'CONTEXT_WINDOW_EXCEEDED' } } })
  })
  it('sends one Aliyun editing instruction and the preceding image while omitting older Agent history', async () => {
    const { ctx } = await setup('qwen-image-2.0-pro-2026-03-03', {}, { provider: 'aliyun', api: 'openai-completions', baseURL: 'https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' })
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async url => String(url).includes('/generation')
      ? new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: 'https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/image.png' }] } }] } }), { headers: { 'content-type': 'application/json' } })
      : new Response(Buffer.from(PNG, 'base64'), { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetch)
    const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'old prompt' }] }), createAssistantMessage({ source: { provider: 'aliyun', model: 'qwen-image-2.0-pro-2026-03-03' }, content: [{ type: 'image', attachment: imageRef }] }), createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Make the background blue.' }] })]
    const chunks = await run(ctx, 'qwen-image-2.0-pro-2026-03-03', messages as never, 'aliyun')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string).input.messages).toEqual([{ role: 'user', content: [{ image: 'data:image/png;base64,' + PNG }, { text: 'Make the background blue.' }] }])
  })
  it.each(['https://127.0.0.1/private.png', 'https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com.evil.invalid/image.png'])('rejects an unexpected Aliyun result host without requesting it: %s', async image => {
    const { ctx, saveImages } = await setup('qwen-image-2.0-pro', {}, { provider: 'aliyun', api: 'openai-completions', baseURL: 'https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' })
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image }] } }] } }), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, 'qwen-image-2.0-pro', undefined, 'aliyun')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'UNSUPPORTED_IMAGE_RESPONSE' } } })
    expect(fetch).toHaveBeenCalledTimes(1); expect(saveImages).not.toHaveBeenCalled()
  })
  it('does not force the Alibaba image protocol on another gateway using the same model ID', async () => {
    const { ctx } = await setup('qwen-image-2.0-pro', {}, { provider: 'other', api: 'openai-completions', baseURL: 'https://fixture.invalid/v1' })
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 })); vi.stubGlobal('fetch', fetch)
    await run(ctx, 'qwen-image-2.0-pro', undefined, 'other')
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://fixture.invalid/v1/chat/completions')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('preserves an actual image returned by an unlisted model without requiring output metadata', async () => {
    const { ctx } = await setup('private-image-alias')
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => imageReply()); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, 'private-image-alias')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(chunks.filter(chunk => chunk.type === 'block-end' && chunk.block.type === 'image')).toHaveLength(1)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string).model).toBe('private-image-alias')
  })
  it('preserves mixed content arrays and deduplicates replayed image frames on an ordinary custom route', async () => {
    const { ctx, saveImages } = await setup('private-image-alias', {}, { provider: 'private-gateway', api: 'openai-completions', baseURL: 'https://fixture.invalid/v1' })
    const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,' + PNG } }
    const frames = [
      { choices: [{ index: 0, delta: { content: [{ type: 'text', text: 'Here it is.' }, image] } }] },
      { choices: [{ index: 0, delta: { images: [image] }, finish_reason: 'stop' }] },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })))
    const chunks = await run(ctx, 'private-image-alias', undefined, 'private-gateway')
    expect(chunks.filter(chunk => chunk.type === 'block-end' && chunk.block.type === 'image')).toHaveLength(1)
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'block-end', block: { type: 'text', text: 'Here it is.' } }))
    expect(saveImages).toHaveBeenCalledTimes(1)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })
  it('rejects invalid image bytes returned on an unlisted model without saving them', async () => {
    const { ctx, saveImages } = await setup('private-image-alias')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { images: [{ image_url: { url: 'data:image/png;base64,aGVsbG8=' } }] }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })))
    const chunks = await run(ctx, 'private-image-alias')
    expect(saveImages).not.toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
  })
  it('reuses the selected provider saved API-key record for model discovery instead of sending an unauthenticated request', async () => {
    const ctx = new Context(); contexts.push(ctx)
    await ctx.plugin(LlmRuntime)
    const readRecord = vi.fn().mockResolvedValue({ kind: 'api-key', key: 'fixture-record-key' })
    ctx.provide('credentials', { readRecord, listRecords: async () => [] } as never)
    await ctx.plugin(PiAi, { providers: { 'saved-key-gateway': { api: 'openai-completions', baseURL: 'https://saved-gateway.invalid/v1', models: [{ id: 'chat-model' }] } } })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{"data":[{"id":"chat-model"}]}', { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    await ctx.llm.discoverModels('llm-pi-ai', { provider: 'saved-key-gateway', api: 'openai-completions', baseURL: 'https://saved-gateway.invalid/v1' })
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer fixture-record-key')
    expect(readRecord).toHaveBeenCalledWith('llm-pi-ai/saved-key-gateway')
    expect(readRecord.mock.calls.every(call => call[0] === 'llm-pi-ai/saved-key-gateway')).toBe(true)
  })
  it('decodes, persists and reads the actual model image bytes through the production attachment store', async () => {
    const storageHome = mkdtempSync(join(tmpdir(), 'dsh-native-output-'))
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(LocalAttachmentStore, { dshHome: storageHome })
      await ctx.attachments.validateImage({ data: Buffer.from(PNG, 'base64'), mediaType: 'image/png' })
      ctx.provide('credentials', { resolve: async () => ({ value: 'fixture-key' }), readRecord: async () => undefined } as never)
      await ctx.plugin(PiAi, { providers: { openrouter: { apiKeyEnv: 'FIXTURE_KEY', models: [{ id: 'google/gemini-3.1-flash-image-preview' }] } } })
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => imageReply()))
      const chunks = await run(ctx)
      const image = chunks.find(chunk => chunk.type === 'block-end' && chunk.block.type === 'image')
      expect(image?.type).toBe('block-end')
      if (image?.type !== 'block-end' || image.block.type !== 'image') throw new Error(JSON.stringify(chunks.at(-1)))
      const stored = await ctx.attachments.readImage(image.block.attachment)
      expect(stored.data.byteLength).toBeGreaterThan(0)
      expect(stored.ref.width).toBe(1)
      expect(stored.ref.mediaType).toBe('image/png')
      expect(ctx.attachments.imageHostPath(stored.ref)).toContain(storageHome)
    } finally {
      await ctx.fiber.dispose()
      if (!resolve(storageHome).startsWith(resolve(tmpdir()) + sep + 'dsh-native-output-')) throw new Error('Refusing unexpected temporary cleanup target')
      rmSync(storageHome, { recursive: true, force: true })
    }
  })
  it('runs ordinary Agent turns, stores native images in the session, and ignores obsolete generation-mode records', async () => {
    const { ctx } = await setup()
    await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(SystemPrompt, { persona: 'fixture' })
    await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry); await ctx.plugin(AgentLoop, { agents: [] })
    const shell = vi.fn()
    ctx.tools.register(defineContentToolFixture({ name: 'pwsh', description: 'must not be involved in model image output', parameters: {}, execute: async () => { shell(); return [] } }))
    const { agent } = await ctx.agents.create({ sessionId: SessionId('native-image-session'), agentOptions: { provider: 'openrouter', model: 'google/gemini-3.1-flash-image-preview' } })
    // Replay an old extension event whose registration has been removed from the product.
    ;(agent.session as unknown as { append(type: string, data: unknown): unknown }).append('desktop/generation-mode', { active: true })
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => imageReply()); vi.stubGlobal('fetch', fetch)
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '画一张灯塔图片' }] }))
    await agent.whenIdle()
    const reply = agent.session.deriveMessages().findLast(message => message.role === 'assistant')
    expect(reply?.content).toContainEqual({ type: 'image', attachment: imageRef })
    expect(reply?.source).toMatchObject({ provider: 'openrouter', model: 'google/gemini-3.1-flash-image-preview' })
    expect(shell).not.toHaveBeenCalled()
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '将背景改成蓝色' }] }))
    await agent.whenIdle()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1]?.[1]?.body).toContain('data:image/png;base64,')
    expect(ctx.tools.get('pwsh', agent)).toBeDefined()
    expect(ctx.tools.get('DesktopGenerateImage', agent)).toBeUndefined()
    expect(JSON.stringify(agent.session.snapshotEvents())).not.toContain('fixture-key')
  })
  it('supports Google native multimodal image output using the same Google route and key', async () => {
    const { ctx } = await setup('gemini-3.1-flash-image-preview', {}, { provider: 'google' })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Here is the image.' }, { inlineData: { mimeType: 'image/png', data: PNG } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 5 } }), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, 'gemini-3.1-flash-image-preview', undefined, 'google')
    expect(chunks.filter(chunk => chunk.type === 'block-end' && chunk.block.type === 'image')).toHaveLength(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent')
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('x-goog-api-key')).toBe('fixture-key')
  })
  it('supports the selected OpenAI image model through its native Images API', async () => {
    const { ctx } = await setup('gpt-image-1', {}, { provider: 'openai' })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: PNG }] }), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, 'gpt-image-1', undefined, 'openai')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/images/generations')
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string).model).toBe('gpt-image-1')
  })
  it('uses native OpenAI image edits for follow-up references instead of rejecting assistant image history', async () => {
    const { ctx } = await setup('gpt-image-1', {}, { provider: 'openai' })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: PNG }] }), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    const messages = [createAssistantMessage({ source: { provider: 'openai', model: 'gpt-image-1' }, content: [{ type: 'image', attachment: imageRef }] }), createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Make the background blue.' }] })]
    const chunks = await run(ctx, 'gpt-image-1', messages as never, 'openai')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/images/edits')
    const body = fetch.mock.calls[0]?.[1]?.body as FormData
    expect(body.get('model')).toBe('gpt-image-1')
    expect(body.get('image')).toBeInstanceOf(Blob)
  })
  it('converts native Responses image output into one image, including terminal replay and usage', async () => {
    const { ctx } = await setup('response-image-fixture', { output: ['text', 'image'], imageGenerationApi: 'openai-responses' }, { provider: 'openai', api: 'openai-responses' })
    const item = { id: 'image-call', type: 'image_generation_call', result: PNG }
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('data: ' + JSON.stringify({ type: 'response.output_item.done', item }) + '\n\ndata: ' + JSON.stringify({ type: 'response.completed', response: { output: [item], usage: { input_tokens: 3, output_tokens: 5 } } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } })); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, 'response-image-fixture', undefined, 'openai')
    expect(chunks.filter(chunk => chunk.type === 'block-end' && chunk.block.type === 'image')).toHaveLength(1)
    expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 3, outputTokens: 5 } })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses')
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string).tools).toEqual([{ type: 'image_generation' }])
  })
  it('routes a pure image model to the provider Image API with the selected model and existing credentials', async () => {
    const { ctx } = await setup('qwen/qwen-image-3')
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify({ data: [{ b64_json: PNG, media_type: 'image/png' }] }), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, 'qwen/qwen-image-3')
    expect(fetch.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/images')
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)
    expect(body.model).toBe('qwen/qwen-image-3')
    expect(body).not.toHaveProperty('tools')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    const assembled = new BlockAssembler()
    for (const chunk of chunks) assembled.push(chunk)
    expect(assembled.blocks()).toEqual([{ type: 'image', attachment: imageRef }])
  })
  it('does not spend an image request on automatic session title generation', async () => {
    const { ctx } = await setup()
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const chunks: StreamChunk[] = []
    for await (const chunk of ctx.llm.stream({ provider: 'openrouter', model: 'google/gemini-3.1-flash-image-preview', messages: [], purpose: 'session-title' })) chunks.push(chunk)
    expect(fetch).not.toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'UNSUPPORTED_CONTENT' } } })
  })
  it('honors an explicit text-output declaration instead of blindly treating an image name as generation permission', async () => {
    const { ctx } = await setup('google/gemini-3.1-flash-image-preview', { output: ['text'] })
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response('data: {"id":"text","choices":[{"index":0,"delta":{"content":"text response"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })); vi.stubGlobal('fetch', fetch)
    await run(ctx)
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)
    expect(body).not.toHaveProperty('modalities')
    expect(body.tools).toHaveLength(1)
  })
  it('refuses malformed images without writing attachments or issuing a fallback request', async () => {
    const { ctx, saveImages } = await setup('qwen/qwen-image-3')
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: [{ b64_json: 'bm90LWFuLWltYWdl', media_type: 'image/png' }] }), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, 'qwen/qwen-image-3')
    expect(saveImages).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'INVALID_IMAGE' } } })
  })
  it.each(['google/gemini-3.1-flash-image-preview', 'openai/gpt-5-image'])('preserves native image output for %s instead of an empty text response', async model => {
    const { ctx, saveImages } = await setup(model)
    const fetch = vi.fn().mockImplementation(async () => imageReply()); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, model)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(chunks.filter(chunk => chunk.type === 'block-end' && chunk.block.type === 'image')).toHaveLength(1)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(saveImages).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetch.mock.calls[0]![1].body as string)
    expect(body.model).toBe(model)
    expect(body.modalities).toContain('image')
    expect(body.tools).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('keeps an earlier generated image usable as a reference in the next model request', async () => {
    const { ctx } = await setup()
    const fetch = vi.fn().mockImplementation(async () => imageReply()); vi.stubGlobal('fetch', fetch)
    const messages = [
      createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '画灯塔' }] }),
      createAssistantMessage({ source: { provider: 'openrouter', model: 'google/gemini-3.1-flash-image-preview' }, content: [{ type: 'image', attachment: imageRef }] }),
      createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '改成蓝色背景' }] }),
    ]
    const chunks = await run(ctx, 'google/gemini-3.1-flash-image-preview', messages as never)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]![1].body).toContain('data:image/png;base64,')
  })
  it('fetches the complete OpenRouter model list and retains image-output metadata', async () => {
    const { ctx } = await setup()
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: 'qwen/qwen-image-3', architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] } },
      { id: 'openai/gpt-5.5-pro', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
    ] }), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    const models = await ctx.llm.discoverModels('llm-pi-ai', { provider: 'openrouter' })
    expect(fetch.mock.calls[0]![0]).toBe('https://openrouter.ai/api/v1/models?output_modalities=all')
    expect(models[0]).toMatchObject({ id: 'qwen/qwen-image-3', outputModalities: ['image'] })
    expect(models[1]).toMatchObject({ id: 'openai/gpt-5.5-pro', outputModalities: ['text'] })
  })
  it('identifies the supplied log region restriction without suggesting a different credential', async () => {
    const { ctx } = await setup('openai/gpt-5.5-pro')
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: { code: 403, message: 'This model is not available in your region.' } }), { status: 403, headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch)
    const chunks = await run(ctx, 'openai/gpt-5.5-pro')
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'REGION_UNAVAILABLE' } } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

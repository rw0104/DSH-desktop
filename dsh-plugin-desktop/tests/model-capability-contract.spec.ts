import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { buildModelCatalog } from '@deepseek-ai/dsh-api-session-controller'
import { TYPERT } from '@deepseek-ai/dsh-api-session-controller/typert'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-api-session-controller/remote'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { AttachmentId, ImageVariantId } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

// Exercise the published adapter's JavaScript. Its SDK declaration graph is
// outside this test's contract; the calls below go through the typed Llm service.
const LlmPiAi = await import(pathToFileURL(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm-pi-ai')).href)

class CapabilityAdapter extends LlmAdapter {
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{
      provider,
      id: 'vision-model',
      name: 'Vision Model',
      inputModalities: ['text', 'image'],
    }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: 'Vision Model',
      inputModalities: ['text', 'image'],
    })
  }

  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('not exercised')
  }
}

describe('upstream model capability wire contract', () => {
  it('sends a declared custom-model image through the real adapter to an HTTP endpoint', async () => {
    const requests: unknown[] = []
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      requests.push(JSON.parse(Buffer.concat(chunks).toString()))
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end('data: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"image received"},"finish_reason":null}]}\n\ndata: {"id":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('mock server unavailable')
    const ctx = new Context()
    const key = 'DSH_TEST_IMAGE_API_KEY'
    vi.stubEnv(key, 'fixture-key')
    const data = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=', 'base64')
    const ref = { attachmentId: AttachmentId('sha256:' + 'a'.repeat(64)), mediaType: 'image/png' as const, bytes: data.length, width: 1, height: 1 }
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(LlmPiAi, { providers: {
        'image-test': {
          api: 'openai-completions', baseURL: `http://127.0.0.1:${address.port}/v1`, apiKeyEnv: key,
          models: [{ id: 'vision', input: ['text', 'image'] }, { id: 'text-only', input: ['text'] }],
        },
      } })
      ctx.provide('attachments', {
        imageHostPath: () => undefined,
        readImageRequest: async () => ({
          variantId: ImageVariantId('sha256:' + 'b'.repeat(64)),
          attachment: ref, data, mediaType: 'image/png', bytes: data.length,
          width: 1, height: 1, depth: 'uchar', space: 'srgb', hasAlpha: true,
        }),
      } as never)
      const messages = [createUserMessage({ source: { kind: 'plugin', plugin: 'image-test' }, content: [
        { type: 'text', text: 'Describe this fixture.' }, { type: 'image', attachment: ref },
      ] })]
      const received: StreamChunk[] = []
      for await (const chunk of ctx.llm.stream({ provider: 'image-test', model: 'vision', messages })) received.push(chunk)
      expect(received.some(chunk => chunk.type === 'text-delta' && chunk.text === 'image received')).toBe(true)
      expect(requests).toHaveLength(1)
      expect(JSON.stringify(requests[0])).toContain('data:image/png;base64,')
    } finally {
      await ctx.fiber.dispose()
      vi.unstubAllEnvs()
      server.closeAllConnections()
      await new Promise<void>(resolve => { server.close(() => resolve()) })
    }
  })

  it('preserves image declarations through the generated Host and Client Remote schemas', () => {
    const catalog = {
      default: { provider: 'custom-provider', model: 'vision-model' },
      routableProviders: ['custom-provider'],
      groups: [{ id: 'custom-provider', name: 'Custom', models: [{
        id: 'vision-model', name: 'Vision Model', inputModalities: ['text', 'image'],
      }] }],
      failures: [],
    }
    for (const contribution of [TYPERT, TYPERT_REMOTE]) {
      type Invocation = {
        method: string; result: { schema: { parse(value: unknown): unknown } }
      }
      const value = contribution as { invocations?: Invocation[]; descriptors?: Invocation[] }
      const invocations = value.invocations ?? value.descriptors ?? []
      const method = invocations.find(value => value.method === 'modelCatalog')
      expect(method).toBeDefined()
      expect(method?.result.schema.parse(catalog)).toEqual(catalog)
    }
  })

  it('uses explicit custom-provider image declarations and keeps text-only models restricted', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(LlmPiAi, { providers: {
        'custom-api': {
          api: 'openai-completions',
          baseURL: 'https://unused.invalid/v1',
          models: [
            { id: 'DeepSeek-V4-Flash-Vision-Exp', input: ['text', 'image'] },
            { id: 'text-only', input: ['text'] },
            { id: 'metadata-absent' },
          ],
        },
      } })
      expect((await ctx.llm.resolveModelInfo('custom-api', 'DeepSeek-V4-Flash-Vision-Exp')).inputModalities)
        .toEqual(['text', 'image'])
      expect((await ctx.llm.resolveModelInfo('custom-api', 'text-only')).inputModalities).toEqual(['text'])
      expect((await ctx.llm.resolveModelInfo('custom-api', 'metadata-absent')).inputModalities).toEqual(['text'])
    } finally { await ctx.fiber.dispose() }
  })

  it('projects resolved image capability through the public host model directory', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['custom-provider'], new CapabilityAdapter())
    ctx.provide('workspaceRegistry', { list: () => [] } as never)
    await expect(buildModelCatalog(ctx, {
      provider: 'custom-provider',
      model: 'vision-model',
    })).resolves.toEqual({
      default: { provider: 'custom-provider', model: 'vision-model' },
      routableProviders: ['custom-provider'],
      groups: [{
        id: 'custom-provider',
        name: 'custom-provider',
        models: [{
          id: 'vision-model',
          name: 'Vision Model',
          inputModalities: ['text', 'image'],
        }],
      }],
      failures: [],
    })
    await ctx.fiber.dispose()
  })
})

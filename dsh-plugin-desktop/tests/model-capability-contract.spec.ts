import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { buildModelCatalog } from '@deepseek-ai/dsh-api-session-controller'
import { describe, expect, it } from 'vitest'

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

import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { modelCatalogModelSchema } from '@deepseek-ai/dsh-host-apiproxy/api/sessions.schema'
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
  it('preserves explicit image input metadata in a model catalog entry', () => {
    expect(modelCatalogModelSchema.parse({
      id: 'vision-model',
      name: 'Vision Model',
      inputModalities: ['text', 'image'],
    })).toEqual({
      id: 'vision-model',
      name: 'Vision Model',
      inputModalities: ['text', 'image'],
    })
  })

  it('projects resolved image capability through the public host model directory', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: '' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['custom-provider'], new CapabilityAdapter())
    ctx.provide('workspaceRegistry', { list: () => [] } as never)
    const api = createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'custom-provider', model: 'vision-model' }),
      cwd: process.cwd(),
    })

    const response = await api.llm.models({ rpcId: RpcId('model-capability'), payload: {} })

    expect(response.result).toEqual({
      ok: true,
      value: {
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
      },
    })
    await ctx.fiber.dispose()
  })
})

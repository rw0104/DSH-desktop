import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import LlmRuntime, { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Real Agent/Session/JSONL services; only the remote model is a deterministic fixture. */
export async function sidechatRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'sidechat-v3-'))
  const ctx = new Context()
  const calls: GenerateOptions[] = []
  class CaptureAdapter extends LlmAdapter {
    async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      calls.push(options)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'fixture answer' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'fixture answer' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  async function dispose() {
    try { await ctx.fiber.dispose() } finally { await rm(root, { recursive: true, force: true }) }
  }
  try {
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['parent-provider', 'default-provider'], new CaptureAdapter())
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(JsonlPersistence, { root, compression: 'none' })
    await ctx.plugin(SystemPrompt, { personaPrefix: 'fixture {{provider}} / {{model}}' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentDefaultModel, { provider: 'default-provider', model: 'default-model' })
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    return { ctx, root, calls, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}

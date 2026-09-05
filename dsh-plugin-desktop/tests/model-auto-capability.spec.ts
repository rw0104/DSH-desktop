import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { TYPERT } from '@deepseek-ai/dsh-llm/typert'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-llm/remote'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Script } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const PiAi = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm-pi-ai')).href)
afterEach(() => { vi.unstubAllGlobals() })

// Expose private editor seams in an isolated test VM; exercise the shipped
// function bodies, not a hand-written replacement of the adoption logic.
function editorSeams(): Record<string, (...args: any[]) => any> {
  const manifest = require.resolve('@deepseek-ai/dsh-client-ui-settings-models/package.json')
  const source = readFileSync(join(dirname(manifest), 'lib/client.js'), 'utf8')
    .replace('return module.exports;', 'return { adopt, ModelListEditor, ModelInputControl, mergeDiscoveredModel };')
  let result: Record<string, (...args: any[]) => any> | undefined
  new Script(source).runInNewContext({ window: { __ModuleLoader__: {
    load: ({ factory }: { factory: (require: (name: string) => unknown) => typeof result }) => {
      result = factory(name => name.startsWith('react') ? require(name) : {})
    },
  } } })
  if (result === undefined) throw new Error('editor did not register')
  return result
}

describe('automatic custom-model image capabilities', () => {
  it('preserves discovered capability through adoption and the actual settings schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: 'private-visual', input_modalities: ['text', 'image'] },
      { id: 'bad-Vision', input_modalities: 'image' },
    ] }))))
    const ctx = new Context()
    const restored = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(PiAi, { providers: {} })
      const found = await ctx.llm.discoverModels('llm-pi-ai', { baseURL: 'https://fixture.invalid/v1' })
      const adopted = found.map(model => editorSeams().adopt!(model))
      const parsed = PiAi.Config({ providers: { custom: {
        api: 'openai-completions', baseURL: 'https://unused.invalid/v1', models: adopted,
      } } })
      expect(parsed.providers.custom.models[0].inputCapabilitySource).toBe('provider')
      expect(parsed.providers.custom.models[1].inputCapabilitySource).toBe('unknown')
      await restored.plugin(LlmRuntime)
      await restored.plugin(PiAi, parsed)
      expect((await restored.llm.resolveModelInfo('custom', 'private-visual')).inputModalities).toEqual(['text', 'image'])
      expect((await restored.llm.resolveModelInfo('custom', 'bad-Vision')).inputModalities).toEqual(['text'])
    } finally { await ctx.fiber.dispose(); await restored.fiber.dispose() }
  })

  it('uses the installed provider catalog without a network probe', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('discovery must stay offline'))
    vi.stubGlobal('fetch', fetch)
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(PiAi, { providers: {} })
      const found = await ctx.llm.discoverModels('llm-pi-ai', { provider: 'openai' })
      expect(found.find(model => model.id === 'gpt-4o-mini')).toMatchObject({ inputModalities: ['text', 'image'], inputCapabilitySource: 'catalog' })
      expect(fetch).not.toHaveBeenCalled()
    } finally { await ctx.fiber.dispose() }
  })

  it('defaults the advanced control to automatic, labels guesses, and keeps manual corrections across rediscovery', () => {
    const { ModelInputControl, mergeDiscoveredModel } = editorSeams()
    const onChange = vi.fn()
    const element = ModelInputControl!({ model: { id: 'private-Vision' }, field: 'input', t: (key: string) => key, disabled: false, onChange })
    const select = element.props.children[0]
    expect(select.props.value).toBe('auto')
    expect(element.props.children[1].props.children).toBe('modelInputName')
    select.props.onChange({ target: { value: 'text' } })
    expect(onChange).toHaveBeenCalledWith({ input: ['text'], inputCapabilitySource: undefined })
    const manual = { id: 'private-Vision', input: ['text'], maxTokens: 17 }
    const candidate = { id: 'private-Vision', inputModalities: ['text', 'image'], inputCapabilitySource: 'name', maxTokens: 999 }
    expect(mergeDiscoveredModel!(manual, candidate)).toEqual(manual)
    expect(mergeDiscoveredModel!({ id: 'private-Vision', maxTokens: 17 }, candidate)).toMatchObject({ input: ['text', 'image'], inputCapabilitySource: 'name', maxTokens: 17 })
    select.props.onChange({ target: { value: 'auto' } })
    expect(onChange).toHaveBeenLastCalledWith({ input: undefined, inputCapabilitySource: undefined })
  })

  it('keeps endpoint metadata, falls back to catalog/name, and never mistakes output modality for input', async () => {
    const listing = [
      { id: 'gateway-model', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
      { id: 'gpt-4o', input_modalities: ['text'] },
      { id: 'image-generator', architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
      { id: 'custom-Vision-Exp' }, { id: 'Qwen-Custom-VL' },
      { id: 'unknown', name: 'My Vision deployment' },
      { id: 'supervision' }, { id: 'unfamiliar-model' },
      { id: 'gpt-4o-mini' },
      { id: 'bad-Vision', input_modalities: 'image' },
    ]
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: listing })))
    vi.stubGlobal('fetch', fetch)
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(PiAi, { providers: {} })
      const found = await ctx.llm.discoverModels('llm-pi-ai', { baseURL: 'https://fixture.invalid/v1' })
      expect(found.find(model => model.id === 'gateway-model')).toMatchObject({ inputModalities: ['text', 'image'], inputCapabilitySource: 'provider' })
      expect(found.find(model => model.id === 'gpt-4o')).toMatchObject({ inputModalities: ['text'], inputCapabilitySource: 'provider' })
      expect(found.find(model => model.id === 'image-generator')).toMatchObject({ inputModalities: ['text'] })
      for (const id of ['custom-Vision-Exp', 'Qwen-Custom-VL', 'unknown']) {
        expect(found.find(model => model.id === id)).toMatchObject({ inputModalities: ['text', 'image'], inputCapabilitySource: 'name' })
      }
      for (const id of ['supervision', 'unfamiliar-model']) expect(found.find(model => model.id === id)).not.toHaveProperty('inputModalities')
      expect(found.find(model => model.id === 'gpt-4o-mini')).toMatchObject({ inputModalities: ['text', 'image'], inputCapabilitySource: 'catalog' })
      // Malformed advertised input is not permission to fall back to a name.
      expect(found.find(model => model.id === 'bad-Vision')).not.toHaveProperty('inputModalities')
      expect(fetch).toHaveBeenCalledOnce()
    } finally { await ctx.fiber.dispose() }
  })

  it('automatically resolves existing/manual models without overwriting an explicit text-only choice', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(PiAi, { providers: { 'arbitrary-gateway': {
        api: 'openai-completions', baseURL: 'https://unused.invalid/v1', models: [
          { id: 'gpt-4o-mini' }, { id: 'DeepSeek-V4-Flash-Vision-Exp' },
          { id: 'manual-Vision', input: ['text'] }, { id: 'unknown' },
        ],
      } } })
      for (const id of ['gpt-4o-mini', 'DeepSeek-V4-Flash-Vision-Exp']) {
        expect((await ctx.llm.resolveModelInfo('arbitrary-gateway', id)).inputModalities).toEqual(['text', 'image'])
      }
      for (const id of ['manual-Vision', 'unknown']) {
        expect((await ctx.llm.resolveModelInfo('arbitrary-gateway', id)).inputModalities).toEqual(['text'])
      }
    } finally { await ctx.fiber.dispose() }
  })

  it('preserves detection evidence through the real Remote schemas and the actual editor adoption function', () => {
    const candidates = [{ id: 'private-Vision', inputModalities: ['text', 'image'], inputCapabilitySource: 'name' }]
    for (const raw of [TYPERT, TYPERT_REMOTE]) {
      type Method = { method: string; result: { schema: { parse(value: unknown): unknown } } }
      const value = raw as { invocations?: Method[]; descriptors?: Method[] }
      const method = (value.invocations ?? value.descriptors ?? []).find(method => method.method === 'discoverModels')
      expect(method?.result.schema.parse(candidates)).toEqual(candidates)
    }
    expect(editorSeams().adopt!(candidates[0])).toMatchObject({
      id: 'private-Vision', input: ['text', 'image'], inputCapabilitySource: 'name',
    })
    expect(editorSeams().adopt!({ id: 'unfamiliar' })).not.toHaveProperty('input')
  })
})

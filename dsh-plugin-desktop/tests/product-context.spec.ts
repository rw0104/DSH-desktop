import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { bindScopeParent } from '@deepseek-ai/dsh-scope'
import { describe, it, expect } from 'vitest'
import { desktopProductContext, installDesktopProductContext } from '../src/product-context.ts'

describe('Desktop product context', () => {
  it('assembles current facts repeatedly and corrects an optional launcher source claim', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      ctx.systemPrompt.section({ name: 'harness:source', order: -900, text: 'editable checkout at app.asar' })
      installDesktopProductContext(ctx, { version: '2.2.6', mode: 'advanced', platform: 'win32', workspaceFiles: true })
      const parent = {}; const child = {}
      bindScopeParent(child, parent)
      for (const scope of [undefined, parent, child, parent]) {
        const text = renderPrompt(await ctx.systemPrompt.assemble(scope ? { scope } : {}))
        expect(text).toContain('powered by DeepSeek Harness')
        expect(text).toContain('DSH Desktop 2.2.6 on win32')
        expect(text).toContain('model identity and provider')
        expect(text).not.toContain('editable checkout at app.asar')
        expect(text).toContain('.dsh-uploads')
        expect(text).toContain(ctx.desktopProductContext())
      }
    } finally { await ctx.fiber.dispose() }
  })
  it('does not override a complete protocol-specific prompt', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      installDesktopProductContext(ctx, { version: '2.2.6', mode: 'advanced', platform: 'win32', workspaceFiles: true })
      ctx.systemPrompt.section({ name: 'protocol:fixture', order: 1, complete: true, text: 'A single image prompt.' })
      expect(renderPrompt(await ctx.systemPrompt.assemble())).toBe('A single image prompt.')
    } finally { await ctx.fiber.dispose() }
  })
  it('does not advertise Advanced controls or upload storage in compatibility mode', () => {
    const text = desktopProductContext({ version: '2.2.6', mode: 'compatibility', platform: 'darwin', workspaceFiles: false })
    expect(text).toContain('upstream default client')
    expect(text).not.toContain('workspace in .dsh-uploads')
    expect(text).not.toContain('Message images have an original-image preview and Save image action')
  })
})

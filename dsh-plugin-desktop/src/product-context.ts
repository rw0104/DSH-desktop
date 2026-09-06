import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { DesktopPlatform, DesktopShellMode } from './runtime.ts'

export interface DesktopProductFacts {
  version: string
  platform: DesktopPlatform
  mode: DesktopShellMode
  workspaceFiles: boolean
}

const resourceContext = 'Desktop installation files and app.asar are runtime resources, not an editable Harness implementation checkout. Use the current session workspace for user files. Do not infer the working directory from the installation location; inspect it with the available tools. Desktop changes require rebuilding and restarting the application; do not promise Web GUI development watchers or hot reload.'

/** One factual description shared by ordinary Agent requests and realtime voice. */
export function desktopProductContext(facts: DesktopProductFacts): string {
  const capabilities = [
    'The desktop window supports native text selection, copy, and editing context menus.',
    ...(facts.mode === 'advanced' ? [
      'The Advanced composer Add (+) menu offers image selection, workspace file upload, and commands. Images also support paste and drop with the same validation limits.',
      'Message images have an original-image preview and Save image action using stored attachment bytes. Message and code context menus provide copy actions; links can be copied or opened.',
      ...(facts.workspaceFiles ? ['Uploaded documents are saved under the current workspace in .dsh-uploads and referenced by path in the draft. Read them using available workspace tools; PDF and Office parsing depends on installed tools. Upload does not automatically parse or execute files.'] : []),
    ] : ['Compatibility mode uses the upstream default client. The Advanced Add menu and preview toolbar are not present in this mode.']),
  ]
  return [
    `Desktop product context v1: the user is using DSH Desktop ${facts.version} on ${facts.platform}, in ${facts.mode} mode.`,
    'DSH Desktop is the application; DeepSeek Harness is its Agent runtime. Your model identity and provider are those selected for the current session, and are not renamed to DSH Desktop. When the user says this app or this client, they mean DSH Desktop unless another target is specified.',
    resourceContext,
    ...capabilities,
    'UI capabilities describe user controls, not tools you can invoke implicitly. No screenshot, DOM, clipboard, or current selection is provided unless a tool or the user supplies it.',
  ].join('\n')
}

/** Register globally so resumed, compacted and child requests receive current facts. */
export function installDesktopProductContext(ctx: Context, facts: DesktopProductFacts): void {
  const text = () => desktopProductContext(facts)
  ctx.provide('desktopProductContext', text)
  const prompt = ctx.get('systemPrompt')
  if (prompt === undefined) return
  prompt.section({ name: 'desktop:product', order: -850, text })
  // A launcher or user composition may add the optional upstream source line.
  // Replace only that deployment-owned description, retaining all other sections.
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const result = await next()
    return { ...result, sections: result.sections.map(section => section.name === 'harness:source'
      ? { ...section, text: resourceContext } : section) }
  })
}

declare module '@deepseek-ai/cordis' {
  interface Context { desktopProductContext: () => string }
}

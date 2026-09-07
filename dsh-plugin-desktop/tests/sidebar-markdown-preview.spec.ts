import { describe, expect, it, vi } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Observe the public renderer input; real MarkdownText and media HTTP behavior
// are also exercised by the final browser smoke against the packaged client.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  MarkdownText: (props: { text: string }) => createElement('pre', { 'data-markdown-input': true }, props.text),
}))
vi.mock('react', async original => {
  const react = await original<typeof import('react')>()
  return { ...react, useLayoutEffect: react.useEffect }
})
const { MarkdownDocument } = await vi.importActual<{ MarkdownDocument: ComponentType<Record<string, unknown>> }>(
  'dsh-better-sidebar/src/client/MarkdownHtml.tsx',
)
const { analyzeMarkdownHtml } = await vi.importActual<{ analyzeMarkdownHtml(text: string): unknown }>(
  'dsh-better-sidebar/src/client/markdown-html.ts',
)
function preview(text: string, path = 'C:/workspace/docs/readme.md', sessionId = 'session-a') {
  return renderToStaticMarkup(createElement(MarkdownDocument, {
    info: analyzeMarkdownHtml(text),
    media: { scope: { sessionId, cwd: 'C:/workspace' }, path, origin: 'http://localhost:1234' },
    codeLabels: { copyLabel: 'Copy', copiedLabel: 'Copied' },
  }))
}

describe('Sidebar split Markdown preview media admission', () => {
  it('rewrites relative and reference images through the existing scoped media route', () => {
    const rendered = preview('![local](./plot.png)\n\n![reference][image]\n\n[image]: <./中文 文件.png>')
    expect(rendered).toContain('/sidebar/file?')
    expect(rendered).toContain('session-a')
    expect(rendered).not.toContain('](./plot.png)')
    const destinations = [...rendered.replaceAll('&amp;', '&').matchAll(/http:\/\/localhost:1234\/sidebar\/file\?[^\s)]+/g)]
    expect(destinations.some(([url]) => new URL(url).searchParams.get('path')?.endsWith('中文 文件.png'))).toBe(true)
  })
  it('recomputes local image paths for each document and session', () => {
    const first = preview('![local](./plot.png)')
    const second = preview('![local](./plot.png)', 'C:/workspace/other/readme.md', 'session-b')
    expect(first).toContain('session-a')
    expect(second).toContain('session-b')
    expect(second).toContain('other')
    expect(second).not.toContain('session-a')
  })
  it('keeps remote images and code examples unchanged', () => {
    const rendered = preview('![remote](https://example.com/plot.png)\n\n`![code](./local.png)`')
    expect(rendered).toContain('https://example.com/plot.png')
    expect(rendered).toContain('`![code](./local.png)`')
  })
})

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/** Load the shipped attachment plugin, not a desktop reimplementation of its gallery. */
function attachmentPlugin() {
  const require = createRequire(import.meta.url)
  let plugin: { apply(ctx: unknown): void } | undefined
  const entries = new Map<string, ComponentType<Record<string, unknown>>>()
  const services = new Map<string, unknown>()
  runInNewContext(readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-attachment/client'), 'utf8'), {
    window: { __ModuleLoader__: { load: ({ factory }: { factory: (require: (name: string) => unknown) => typeof plugin }) => {
      plugin = factory(name => name === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(name))
    } } },
  })
  plugin?.apply({
    provide: (name: string, value: unknown) => { services.set(name, value); return () => services.delete(name) },
    slots: {
      inject: (_name: string, install: () => unknown) => install(),
      register: (options: { name: string }, component: ComponentType<Record<string, unknown>>) => { entries.set(options.name, component); return () => {} },
    },
  })
  return { entries, services }
}

describe('additive attachment presentation extension', () => {
  it('offers a disposable preview extension without replacing the three original renderers', () => {
    const { entries, services } = attachmentPlugin()
    const presentation = services.get('attachmentPresentation') as { registerPreview(renderer: () => null): () => void } | undefined
    expect(presentation).toBeDefined()
    const renderer = () => null
    const remove = presentation!.registerPreview(renderer)
    expect(() => presentation!.registerPreview(() => null)).toThrow('already registered')
    remove()
    const removeNext = presentation!.registerPreview(renderer)
    remove()
    expect(() => presentation!.registerPreview(() => null)).toThrow('already registered')
    removeNext()
    expect([...entries.values()].map(component => component.name)).toEqual(['ComposerAttachments', 'MessageImages', 'MessageImages'])
  })
  it('keeps natural-size single images and compact multiple-image tiles', () => {
    const { entries } = attachmentPlugin()
    const Gallery = entries.get('conversation.message.images')!
    const image = { preview: { url: 'blob:test', name: 'tiny.png', width: 12, height: 6 } }
    const props = { loadImage: async () => '', align: 'start', t: (key: string) => key }
    const single = renderToStaticMarkup(createElement(Gallery, { ...props, images: [image] }))
    expect(single).toContain('data-variant="single"')
    expect(single).toContain('width:12px;height:6px')
    const multiple = renderToStaticMarkup(createElement(Gallery, { ...props, images: [image, image] }))
    expect(multiple.match(/data-variant="tile"/gu)).toHaveLength(2)
  })
})

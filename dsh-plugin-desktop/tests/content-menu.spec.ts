import { describe, expect, it, vi } from 'vitest'
import { contentMenuTemplate, externalContentUrl } from '../src/content-menu.ts'
const flags = { canUndo: false, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: true }
describe('native context menu boundaries', () => {
  const actions = { copy: vi.fn(), open: vi.fn(), save: vi.fn() }
  it('provides editing roles and enables only supported operations', () => {
    const menu = contentMenuTemplate({ isEditable: true, selectionText: '', editFlags: { ...flags, canPaste: false }, linkURL: '', mediaType: 'none', srcURL: '' }, 'http://127.0.0.1:1', actions, false)
    expect(menu.map(item => item.role)).toEqual(['cut', 'copy', 'paste', 'selectAll'])
    expect(menu[2]?.enabled).toBe(false)
  })
  it('does not launch executable protocols or download remote URLs', () => {
    for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'data:text/html,foo', 'shell:AppsFolder']) expect(externalContentUrl(url)).toBeUndefined()
    expect(contentMenuTemplate({ isEditable: false, selectionText: '', editFlags: flags, linkURL: 'javascript:alert(1)', mediaType: 'image', srcURL: 'https://provider.invalid/temp.png' }, 'http://127.0.0.1:1', actions, true)).toEqual([])
  })
  it('offers Save for a stored local attachment', () => {
    const menu = contentMenuTemplate({ isEditable: false, selectionText: 'selected', editFlags: flags, linkURL: 'https://example.org', mediaType: 'image', srcURL: 'blob:http://127.0.0.1:1/image' }, 'http://127.0.0.1:1', actions, false)
    expect(menu.map(item => item.label ?? item.role)).toEqual(['copy', 'Copy link', 'Open link in browser', 'Save image as…'])
  })
})

import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

export function externalContentUrl(raw: string): string | undefined {
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}

/** Native fallback for areas without an application-owned context menu. */
export function contentMenuTemplate(params: Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags' | 'linkURL' | 'mediaType' | 'srcURL'>, origin: string, actions: {
  copy(text: string): void; open(url: string): void; save(url: string): void
}, zh: boolean): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  if (params.isEditable) {
    items.push({ role: 'cut', enabled: params.editFlags.canCut }, { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste }, { role: 'selectAll', enabled: params.editFlags.canSelectAll })
  } else if (params.selectionText) items.push({ role: 'copy' })
  const link = externalContentUrl(params.linkURL)
  if (link) {
    items.push({ label: zh ? '复制链接' : 'Copy link', click: () => actions.copy(link) },
      { label: zh ? '在浏览器中打开链接' : 'Open link in browser', click: () => actions.open(link) })
  }
  if (params.mediaType === 'image') {
    try {
      const url = new URL(params.srcURL)
      if (url.protocol === 'blob:' && url.origin === origin) items.push({ label: zh ? '图片另存为…' : 'Save image as…', click: () => actions.save(url.href) })
    } catch { /* Only session-local attachment URLs are downloadable. */ }
  }
  return items
}

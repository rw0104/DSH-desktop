import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { showContentMenu, type ContentAction } from './content-menu.ts'
import { DESKTOP_CONTENT_BRIDGE, type DesktopContentBridge } from '../content-actions-contract.ts'

/** Reuse the message's existing copy action, which knows its original Markdown. */
export function conversationActions(target: Element, zh: boolean): ContentAction[] {
  const row = target.closest('[data-chat-flow-kind]')
  if (!row) return []
  if (target.closest('input,textarea,[contenteditable="true"]')) return []
  const actions: ContentAction[] = []
  const selection = window.getSelection()?.toString()
  if (selection) actions.push({ label: zh ? '复制选中文本' : 'Copy selected text', run: async () => { await writeClipboard(selection) } })
  const code = target.closest('pre')?.querySelector('code')?.textContent ?? target.closest('pre')?.textContent
  if (code) actions.push({ label: zh ? '复制代码' : 'Copy code', run: async () => { await writeClipboard(code) } })
  const link = target.closest<HTMLAnchorElement>('a[href]')
  if (link) {
    const url = new URL(link.href, location.href)
    actions.push({ label: zh ? '复制链接' : 'Copy link', run: async () => { await writeClipboard(url.href) } })
    if (url.protocol === 'https:' || url.protocol === 'http:') actions.push({ label: zh ? '打开链接' : 'Open link', run: async () => {
      const bridge = (window as unknown as Record<string, DesktopContentBridge | undefined>)[DESKTOP_CONTENT_BRIDGE]
      if (bridge) await bridge.openLink(url.href)
      else window.open(url.href, '_blank', 'noopener,noreferrer')
    } })
  }
  const copySelector = 'button[aria-label="Copy"],button[aria-label="复制"],button[aria-label="Copied"],button[aria-label="已复制"]'
  const tail = row.getAttribute('data-turn-process-answer') === 'true'
    ? [...row.parentElement?.querySelectorAll('[data-turn-tail]') ?? []].find(node => node.getAttribute('data-turn-tail') === row.getAttribute('data-chat-turn'))
    : undefined
  const copy = [...(tail ?? row).querySelectorAll<HTMLButtonElement>(copySelector)].at(-1)
  if (copy) actions.push({ label: zh ? '复制整条消息' : 'Copy message', run: () => copy.click() })
  return actions
}

export function installConversationContextMenu(zh: () => boolean): () => void {
  const focusable = new Set<HTMLElement>()
  const refresh = () => {
    document.querySelectorAll<HTMLElement>('[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"],[data-turn-process-answer="true"],[data-chat-flow-kind] pre').forEach(row => {
      if (!row.hasAttribute('tabindex')) { row.tabIndex = 0; focusable.add(row) }
    })
    for (const row of focusable) if (!row.isConnected) focusable.delete(row)
  }
  const observer = new MutationObserver(refresh)
  observer.observe(document.body, { childList: true, subtree: true })
  refresh()
  const context = (event: MouseEvent) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return
    const actions = conversationActions(event.target, zh())
    if (!actions.length) return
    event.preventDefault()
    showContentMenu(actions, { x: event.clientX, y: event.clientY })
  }
  const keyboard = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return
    const target = document.activeElement
    if (!(target instanceof Element)) return
    const actions = conversationActions(target, zh())
    if (!actions.length) return
    event.preventDefault()
    const rect = target.getBoundingClientRect()
    showContentMenu(actions, { x: rect.left, y: rect.bottom })
  }
  document.addEventListener('contextmenu', context)
  document.addEventListener('keydown', keyboard)
  return () => { observer.disconnect(); for (const row of focusable) row.removeAttribute('tabindex'); document.removeEventListener('contextmenu', context); document.removeEventListener('keydown', keyboard) }
}

export const VOICE_PANEL_NOT_VISIBLE = 'voice_panel_not_visible'

/** A mounted voice surface must confirm visibility before audio can start. */
export class VoicePanelGate {
  private surface: { sessionId: string; visible: () => boolean } | undefined
  private waiting: { sessionId: string; resolve: (visible: boolean) => void; timer: ReturnType<typeof setTimeout> } | undefined

  attach(sessionId: string, visible: () => boolean): () => void {
    const surface = { sessionId, visible }
    this.surface = surface
    this.check()
    return () => { if (this.surface === surface) this.surface = undefined }
  }

  check(): void {
    if (this.waiting && this.visible(this.waiting.sessionId)) this.complete(true)
  }

  wait(sessionId: string): Promise<boolean> {
    this.cancel()
    if (this.visible(sessionId)) return Promise.resolve(true)
    return new Promise(resolve => {
      this.waiting = { sessionId, resolve, timer: setTimeout(() => this.complete(false), 2_000) }
    })
  }

  cancel(): void { this.complete(false) }

  private visible(sessionId: string): boolean {
    try { return this.surface?.sessionId === sessionId && this.surface.visible() } catch { return false }
  }

  private complete(visible: boolean): void {
    const waiting = this.waiting
    this.waiting = undefined
    if (!waiting) return
    clearTimeout(waiting.timer)
    waiting.resolve(visible)
  }
}

/** Respect modal owners and actual hit testing, including collapsed ancestors. */
export function isVoicePanelVisible(panel: HTMLElement): boolean {
  if (!panel.isConnected || panel.closest('[inert]')) return false
  const rect = panel.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  for (const modal of panel.ownerDocument.querySelectorAll<HTMLElement>('[aria-modal="true"],dialog:modal')) {
    if (modal !== panel && !panel.contains(modal) && modal.getClientRects().length > 0) return false
  }
  const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2))
  const y = Math.max(0, Math.min(innerHeight - 1, rect.top + Math.min(rect.height / 2, 80)))
  const target = panel.ownerDocument.elementFromPoint(x, y)
  return target !== null && panel.contains(target)
}

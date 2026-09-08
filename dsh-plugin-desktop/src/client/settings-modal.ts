const TABBABLE = 'button,a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])'

function visible(element: HTMLElement): boolean {
  return element.isConnected && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
}

/** Coordinate existing settings/modal elements without replacing their content.
 * Observe only portal and settings-slot child lifetimes, never the streaming
 * subtree. The existing mask click remains the owner's close operation.
 */
export function installSettingsModalCoordinator(maskSelector: string): () => void {
  const inert = new Map<HTMLElement, boolean>()
  const covered = new Map<HTMLElement, string | null>()
  const returnFocus = new WeakMap<HTMLElement, HTMLElement>()
  const popupOwners = new WeakMap<HTMLElement, HTMLElement>()
  let active: HTMLElement | undefined
  let activeModal: HTMLElement | undefined
  let pressed: HTMLElement | undefined
  let settingsTrigger: HTMLElement | undefined
  let frame: number | undefined
  let syncing = false
  let observedSlot: Element | null = null
  const observer = new MutationObserver(() => schedule())
  observer.observe(document.body, { childList: true })

  const restore = () => {
    for (const [element, previous] of inert) element.inert = previous
    inert.clear()
    for (const [element, previous] of covered) {
      if (previous === null) element.removeAttribute('data-dsh-settings-covered')
      else element.setAttribute('data-dsh-settings-covered', previous)
    }
    covered.clear()
  }
  const targets = (modal: HTMLElement) => [...modal.querySelectorAll<HTMLElement>(TABBABLE)]
    .filter(element => visible(element) && !element.matches(':disabled') && !element.closest('[inert]'))

  const sync = () => {
    if (syncing) return
    syncing = true
    try {
      const previous = active
      restore()
      const mask = document.querySelector<HTMLElement>(maskSelector)
      const slot = document.querySelector('[data-slot="sidebar.settings"]')
      if (slot !== observedSlot) {
        observer.disconnect()
        observer.observe(document.body, { childList: true })
        if (slot) observer.observe(slot, { childList: true })
        observedSlot = slot
      }
      const settings = mask?.parentElement?.querySelector<HTMLElement>(':scope > [role="dialog"]')
      if (!mask || !settings || !visible(settings)) {
        active = undefined
        activeModal = undefined
        const target = previous ? returnFocus.get(previous) ?? settingsTrigger : undefined
        if (target?.isConnected && !target.closest('[inert]')
          && ![...document.querySelectorAll<HTMLElement>('[aria-modal="true"],dialog:modal')].some(visible)) target.focus({ preventScroll: true })
        return
      }
      settingsTrigger = [...mask.closest('[data-slot="sidebar.settings"]')!.querySelectorAll<HTMLElement>('button')]
        .find(element => !element.closest('[role="dialog"]') && visible(element)) ?? settingsTrigger
      const modals = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"],dialog:modal')].filter(visible)
      const native = modals.filter(element => element.matches('dialog:modal'))
      activeModal = native.at(-1) ?? modals.at(-1) ?? settings
      const popups = [...document.querySelectorAll<HTMLElement>('[role="menu"],[role="listbox"]')].filter(visible)
      for (const popup of popups) {
        if (!popupOwners.has(popup) && (pressed && activeModal.contains(pressed)
          || previous === activeModal || previous && popupOwners.get(previous) === activeModal)) popupOwners.set(popup, activeModal)
      }
      active = popups.filter(popup => popupOwners.get(popup) === activeModal).at(-1) ?? activeModal
      if (active !== previous && !returnFocus.has(active)) {
        const focused = document.activeElement
        const target = pressed?.isConnected && !active.contains(pressed) ? pressed
          : focused instanceof HTMLElement && focused !== document.body && focused.matches(TABBABLE) && !active.contains(focused) ? focused : undefined
        if (target) returnFocus.set(active, target)
      }
      if (activeModal !== settings) {
        covered.set(mask, mask.getAttribute('data-dsh-settings-covered'))
        mask.setAttribute('data-dsh-settings-covered', '')
      }
      const backdrop = activeModal.parentElement?.querySelector(':scope > [aria-hidden="true"]')
      const protectedNodes = [active, activeModal]
      for (const surface of protectedNodes) {
        let branch: HTMLElement = surface
        while (branch.parentElement) {
          for (const sibling of branch.parentElement.children) {
            if (!(sibling instanceof HTMLElement) || sibling === branch || sibling === backdrop
              || protectedNodes.some(node => sibling.contains(node))
              || sibling.matches('style,script,link') || sibling.inert) continue
            inert.set(sibling, false)
            sibling.inert = true
          }
          if (branch.parentElement === document.body) break
          branch = branch.parentElement
        }
      }
      const restoreTarget = previous && previous !== active && !previous.isConnected ? returnFocus.get(previous) : undefined
      if (restoreTarget?.isConnected && active.contains(restoreTarget)) restoreTarget.focus({ preventScroll: true })
      else if (!active.contains(document.activeElement)) targets(active)[0]?.focus({ preventScroll: true })
    } finally { syncing = false }
  }
  const schedule = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => { frame = undefined; sync() })
  }
  const pointer = (event: PointerEvent) => {
    if (event.target instanceof HTMLElement) pressed = event.target.closest<HTMLElement>(TABBABLE) ?? event.target
  }
  const key = (event: KeyboardEvent) => {
    sync()
    if (!active) return
    if (event.key === 'Escape') {
      if (active !== activeModal && activeModal) {
        event.preventDefault(); event.stopImmediatePropagation()
        // The maintained Menu owns its outside-pointer close operation. Keep
        // that lifecycle (including submenu cleanup) instead of closing settings.
        activeModal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        schedule()
        return
      }
      // Native dialog cancellation is its browser default action; stop the
      // underlying SettingsRoot's document listener without cancelling it.
      if (active.matches('dialog:modal')) { event.stopImmediatePropagation(); schedule(); return }
      const mask = active.parentElement?.querySelector<HTMLElement>(':scope > [aria-hidden="true"]')
      if (mask) { event.preventDefault(); event.stopImmediatePropagation(); mask.click(); schedule() }
      else {
        const imageMask = active.querySelector<HTMLElement>(':scope > [aria-hidden="true"]')
        if (imageMask && active.querySelector(':scope > img')) {
          event.preventDefault(); event.stopImmediatePropagation()
          imageMask.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          schedule()
        }
      }
    } else if (event.key === 'Tab') {
      const elements = targets(active)
      const first = elements[0], last = elements.at(-1)
      if (!first || !last) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }
  document.addEventListener('pointerdown', pointer, true)
  document.addEventListener('click', schedule, true)
  document.addEventListener('focusin', sync, true)
  document.addEventListener('keydown', key, true)
  sync()
  return () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    document.removeEventListener('pointerdown', pointer, true)
    document.removeEventListener('click', schedule, true)
    document.removeEventListener('focusin', sync, true)
    document.removeEventListener('keydown', key, true)
    observer.disconnect()
    restore()
  }
}

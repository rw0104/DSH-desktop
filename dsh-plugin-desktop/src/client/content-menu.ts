export interface ContentAction { label: string; run(): void | Promise<void> }
let closeCurrent: (() => void) | undefined

/** A keyboard-operable menu shared by Add and semantic conversation actions. */
export function showContentMenu(actions: readonly ContentAction[], point: { x: number; y: number }, onError: (error: unknown) => void = console.error): void {
  closeCurrent?.()
  if (!actions.length) return
  const previous = document.activeElement
  const menu = document.createElement('div')
  menu.className = 'dsh-context-menu'
  menu.setAttribute('role', 'menu')
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    menu.remove()
    document.removeEventListener('pointerdown', outside, true)
    window.removeEventListener('blur', close)
    window.removeEventListener('resize', close)
    document.removeEventListener('scroll', close, true)
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    if (closeCurrent === close) closeCurrent = undefined
  }
  const outside = (event: Event) => { if (!menu.contains(event.target as Node)) close() }
  actions.forEach(action => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.textContent = action.label
    button.onclick = () => { close(); Promise.resolve().then(() => action.run()).catch(onError) }
    menu.append(button)
  })
  menu.onkeydown = event => {
    const buttons = [...menu.querySelectorAll('button')]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close() }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
  }
  ;(document.querySelector('dialog[open]') ?? document.body).append(menu)
  menu.style.left = `${Math.max(8, Math.min(point.x, innerWidth - menu.offsetWidth - 8))}px`
  menu.style.top = `${Math.max(8, Math.min(point.y, innerHeight - menu.offsetHeight - 8))}px`
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('scroll', close, true)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
  closeCurrent = close
  menu.querySelector('button')?.focus()
}

export function closeContentMenu(): void { closeCurrent?.() }

/** Windows-only drive selector layered onto the official directory picker. */

interface LocaleFace {
  getSnapshot(): { active: string }
  subscribe(listener: () => void): () => void
}

const SELECT_ATTRIBUTE = 'data-dsh-desktop-drive-picker'

/** Normalize the host-provided list before it reaches the native-looking select. */
export function normalizeDriveLetters(driveLetters: readonly string[]): string[] {
  return [...new Set(driveLetters.map(letter => letter.toUpperCase()).filter(letter => /^[A-Z]$/u.test(letter)))]
}

/** Capture a valid Windows volume root before the select is reset for the next choice. */
export function windowsDriveRoot(letter: string): string {
  const normalized = normalizeDriveLetters([letter])[0]
  return normalized === undefined ? '' : `${normalized}:\\`
}

export function installWindowsDrivePickerEnhancement(
  platform: string,
  locale: LocaleFace,
  driveLetters: readonly string[] = [],
): () => void {
  if (platform !== 'win32') return () => {}
  const drives = normalizeDriveLetters(driveLetters)
  if (drives.length === 0) return () => {}

  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/drive-picker'
  style.textContent = `[${SELECT_ATTRIBUTE}]{height:30px;min-width:92px;margin-left:4px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);font:13px/20px var(--dsw-font-family,system-ui,sans-serif)}[${SELECT_ATTRIBUTE}:focus-visible]{outline:2px solid var(--dsw-alias-focus-ring);outline-offset:1px}`
  document.head.appendChild(style)

  let activeLocale = locale.getSnapshot().active
  const copy = () => /^zh(?:[-_]|$)/iu.test(activeLocale.trim())
  const label = () => copy() ? '选择盘符' : 'Select drive'
  const optionLabel = (letter: string) => copy() ? `${letter}盘 (${letter}:)` : `Drive ${letter}:`

  const navigate = (dialog: Element, path: string): void => {
    const edit = dialog.querySelector<HTMLButtonElement>('button[aria-label="编辑路径"], button[aria-label="Edit path"]')
    if (edit === null) return
    edit.click()
    window.setTimeout(() => {
      const input = dialog.querySelector<HTMLInputElement>('input[aria-label="编辑路径"], input[aria-label="Edit path"]')
      if (input === null) return
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, path)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
    }, 0)
  }

  const enhance = (): void => {
    const edit = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="编辑路径"], button[aria-label="Edit path"]')]
      .find(button => button.closest('[role="dialog"]') !== null)
    if (edit === undefined) return
    const dialog = edit.closest('[role="dialog"]')
    if (dialog === null || dialog.querySelector(`[${SELECT_ATTRIBUTE}]`) !== null) return
    const picker = document.createElement('select')
    picker.setAttribute(SELECT_ATTRIBUTE, '')
    picker.setAttribute('aria-label', label())
    picker.title = label()
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = label()
    picker.appendChild(placeholder)
    for (const letter of drives) {
      const option = document.createElement('option')
      option.value = letter
      option.textContent = optionLabel(letter)
      picker.appendChild(option)
    }
    picker.addEventListener('change', () => {
      const path = windowsDriveRoot(picker.value)
      if (path !== '') navigate(dialog, path)
      picker.value = ''
    })
    edit.parentElement?.insertBefore(picker, edit)
  }

  const observer = new MutationObserver(enhance)
  observer.observe(document.body, { childList: true, subtree: true })
  enhance()
  const unsubscribe = locale.subscribe(() => {
    activeLocale = locale.getSnapshot().active
    const picker = document.querySelector<HTMLSelectElement>(`[${SELECT_ATTRIBUTE}]`)
    if (picker === null) return
    picker.setAttribute('aria-label', label())
    picker.title = label()
    const first = picker.options[0]
    if (first !== undefined) first.textContent = label()
    for (let index = 0; index < drives.length; index += 1) {
      const option = picker.options[index + 1]
      if (option !== undefined) option.textContent = optionLabel(drives[index] ?? '')
    }
  })
  return () => {
    unsubscribe()
    observer.disconnect()
    document.querySelector(`[${SELECT_ATTRIBUTE}]`)?.remove()
    style.remove()
  }
}

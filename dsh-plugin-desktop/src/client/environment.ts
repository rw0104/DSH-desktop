/** Desktop renderer modes accepted from the Electron-owned page URL. */
export type DesktopClientMode = 'compatibility' | 'advanced'

/** Host platforms whose native chrome has a desktop presentation. */
export type DesktopClientPlatform = 'darwin' | 'win32' | 'linux'

/** Validated renderer environment supplied by the Electron Host. */
export interface DesktopClientEnvironment {
  /** Active shell mode for this BrowserWindow lifetime. */
  mode: DesktopClientMode
  /** Electron Host platform used for native spacing and drag regions. */
  platform: DesktopClientPlatform
  /** Windows drive letters detected by the Electron Host. */
  driveLetters: readonly string[]
  /** Installed product version supplied by the Electron Host. */
  productVersion: string
}

const MODES = new Set<DesktopClientMode>(['compatibility', 'advanced'])
const PLATFORMS = new Set<DesktopClientPlatform>(['darwin', 'win32', 'linux'])
const PRODUCT_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u

/** Accept only one-letter Windows volume identifiers from the Host URL. */
function parseDriveLetters(value: string | null): string[] {
  if (value === null) return []
  return [...new Set(value.toUpperCase().split('').filter(letter => /^[A-Z]$/u.test(letter)))]
}

/**
 * Validate the Electron-owned query marker before any desktop client effects run.
 * @param search - URL search string, including or omitting the leading question mark.
 * @returns the validated desktop renderer environment, or undefined outside the desktop shell.
 */
export function parseDesktopClientEnvironment(search: string): DesktopClientEnvironment | undefined {
  const params = new URLSearchParams(search)
  const mode = params.get('dsh-desktop-mode')
  const platform = params.get('dsh-desktop-platform')
  const productVersion = params.get('dsh-desktop-version') ?? 'unknown'
  if (mode === null && platform === null) return undefined
  if (!MODES.has(mode as DesktopClientMode)) {
    throw new Error(`dsh-plugin-desktop: invalid or missing dsh-desktop-mode ${JSON.stringify(mode)}`)
  }
  if (!PLATFORMS.has(platform as DesktopClientPlatform)) {
    throw new Error(`dsh-plugin-desktop: invalid or missing dsh-desktop-platform ${JSON.stringify(platform)}`)
  }
  if (productVersion !== 'unknown' && !PRODUCT_VERSION.test(productVersion)) {
    throw new Error(`dsh-plugin-desktop: invalid dsh-desktop-version ${JSON.stringify(productVersion)}`)
  }
  return {
    mode: mode as DesktopClientMode,
    platform: platform as DesktopClientPlatform,
    productVersion,
    driveLetters: platform === 'win32' ? parseDriveLetters(params.get('dsh-desktop-drives')) : [],
  }
}

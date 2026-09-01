/** Fixed renderer-to-main contract for user-triggered product links. */

/** IPC channel registered only for the active BrowserWindow generation. */
export const DESKTOP_EXTERNAL_NAVIGATION_CHANNEL = 'dsh-desktop:open-external'

/** Main-world key exposed by the context-isolated preload. */
export const DESKTOP_EXTERNAL_NAVIGATION_BRIDGE = '__DSH_DESKTOP_EXTERNAL_NAVIGATION__'

/** Product-owned links the renderer may request without supplying a URL. */
export type DesktopExternalNavigationAction = 'repository' | 'release-notes' | 'realtime-voice-credentials'

const ACTIONS = new Set<DesktopExternalNavigationAction>(['repository', 'release-notes', 'realtime-voice-credentials'])
const REPOSITORY_URL = 'https://github.com/rw0104/DSH-desktop'
const REALTIME_VOICE_CREDENTIALS_URL = `${REPOSITORY_URL}/blob/main/docs/user-guide-realtime-voice-credentials.md`

/** Validate an untrusted IPC action without accepting arbitrary URLs. */
export function parseDesktopExternalNavigationAction(value: unknown): DesktopExternalNavigationAction {
  if (typeof value !== 'string' || !ACTIONS.has(value as DesktopExternalNavigationAction)) {
    throw new Error('dsh-plugin-desktop: external navigation action is invalid')
  }
  return value as DesktopExternalNavigationAction
}

/** Resolve one validated product action to its fixed HTTPS target. */
export function desktopExternalNavigationUrl(
  action: DesktopExternalNavigationAction,
  productVersion: string,
): string {
  if (action === 'repository') return REPOSITORY_URL
  if (action === 'realtime-voice-credentials') return REALTIME_VOICE_CREDENTIALS_URL
  return `${REPOSITORY_URL}/releases/tag/v${productVersion}`
}

/** Capability exposed by the context-isolated preload. */
export interface DesktopExternalNavigationBridge {
  open(action: DesktopExternalNavigationAction): Promise<void>
}

/** Window shape consumed by desktop-only client code. */
export interface DesktopExternalNavigationBridgeWindow {
  __DSH_DESKTOP_EXTERNAL_NAVIGATION__?: DesktopExternalNavigationBridge
}

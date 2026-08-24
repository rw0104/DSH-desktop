/** Client-side access to the context-isolated product-link capability. */

import type {
  DesktopExternalNavigationAction,
  DesktopExternalNavigationBridgeWindow,
} from '../external-navigation-contract.ts'

/** Request one fixed product link through the preload bridge. */
export function requestDesktopExternalNavigation(
  action: DesktopExternalNavigationAction,
  target: DesktopExternalNavigationBridgeWindow = window as unknown as DesktopExternalNavigationBridgeWindow,
): Promise<void> {
  const bridge = target.__DSH_DESKTOP_EXTERNAL_NAVIGATION__
  if (bridge === undefined) {
    return Promise.reject(new Error('dsh-plugin-desktop: external navigation bridge is unavailable'))
  }
  return bridge.open(action)
}

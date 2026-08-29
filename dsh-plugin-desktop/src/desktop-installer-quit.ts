/** Product-owned Windows installer flag for an orderly Desktop shutdown. */
export const DESKTOP_INSTALLER_QUIT_FLAG = '--dsh-desktop-installer-quit'

/** Return whether one process invocation belongs to the installer quit handoff. */
export function isDesktopInstallerQuitRequest(
  argv: readonly string[],
  platform: NodeJS.Platform,
): boolean {
  return platform === 'win32' && argv.includes(DESKTOP_INSTALLER_QUIT_FLAG)
}

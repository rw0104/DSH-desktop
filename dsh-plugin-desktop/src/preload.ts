/** Minimal context-isolated bridge for resolving operating-system drag payloads. */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { DESKTOP_FILE_PATH_BRIDGE } from './file-path-bridge-contract.ts'
import {
  DESKTOP_EXTERNAL_NAVIGATION_BRIDGE,
  DESKTOP_EXTERNAL_NAVIGATION_CHANNEL,
  type DesktopExternalNavigationAction,
} from './external-navigation-contract.ts'

contextBridge.exposeInMainWorld(DESKTOP_FILE_PATH_BRIDGE, {
  /** Resolve only genuine disk-backed Web File objects selected by the operator. */
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
})

contextBridge.exposeInMainWorld(DESKTOP_EXTERNAL_NAVIGATION_BRIDGE, {
  /** Submit only a compile-time product action; the main process revalidates the IPC value. */
  async open(action: DesktopExternalNavigationAction): Promise<void> {
    await ipcRenderer.invoke(DESKTOP_EXTERNAL_NAVIGATION_CHANNEL, action)
  },
})

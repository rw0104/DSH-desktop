import { existsSync } from 'node:fs'
import {
  resolveWindowsExecutable,
  type DesktopTerminalExecutableExists,
} from './desktop-terminal.ts'

export interface DesktopSidebarTerminalConfig {
  shell: string
  shellArgs: string[]
}

/** Resolve a deterministic embedded shell without the blank Windows PowerShell fallback. */
export function resolveDesktopSidebarTerminal(
  platform: NodeJS.Platform = process.platform,
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
  exists: DesktopTerminalExecutableExists = existsSync,
): DesktopSidebarTerminalConfig | undefined {
  if (platform !== 'win32') return undefined

  const pwsh = resolveWindowsExecutable('pwsh.exe', environment, exists)
  if (pwsh !== undefined) {
    return { shell: pwsh, shellArgs: ['-NoLogo', '-NoProfile'] }
  }

  const cmd = resolveWindowsExecutable('cmd.exe', environment, exists)
  if (cmd !== undefined) return { shell: cmd, shellArgs: ['/D'] }

  const powershell = resolveWindowsExecutable('powershell.exe', environment, exists)
  if (powershell !== undefined) {
    return { shell: powershell, shellArgs: ['-NoLogo', '-NoProfile'] }
  }
  return undefined
}

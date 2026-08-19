import { describe, expect, it } from 'vitest'
import { resolveDesktopSidebarTerminal } from '../src/sidebar-terminal-shell.ts'

const windowsEnvironment = {
  SystemRoot: 'C:\\Windows',
  PATH: 'C:\\Tools\\PowerShell;C:\\Windows\\System32',
}

describe('Better Sidebar terminal shell selection', () => {
  it('prefers PowerShell 7 and suppresses startup profiles', () => {
    expect(resolveDesktopSidebarTerminal('win32', windowsEnvironment, path => (
      path === 'C:\\Tools\\PowerShell\\pwsh.exe'
      || path === 'C:\\Windows\\System32\\cmd.exe'
    ))).toEqual({
      shell: 'C:\\Tools\\PowerShell\\pwsh.exe',
      shellArgs: ['-NoLogo', '-NoProfile'],
    })
  })

  it('uses cmd instead of the Windows PowerShell 5.1 fallback', () => {
    expect(resolveDesktopSidebarTerminal('win32', windowsEnvironment, path => (
      path === 'C:\\Windows\\System32\\cmd.exe'
    ))).toEqual({
      shell: 'C:\\Windows\\System32\\cmd.exe',
      shellArgs: ['/D'],
    })
  })

  it('leaves non-Windows shells under upstream ownership', () => {
    expect(resolveDesktopSidebarTerminal('darwin', {}, () => false)).toBeUndefined()
  })
})

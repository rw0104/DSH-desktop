import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESKTOP_INSTALLER_QUIT_FLAG } from '../src/desktop-installer-quit.ts'

describe('Windows NSIS running-app handoff', () => {
  const script = readFileSync(join(process.cwd(), 'build', 'installer.nsh'), 'utf8')
  const inPlace = readFileSync(join(process.cwd(), 'build', 'installer-7z-in-place.nsh'), 'utf8')

  it('gates the 7z in-place experiment without including app-builder internals twice', () => {
    expect(inPlace).toContain('!define DSH_7Z_IN_PLACE')
    expect(inPlace).toContain('!include "${BUILD_RESOURCES_DIR}\\installer.nsh"')
    expect(inPlace).not.toContain('!include "installer.nsh"')
  })

  it('detects only the installed application executable path', () => {
    const detection = script.indexOf('DSH_DESKTOP_INSTALLER_TARGET')
    const freshInstall = script.indexOf('IfFileExists "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" 0 dsh_installer_app_stopped')
    const powershellProbe = script.indexOf('!insertmacro IS_POWERSHELL_AVAILABLE')
    const request = script.indexOf(DESKTOP_INSTALLER_QUIT_FLAG)
    const wait = script.indexOf('dsh_installer_wait_for_exit:')
    const fallback = script.indexOf('dsh_installer_confirm_fallback:')

    expect(script).toContain('!macro customCheckAppRunning')
    expect(script).toContain('$INSTDIR\\${APP_EXECUTABLE_FILENAME}')
    expect(script).toContain('ExecutablePath.Equals($$taskTarget')
    expect(script).toContain('[System.StringComparison]::OrdinalIgnoreCase')
    expect(detection).toBeGreaterThanOrEqual(0)
    expect(request).toBeGreaterThan(detection)
    expect(wait).toBeGreaterThan(request)
    expect(fallback).toBeGreaterThan(wait)
    expect(script).not.toContain(".StartsWith('$INSTDIR'")
    expect(script).not.toContain('!insertmacro FIND_PROCESS')
    expect(script).not.toContain('!insertmacro KILL_PROCESS')
    expect(freshInstall).toBeGreaterThanOrEqual(0)
    expect(powershellProbe).toBeGreaterThan(freshInstall)
  })

  it('waits 30 seconds before an explicit scoped fallback', () => {
    expect(script).toContain('$R1 < 60')
    expect(script).toContain('Sleep 500')
    expect(script).toContain('Stop-Process -Id $$_.ProcessId')
    expect(script).toContain('Stop-Process -Id $$_.ProcessId -Force')
    expect(script).toContain('MB_OKCANCEL|MB_ICONEXCLAMATION')
    expect(script).toContain('MB_RETRYCANCEL|MB_ICONEXCLAMATION')
    expect(script).not.toContain('taskkill')
    expect(script).not.toContain('nsProcess::KillProcess')
  })
})

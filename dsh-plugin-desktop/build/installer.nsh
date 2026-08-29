; Scope every running-process action to the installed DSH Desktop executable.
; A helper under $INSTDIR or a same-named executable elsewhere must not block
; an upgrade or be terminated by the fallback path.
!macro dshFindInstallTarget _RETURN
  ${if} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "try { $$taskTarget=[System.IO.Path]::GetFullPath($$env:DSH_DESKTOP_INSTALLER_TARGET); $$taskMatches=@(Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.Equals($$taskTarget, [System.StringComparison]::OrdinalIgnoreCase) }); if ($$taskMatches.Count -gt 0) { exit 0 } else { exit 1 } } catch { exit 2 }"`
    Pop ${_RETURN}
  ${else}
    StrCpy ${_RETURN} 2
  ${endIf}
!macroend

!macro dshStopInstallTarget _FORCE _RETURN
  ${if} ${_FORCE} == 1
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "try { $$taskTarget=[System.IO.Path]::GetFullPath($$env:DSH_DESKTOP_INSTALLER_TARGET); Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.Equals($$taskTarget, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction Stop }; exit 0 } catch { exit 1 }"`
  ${else}
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "try { $$taskTarget=[System.IO.Path]::GetFullPath($$env:DSH_DESKTOP_INSTALLER_TARGET); Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.Equals($$taskTarget, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -ErrorAction Stop }; exit 0 } catch { exit 1 }"`
  ${endIf}
  Pop ${_RETURN}
!macroend

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  System::Call 'Kernel32::SetEnvironmentVariable(t, t) i("DSH_DESKTOP_INSTALLER_TARGET", "$INSTDIR\${APP_EXECUTABLE_FILENAME}").r0'

  dsh_installer_check_target:
    !insertmacro dshFindInstallTarget $R0
    ${if} $R0 == 1
      Goto dsh_installer_app_stopped
    ${elseIf} $R0 != 0
      Goto dsh_installer_probe_unavailable
    ${endIf}

  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 dsh_installer_confirm_fallback
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --dsh-desktop-installer-quit'
    StrCpy $R1 0

  dsh_installer_wait_for_exit:
    !insertmacro dshFindInstallTarget $R0
    ${if} $R0 == 1
      Goto dsh_installer_app_stopped
    ${elseIf} $R0 != 0
      Goto dsh_installer_probe_unavailable
    ${endIf}
    IntOp $R1 $R1 + 1
    ; Cordis disposal, pending writes, antivirus, and slow disks can all keep
    ; the process alive briefly after the single-instance handoff.
    ${if} $R1 < 60
      Sleep 500
      Goto dsh_installer_wait_for_exit
    ${endIf}

  dsh_installer_confirm_fallback:
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK dsh_installer_stop_target
    Quit

  dsh_installer_stop_target:
    DetailPrint "$(appClosing)"
    !insertmacro dshStopInstallTarget 0 $R0
    Sleep 1000
    !insertmacro dshFindInstallTarget $R0
    ${if} $R0 == 1
      Goto dsh_installer_app_stopped
    ${elseIf} $R0 != 0
      Goto dsh_installer_probe_unavailable
    ${endIf}

    !insertmacro dshStopInstallTarget 1 $R0
    Sleep 500
    !insertmacro dshFindInstallTarget $R0
    ${if} $R0 == 1
      Goto dsh_installer_app_stopped
    ${elseIf} $R0 != 0
      Goto dsh_installer_probe_unavailable
    ${endIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY dsh_installer_stop_target
    Quit

  dsh_installer_probe_unavailable:
    ; If exact-path inspection is unavailable, fail closed instead of falling
    ; back to a global image-name or install-directory kill.
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY dsh_installer_check_target
    Quit

  dsh_installer_app_stopped:
!macroend

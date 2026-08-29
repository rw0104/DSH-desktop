param(
  [Parameter(Mandatory = $true)]
  [string]$BaseInstaller,

  [Parameter(Mandatory = $true)]
  [string]$CandidateInstaller
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'This smoke test requires Windows.'
}

$taskBaseInstaller = (Resolve-Path -LiteralPath $BaseInstaller).Path
$taskCandidateInstaller = (Resolve-Path -LiteralPath $CandidateInstaller).Path
$taskBaseExpectedVersion = (Get-Item -LiteralPath $taskBaseInstaller).VersionInfo.ProductVersion
$taskCandidateExpectedVersion = (Get-Item -LiteralPath $taskCandidateInstaller).VersionInfo.ProductVersion
$taskExistingProcesses = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -ieq 'DSH Desktop.exe'
})
$taskUninstallRoots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$taskExistingInstalls = @(Get-ItemProperty $taskUninstallRoots -ErrorAction SilentlyContinue | Where-Object {
  $_.DisplayName -match '^DSH Desktop'
})

if ($taskExistingProcesses.Count -gt 0 -or $taskExistingInstalls.Count -gt 0) {
  throw 'Refusing to run while an existing DSH Desktop process or installation is present.'
}

$taskTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$taskRoot = Join-Path $taskTempRoot ("dsh-installer-upgrade-" + [guid]::NewGuid().ToString('N'))
$taskInstallRoot = Join-Path $taskRoot 'app'
$taskAppDataRoot = Join-Path $taskRoot 'appdata'
$taskUserData = Join-Path $taskAppDataRoot 'DSH Desktop'
$taskDshHome = Join-Path $taskRoot 'dsh-home'
$taskDecoyRoot = Join-Path $taskRoot 'decoy'
$taskActiveRunMarker = Join-Path $taskUserData 'crash-evidence\active-run.json'
$taskAppPath = Join-Path $taskInstallRoot 'DSH Desktop.exe'
$taskHelperPath = Join-Path $taskInstallRoot 'DSH Helper.exe'
$taskDecoyPath = Join-Path $taskDecoyRoot 'DSH Desktop.exe'
$taskUninstallerPath = Join-Path $taskInstallRoot 'Uninstall DSH Desktop.exe'
$taskOriginalAppData = $env:APPDATA
$taskOriginalDshHome = $env:DSH_HOME
$taskBaseProcess = $null
$taskCandidateProcess = $null
$taskHelperProcess = $null
$taskDecoyProcess = $null
$taskResult = [ordered]@{
  scenario = 'isolated 2.0.12 to candidate upgrade with active app and unrelated processes'
  testRoot = $taskRoot
  baseInstallerSha256 = (Get-FileHash -LiteralPath $taskBaseInstaller -Algorithm SHA256).Hash
  baseExpectedVersion = $taskBaseExpectedVersion
  candidateInstallerSha256 = (Get-FileHash -LiteralPath $taskCandidateInstaller -Algorithm SHA256).Hash
  candidateExpectedVersion = $taskCandidateExpectedVersion
  baseInstallExitCode = $null
  baseInstallElapsedMs = $null
  baseInstalledVersion = $null
  upgradeExitCode = $null
  upgradeElapsedMs = $null
  upgradedVersion = $null
  baseProcessStopped = $false
  helperSurvivedUpgrade = $false
  sameNameDecoySurvivedUpgrade = $false
  overwriteExitCode = $null
  overwriteElapsedMs = $null
  overwriteVersion = $null
  candidateProcessStopped = $false
  activeRunMarkerCleared = $false
  helperSurvivedOverwrite = $false
  sameNameDecoySurvivedOverwrite = $false
  uninstallExitCode = $null
  installRootRemoved = $false
  uninstallEntryRemoved = $false
  testProcessesRemaining = $null
  testRootRemoved = $false
  error = $null
  success = $false
}

function Wait-TaskCondition([scriptblock]$taskCondition, [string]$taskDescription, [int]$taskTimeoutSeconds = 60) {
  $taskDeadline = [DateTime]::UtcNow.AddSeconds($taskTimeoutSeconds)
  do {
    if (& $taskCondition) { return }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $taskDeadline)
  throw "Timed out waiting for $taskDescription."
}

function Start-TaskInstaller([string]$taskInstallerPath) {
  $taskStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $taskProcess = Start-Process -FilePath $taskInstallerPath -ArgumentList @(
    '/S'
    '/currentuser'
    "/D=$taskInstallRoot"
  ) -PassThru -Wait -WindowStyle Hidden
  $taskStopwatch.Stop()
  return [ordered]@{
    exitCode = $taskProcess.ExitCode
    elapsedMs = $taskStopwatch.ElapsedMilliseconds
  }
}

function Start-TaskDesktop {
  $taskStartInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $taskStartInfo.FileName = $taskAppPath
  $taskStartInfo.WorkingDirectory = $taskInstallRoot
  $taskStartInfo.UseShellExecute = $false
  $taskStartInfo.EnvironmentVariables['APPDATA'] = $taskAppDataRoot
  $taskStartInfo.EnvironmentVariables['DSH_HOME'] = $taskDshHome
  return [System.Diagnostics.Process]::Start($taskStartInfo)
}

function Test-TaskVersionEquals([string]$taskActualVersion, [string]$taskExpectedVersion) {
  $taskActual = [version]$taskActualVersion
  $taskExpected = [version]$taskExpectedVersion
  return $taskActual.Major -eq $taskExpected.Major -and
    $taskActual.Minor -eq $taskExpected.Minor -and
    $taskActual.Build -eq $taskExpected.Build
}

try {
  New-Item -ItemType Directory -Path $taskRoot, $taskAppDataRoot, $taskDecoyRoot | Out-Null
  $env:APPDATA = $taskAppDataRoot
  $env:DSH_HOME = $taskDshHome

  $taskBaseInstall = Start-TaskInstaller $taskBaseInstaller
  $taskResult.baseInstallExitCode = $taskBaseInstall.exitCode
  $taskResult.baseInstallElapsedMs = $taskBaseInstall.elapsedMs
  if ($taskBaseInstall.exitCode -ne 0 -or -not (Test-Path -LiteralPath $taskAppPath)) {
    throw "Base installer failed with exit code $($taskBaseInstall.exitCode)."
  }
  $taskResult.baseInstalledVersion = (Get-Item -LiteralPath $taskAppPath).VersionInfo.ProductVersion
  if (-not (Test-TaskVersionEquals $taskResult.baseInstalledVersion $taskBaseExpectedVersion)) {
    throw "Expected base version $taskBaseExpectedVersion but installed $($taskResult.baseInstalledVersion)."
  }

  Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32\ping.exe') -Destination $taskHelperPath
  Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32\ping.exe') -Destination $taskDecoyPath
  $taskHelperProcess = Start-Process -FilePath $taskHelperPath -ArgumentList '-t', '127.0.0.1' -PassThru -WindowStyle Hidden
  $taskDecoyProcess = Start-Process -FilePath $taskDecoyPath -ArgumentList '-t', '127.0.0.1' -PassThru -WindowStyle Hidden

  $taskBaseProcess = Start-TaskDesktop
  Wait-TaskCondition { Test-Path -LiteralPath $taskActiveRunMarker } 'base active run marker'
  $taskUpgrade = Start-TaskInstaller $taskCandidateInstaller
  $taskResult.upgradeExitCode = $taskUpgrade.exitCode
  $taskResult.upgradeElapsedMs = $taskUpgrade.elapsedMs
  if ($taskUpgrade.exitCode -ne 0) { throw "Candidate upgrade failed with exit code $($taskUpgrade.exitCode)." }
  Wait-TaskCondition {
    $taskBaseProcess.Refresh()
    $taskBaseProcess.HasExited
  } 'base app exit after upgrade'
  $taskResult.baseProcessStopped = $true
  $taskHelperProcess.Refresh()
  $taskDecoyProcess.Refresh()
  $taskResult.helperSurvivedUpgrade = -not $taskHelperProcess.HasExited
  $taskResult.sameNameDecoySurvivedUpgrade = -not $taskDecoyProcess.HasExited
  $taskResult.upgradedVersion = (Get-Item -LiteralPath $taskAppPath).VersionInfo.ProductVersion

  $taskCandidateProcess = Start-TaskDesktop
  Wait-TaskCondition { Test-Path -LiteralPath $taskActiveRunMarker } 'candidate active run marker'
  $taskOverwrite = Start-TaskInstaller $taskCandidateInstaller
  $taskResult.overwriteExitCode = $taskOverwrite.exitCode
  $taskResult.overwriteElapsedMs = $taskOverwrite.elapsedMs
  if ($taskOverwrite.exitCode -ne 0) { throw "Candidate overwrite failed with exit code $($taskOverwrite.exitCode)." }
  Wait-TaskCondition {
    $taskCandidateProcess.Refresh()
    $taskCandidateProcess.HasExited
  } 'candidate app exit after orderly handoff'
  $taskResult.candidateProcessStopped = $true
  Wait-TaskCondition { -not (Test-Path -LiteralPath $taskActiveRunMarker) } 'active run marker cleanup'
  $taskResult.activeRunMarkerCleared = $true
  $taskHelperProcess.Refresh()
  $taskDecoyProcess.Refresh()
  $taskResult.helperSurvivedOverwrite = -not $taskHelperProcess.HasExited
  $taskResult.sameNameDecoySurvivedOverwrite = -not $taskDecoyProcess.HasExited
  $taskResult.overwriteVersion = (Get-Item -LiteralPath $taskAppPath).VersionInfo.ProductVersion
} catch {
  $taskResult.error = $_.Exception.Message
} finally {
  foreach ($taskProcess in @($taskBaseProcess, $taskCandidateProcess, $taskHelperProcess, $taskDecoyProcess)) {
    if ($null -ne $taskProcess) {
      $taskProcess.Refresh()
      if (-not $taskProcess.HasExited) {
        Stop-Process -Id $taskProcess.Id -Force -ErrorAction SilentlyContinue
        $taskProcess.WaitForExit()
      }
    }
  }

  if (Test-Path -LiteralPath $taskUninstallerPath) {
    $taskUninstaller = Start-Process -FilePath $taskUninstallerPath -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
    $taskResult.uninstallExitCode = $taskUninstaller.ExitCode
  }

  $env:APPDATA = $taskOriginalAppData
  $env:DSH_HOME = $taskOriginalDshHome
  Start-Sleep -Milliseconds 500
  $taskResult.installRootRemoved = -not (Test-Path -LiteralPath $taskInstallRoot)
  $taskRemainingInstalls = @(Get-ItemProperty $taskUninstallRoots -ErrorAction SilentlyContinue | Where-Object {
    $_.DisplayName -match '^DSH Desktop'
  })
  $taskResult.uninstallEntryRemoved = $taskRemainingInstalls.Count -eq 0
  $taskRemainingProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($taskRoot, [System.StringComparison]::OrdinalIgnoreCase)
  })
  $taskResult.testProcessesRemaining = $taskRemainingProcesses.Count

  $taskResolvedRoot = [System.IO.Path]::GetFullPath($taskRoot)
  if (-not $taskResolvedRoot.StartsWith($taskTempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      -not ([System.IO.Path]::GetFileName($taskResolvedRoot)).StartsWith('dsh-installer-upgrade-', [System.StringComparison]::Ordinal)) {
    throw "Refusing to remove unexpected smoke path: $taskResolvedRoot"
  }
  if ($taskResult.testProcessesRemaining -eq 0 -and (Test-Path -LiteralPath $taskResolvedRoot)) {
    Remove-Item -LiteralPath $taskResolvedRoot -Recurse -Force
  }
  $taskResult.testRootRemoved = -not (Test-Path -LiteralPath $taskResolvedRoot)
}

$taskResult.success = (
  $null -eq $taskResult.error -and
  $taskResult.baseInstallExitCode -eq 0 -and
  (Test-TaskVersionEquals $taskResult.baseInstalledVersion $taskBaseExpectedVersion) -and
  $taskResult.upgradeExitCode -eq 0 -and
  (Test-TaskVersionEquals $taskResult.upgradedVersion $taskCandidateExpectedVersion) -and
  $taskResult.baseProcessStopped -and
  $taskResult.helperSurvivedUpgrade -and
  $taskResult.sameNameDecoySurvivedUpgrade -and
  $taskResult.overwriteExitCode -eq 0 -and
  (Test-TaskVersionEquals $taskResult.overwriteVersion $taskCandidateExpectedVersion) -and
  $taskResult.candidateProcessStopped -and
  $taskResult.activeRunMarkerCleared -and
  $taskResult.helperSurvivedOverwrite -and
  $taskResult.sameNameDecoySurvivedOverwrite -and
  $taskResult.uninstallExitCode -eq 0 -and
  $taskResult.installRootRemoved -and
  $taskResult.uninstallEntryRemoved -and
  $taskResult.testProcessesRemaining -eq 0 -and
  $taskResult.testRootRemoved
)

$taskResult | ConvertTo-Json
if (-not $taskResult.success) { exit 1 }

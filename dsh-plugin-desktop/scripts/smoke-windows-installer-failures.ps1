param(
  [Parameter(Mandatory = $true)]
  [string]$BaseInstaller,

  [Parameter(Mandatory = $true)]
  [string]$CandidateInstaller,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1000, 900000)]
  [int]$CandidateBaselineMs,

  [Parameter(Mandatory = $true)]
  [string]$IsolationEvidence,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows installer failure smoke requires Windows.' }
if ($IsolationEvidence.Trim().Length -eq 0) { throw 'IsolationEvidence must identify the clean disposable VM.' }

$taskBaseInstaller = (Resolve-Path -LiteralPath $BaseInstaller).Path
$taskCandidateInstaller = (Resolve-Path -LiteralPath $CandidateInstaller).Path
$taskScriptRoot = Split-Path -Parent $PSCommandPath
$taskTreeTool = Join-Path $taskScriptRoot 'installer-tree-manifest.mjs'
$taskNode = (Get-Command node).Source
$taskUninstallRoots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$taskExistingProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'DSH Desktop.exe' })
$taskExistingInstalls = @(Get-ItemProperty $taskUninstallRoots -ErrorAction SilentlyContinue | Where-Object {
  $_.DisplayName -match '^DSH Desktop'
})
if ($taskExistingProcesses.Count -gt 0 -or $taskExistingInstalls.Count -gt 0) {
  throw 'Refusing failure injection outside a clean disposable VM.'
}

$taskTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$taskRoot = Join-Path $taskTempRoot ('dsh-installer-failures-' + [guid]::NewGuid().ToString('N'))
$taskInstallRoot = Join-Path $taskRoot 'app'
$taskAppDataRoot = Join-Path $taskRoot 'appdata'
$taskDshHome = Join-Path $taskRoot 'dsh-home'
$taskBaseManifest = Join-Path $taskRoot 'base-tree.json'
$taskCandidateManifest = Join-Path $taskRoot 'candidate-tree.json'
$taskUninstaller = Join-Path $taskInstallRoot 'Uninstall DSH Desktop.exe'
$taskApplication = Join-Path $taskInstallRoot 'DSH Desktop.exe'
$taskOriginalAppData = $env:APPDATA
$taskOriginalDshHome = $env:DSH_HOME
$taskResults = [Collections.Generic.List[object]]::new()

function Invoke-TaskInstaller([string]$taskInstaller, [bool]$taskWait = $true) {
  return Start-Process -FilePath $taskInstaller -ArgumentList @(
    '/S'
    '/currentuser'
    "/D=$taskInstallRoot"
  ) -PassThru -Wait:$taskWait -WindowStyle Hidden
}

function Remove-TaskInstallation {
  if (Test-Path -LiteralPath $taskUninstaller) {
    $taskProcess = Start-Process -FilePath $taskUninstaller -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
    if ($taskProcess.ExitCode -ne 0) { throw "Uninstaller exited with $($taskProcess.ExitCode)." }
  }
}

function New-TaskManifest([string]$taskManifest) {
  & $taskNode $taskTreeTool create $taskInstallRoot $taskManifest | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create tree manifest $taskManifest." }
}

function Get-TaskTreeState {
  if (-not (Test-Path -LiteralPath $taskInstallRoot)) { return 'absent' }
  & $taskNode $taskTreeTool verify $taskInstallRoot $taskBaseManifest *> $null
  if ($LASTEXITCODE -eq 0) { return 'base' }
  & $taskNode $taskTreeTool verify $taskInstallRoot $taskCandidateManifest *> $null
  if ($LASTEXITCODE -eq 0) { return 'candidate' }
  return 'mixed'
}

function Stop-TaskProcessTree([int]$taskParentId) {
  $taskChildren = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $taskParentId })
  foreach ($taskChild in $taskChildren) { Stop-TaskProcessTree ([int]$taskChild.ProcessId) }
  Stop-Process -Id $taskParentId -Force -ErrorAction SilentlyContinue
}

try {
  New-Item -ItemType Directory -Path $taskRoot, $taskAppDataRoot, $taskDshHome | Out-Null
  $env:APPDATA = $taskAppDataRoot
  $env:DSH_HOME = $taskDshHome

  $taskBase = Invoke-TaskInstaller $taskBaseInstaller
  if ($taskBase.ExitCode -ne 0) { throw "Base installer exited with $($taskBase.ExitCode)." }
  New-TaskManifest $taskBaseManifest
  Remove-TaskInstallation

  $taskCandidate = Invoke-TaskInstaller $taskCandidateInstaller
  if ($taskCandidate.ExitCode -ne 0) { throw "Candidate installer exited with $($taskCandidate.ExitCode)." }
  New-TaskManifest $taskCandidateManifest
  Remove-TaskInstallation

  foreach ($taskPercent in @(25, 50, 75)) {
    $taskRestore = Invoke-TaskInstaller $taskBaseInstaller
    if ($taskRestore.ExitCode -ne 0) { throw "Base restore exited with $($taskRestore.ExitCode)." }
    $taskProcess = Invoke-TaskInstaller $taskCandidateInstaller $false
    Start-Sleep -Milliseconds ([Math]::Max(250, [Math]::Round($CandidateBaselineMs * $taskPercent / 100)))
    Stop-TaskProcessTree $taskProcess.Id
    $taskProcess.WaitForExit()
    Start-Sleep -Milliseconds 750
    $taskState = Get-TaskTreeState
    $taskResults.Add([ordered]@{
      scenario = "terminate-$taskPercent-percent"
      exitCode = $taskProcess.ExitCode
      treeState = $taskState
      success = $taskState -eq 'base' -or $taskState -eq 'candidate'
    })
    Remove-TaskInstallation
  }

  $taskRestore = Invoke-TaskInstaller $taskBaseInstaller
  if ($taskRestore.ExitCode -ne 0) { throw "Base restore exited with $($taskRestore.ExitCode)." }
  $taskLock = [IO.File]::Open($taskApplication, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
  try {
    $taskLockedUpgrade = Invoke-TaskInstaller $taskCandidateInstaller
  } finally {
    $taskLock.Dispose()
  }
  $taskLockedState = Get-TaskTreeState
  $taskResults.Add([ordered]@{
    scenario = 'locked-main-executable'
    exitCode = $taskLockedUpgrade.ExitCode
    treeState = $taskLockedState
    success = $taskLockedState -eq 'base' -or $taskLockedState -eq 'candidate'
  })
  Remove-TaskInstallation
} finally {
  $env:APPDATA = $taskOriginalAppData
  $env:DSH_HOME = $taskOriginalDshHome
  $taskResolvedRoot = [IO.Path]::GetFullPath($taskRoot)
  $taskSafeName = [IO.Path]::GetFileName($taskResolvedRoot).StartsWith('dsh-installer-failures-', [StringComparison]::Ordinal)
  $taskInsideTemp = $taskResolvedRoot.StartsWith($taskTempRoot, [StringComparison]::OrdinalIgnoreCase)
  if (-not $taskSafeName -or -not $taskInsideTemp) { throw "Refusing to remove unexpected failure-smoke path: $taskResolvedRoot" }
  $taskDocument = [ordered]@{
    schemaVersion = 1
    baseArtifactSha256 = (Get-FileHash -LiteralPath $taskBaseInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
    candidateArtifactSha256 = (Get-FileHash -LiteralPath $taskCandidateInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
    candidateBaselineMs = $CandidateBaselineMs
    isolationEvidence = $IsolationEvidence
    results = $taskResults
    success = $taskResults.Count -eq 4 -and @($taskResults | Where-Object { -not $_.success }).Count -eq 0
  }
  $taskOutput = [IO.Path]::GetFullPath($OutputPath)
  $taskOutputParent = [IO.Path]::GetDirectoryName($taskOutput)
  if (-not [string]::IsNullOrEmpty($taskOutputParent)) { New-Item -ItemType Directory -Path $taskOutputParent -Force | Out-Null }
  [IO.File]::WriteAllText(
    $taskOutput,
    ($taskDocument | ConvertTo-Json -Depth 6) + [Environment]::NewLine,
    [Text.UTF8Encoding]::new($false)
  )
  if (Test-Path -LiteralPath $taskResolvedRoot) { Remove-Item -LiteralPath $taskResolvedRoot -Recurse -Force }
}

$taskDocument | ConvertTo-Json -Depth 6
if (-not $taskDocument.success) { exit 1 }

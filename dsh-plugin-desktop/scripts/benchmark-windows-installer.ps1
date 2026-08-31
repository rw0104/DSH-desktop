param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('fresh', 'upgrade', 'overwrite', 'uninstall')]
  [string]$Scenario,

  [Parameter(Mandatory = $true)]
  [string]$CandidateInstaller,

  [string]$BaseInstaller,

  [Parameter(Mandatory = $true)]
  [string]$IsolationEvidence,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [switch]$SeedExistingExecutable,

  [ValidateRange(40, 220)]
  [int]$InstallPathLength = 80,

  [ValidateRange(5, 60)]
  [int]$InstallerTimeoutMinutes = 15
)

$ErrorActionPreference = 'Stop'

# A silent NSIS process must either finish or produce a bounded diagnostic.
# Without a watchdog, a hidden UAC/message-box path can hold a disposable
# runner forever and prevent the rest of the matrix from producing evidence.
$taskInstallerTimeoutMs = $InstallerTimeoutMinutes * 60 * 1000

if ($env:OS -ne 'Windows_NT') { throw 'Windows installer benchmarks require Windows.' }
if ($IsolationEvidence.Trim().Length -eq 0) { throw 'IsolationEvidence must identify the restored VM snapshot for this one run.' }
if (($Scenario -eq 'upgrade') -and [string]::IsNullOrWhiteSpace($BaseInstaller)) {
  throw 'Upgrade benchmarks require BaseInstaller.'
}

$taskCandidate = (Resolve-Path -LiteralPath $CandidateInstaller).Path
$taskBase = if ([string]::IsNullOrWhiteSpace($BaseInstaller)) { $null } else { (Resolve-Path -LiteralPath $BaseInstaller).Path }
$taskExistingProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'DSH Desktop.exe' })
$taskUninstallRoots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$taskExistingInstalls = @(Get-ItemProperty $taskUninstallRoots -ErrorAction SilentlyContinue | Where-Object {
  $_.DisplayName -match '^DSH Desktop'
})
if ($taskExistingProcesses.Count -gt 0 -or $taskExistingInstalls.Count -gt 0) {
  throw 'Refusing to benchmark outside a clean restored image: an existing DSH Desktop process or installation is present.'
}

$taskTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$taskRunRoot = Join-Path $taskTempRoot ('dsh-installer-benchmark-' + [guid]::NewGuid().ToString('N'))
$taskPrefixLength = $taskRunRoot.Length + 1
$taskPaddingLength = [Math]::Max(1, $InstallPathLength - $taskPrefixLength)
$taskInstallRoot = Join-Path $taskRunRoot ('a' * $taskPaddingLength)
$taskAppPath = Join-Path $taskInstallRoot 'DSH Desktop.exe'
$taskUninstallerPath = Join-Path $taskInstallRoot 'Uninstall DSH Desktop.exe'
$taskDiskModel = Get-CimInstance Win32_DiskDrive | Select-Object -First 1 -ExpandProperty Model
if ([string]::IsNullOrWhiteSpace([string]$taskDiskModel)) { $taskDiskModel = 'unknown' }
$taskResult = [ordered]@{
  schemaVersion = 1
  artifactSha256 = (Get-FileHash -LiteralPath $taskCandidate -Algorithm SHA256).Hash.ToLowerInvariant()
  windowsBuild = [Environment]::OSVersion.Version.ToString()
  diskModel = [string]$taskDiskModel
  defenderEnabled = $false
  defenderSignatures = 'unavailable'
  scenario = $Scenario
  installPathLength = $taskInstallRoot.Length
  elapsedMs = 0
  exitCode = 1
  fileCount = 0
  installedBytes = 0
  productVersion = 'unavailable'
  treeDigest = ('0' * 64)
  cleanupSucceeded = $false
  isolationEvidence = $IsolationEvidence
  installerTimeoutMinutes = $InstallerTimeoutMinutes
}

function Stop-TaskProcessTree([int]$taskParentId) {
  $taskChildren = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $taskParentId })
  foreach ($taskChild in $taskChildren) { Stop-TaskProcessTree ([int]$taskChild.ProcessId) }
  Stop-Process -Id $taskParentId -Force -ErrorAction SilentlyContinue
}

function Get-TaskInstallerProgress([Diagnostics.Process]$taskProcess) {
  $taskFiles = if (Test-Path -LiteralPath $taskInstallRoot) {
    @(Get-ChildItem -LiteralPath $taskInstallRoot -Recurse -File -Force -ErrorAction SilentlyContinue)
  } else {
    @()
  }
  $taskMeasuredBytes = ($taskFiles | Measure-Object -Property Length -Sum).Sum
  $taskBytes = if ($null -eq $taskMeasuredBytes) { 0 } else { [int64]$taskMeasuredBytes }
  $taskProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessId -eq $taskProcess.Id -or $_.ParentProcessId -eq $taskProcess.Id
  })
  $taskProcessNames = ($taskProcesses | Select-Object -ExpandProperty Name -Unique) -join ','
  return "files=$($taskFiles.Count) bytes=$taskBytes processNames=$taskProcessNames"
}

function Wait-TaskInstaller([Diagnostics.Process]$taskProcess, [string]$taskLabel) {
  $taskWait = [Diagnostics.Stopwatch]::StartNew()
  $taskNextProgressMs = 30 * 1000
  while (-not $taskProcess.WaitForExit(1000)) {
    if ($taskWait.ElapsedMilliseconds -ge $taskNextProgressMs) {
      $taskProgress = Get-TaskInstallerProgress $taskProcess
      Write-Output "benchmark progress: label=$taskLabel elapsedMs=$($taskWait.ElapsedMilliseconds) $taskProgress"
      $taskNextProgressMs += 30 * 1000
    }
    if ($taskWait.ElapsedMilliseconds -ge $taskInstallerTimeoutMs) {
      $taskProgress = Get-TaskInstallerProgress $taskProcess
      Stop-TaskProcessTree $taskProcess.Id
      $taskProcess.WaitForExit(10000)
      throw "$taskLabel timed out after $taskInstallerTimeoutMs ms ($InstallerTimeoutMinutes minutes); $taskProgress; the installer process tree was terminated."
    }
  }
  $taskWait.Stop()
}

function Invoke-TaskInstaller([string]$taskInstaller) {
  $taskProcess = Start-Process -FilePath $taskInstaller -ArgumentList @(
    '/S'
    '/currentuser'
    "/D=$taskInstallRoot"
  ) -PassThru -WindowStyle Hidden
  Wait-TaskInstaller $taskProcess 'installer'
  if ($taskProcess.ExitCode -ne 0) { throw "Installer exited with $($taskProcess.ExitCode)." }
}

function Get-TaskTreeDigest([string]$taskRoot) {
  $taskAggregate = [System.Security.Cryptography.IncrementalHash]::CreateHash(
    [System.Security.Cryptography.HashAlgorithmName]::SHA256
  )
  try {
    $taskFiles = @(Get-ChildItem -LiteralPath $taskRoot -Recurse -File -Force | Sort-Object FullName)
    foreach ($taskFile in $taskFiles) {
      $taskRelative = [System.IO.Path]::GetRelativePath($taskRoot, $taskFile.FullName).Replace('\', '/')
      $taskFileHash = (Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      $taskLine = [Text.Encoding]::UTF8.GetBytes("$taskRelative`0$($taskFile.Length)`0$taskFileHash`n")
      $taskAggregate.AppendData($taskLine)
    }
    return [Convert]::ToHexString($taskAggregate.GetHashAndReset()).ToLowerInvariant()
  } finally {
    $taskAggregate.Dispose()
  }
}

try {
  $taskDefender = Get-MpComputerStatus -ErrorAction SilentlyContinue
  if ($null -ne $taskDefender) {
    $taskResult.defenderEnabled = [bool]$taskDefender.RealTimeProtectionEnabled
    $taskResult.defenderSignatures = [string]$taskDefender.AntivirusSignatureVersion
  }
  New-Item -ItemType Directory -Path $taskRunRoot | Out-Null
  if ($SeedExistingExecutable) {
    # v2.0.15 predates the fresh-install guard and probes WMI before its first
    # file exists. A non-running placeholder selects that released installer’s
    # existing-install path without creating a process or changing the result.
    New-Item -ItemType File -Path $taskAppPath -Force | Out-Null
  }
  if ($Scenario -eq 'upgrade') {
    Invoke-TaskInstaller $taskBase
  } elseif ($Scenario -eq 'overwrite' -or $Scenario -eq 'uninstall') {
    Invoke-TaskInstaller $taskCandidate
  }

  $taskStopwatch = [Diagnostics.Stopwatch]::StartNew()
  if ($Scenario -eq 'uninstall') {
    $taskProcess = Start-Process -FilePath $taskUninstallerPath -ArgumentList @('/currentuser', '/S') -Verb RunAs -PassThru -WindowStyle Hidden
  } else {
    $taskProcess = Start-Process -FilePath $taskCandidate -ArgumentList @(
      '/S'
      '/currentuser'
      "/D=$taskInstallRoot"
    ) -PassThru -WindowStyle Hidden
  }
  Wait-TaskInstaller $taskProcess 'timed operation'
  $taskStopwatch.Stop()
  $taskResult.elapsedMs = [int64]$taskStopwatch.ElapsedMilliseconds
  $taskResult.exitCode = [int]$taskProcess.ExitCode
  if ($taskProcess.ExitCode -ne 0) { throw "Timed operation exited with $($taskProcess.ExitCode)." }

  if (Test-Path -LiteralPath $taskInstallRoot) {
    $taskFiles = @(Get-ChildItem -LiteralPath $taskInstallRoot -Recurse -File -Force)
    $taskResult.fileCount = $taskFiles.Count
    $taskMeasuredBytes = ($taskFiles | Measure-Object Length -Sum).Sum
    $taskResult.installedBytes = if ($null -eq $taskMeasuredBytes) { 0 } else { [int64]$taskMeasuredBytes }
    $taskResult.treeDigest = Get-TaskTreeDigest $taskInstallRoot
    if (Test-Path -LiteralPath $taskAppPath) {
      $taskResult.productVersion = [string](Get-Item -LiteralPath $taskAppPath).VersionInfo.ProductVersion
    }
  } else {
    $taskResult.productVersion = [string](Get-Item -LiteralPath $taskCandidate).VersionInfo.ProductVersion
  }
} finally {
  if (Test-Path -LiteralPath $taskUninstallerPath) {
    $taskCleanupProcess = Start-Process -FilePath $taskUninstallerPath -ArgumentList @('/currentuser', '/S') -Verb RunAs -PassThru -WindowStyle Hidden
    try { Wait-TaskInstaller $taskCleanupProcess 'cleanup uninstaller' } catch { }
  }
  $taskResolvedRoot = [System.IO.Path]::GetFullPath($taskRunRoot)
  $taskSafeName = [System.IO.Path]::GetFileName($taskResolvedRoot).StartsWith('dsh-installer-benchmark-', [StringComparison]::Ordinal)
  $taskInsideTemp = $taskResolvedRoot.StartsWith($taskTempRoot, [StringComparison]::OrdinalIgnoreCase)
  if (-not $taskSafeName -or -not $taskInsideTemp) { throw "Refusing to remove unexpected benchmark path: $taskResolvedRoot" }
  if (Test-Path -LiteralPath $taskResolvedRoot) { Remove-Item -LiteralPath $taskResolvedRoot -Recurse -Force }
  $taskRemainingInstalls = @(Get-ItemProperty $taskUninstallRoots -ErrorAction SilentlyContinue | Where-Object {
    $_.DisplayName -match '^DSH Desktop'
  })
  $taskResult.cleanupSucceeded = -not (Test-Path -LiteralPath $taskResolvedRoot) -and $taskRemainingInstalls.Count -eq 0
  $taskOutput = [System.IO.Path]::GetFullPath($OutputPath)
  $taskOutputParent = [System.IO.Path]::GetDirectoryName($taskOutput)
  if (-not [string]::IsNullOrEmpty($taskOutputParent)) { New-Item -ItemType Directory -Path $taskOutputParent -Force | Out-Null }
  $taskJson = $taskResult | ConvertTo-Json
  [IO.File]::WriteAllText(
    $taskOutput,
    $taskJson + [Environment]::NewLine,
    [Text.UTF8Encoding]::new($false)
  )
}

$taskResult | ConvertTo-Json
if ($taskResult.exitCode -ne 0 -or -not $taskResult.cleanupSucceeded) { exit 1 }

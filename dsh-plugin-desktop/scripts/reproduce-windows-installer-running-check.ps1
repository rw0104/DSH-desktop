param()

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'This reproduction requires Windows.'
}

$taskTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$taskRoot = Join-Path $taskTempRoot ("dsh-installer-process-scope-" + [guid]::NewGuid().ToString('N'))
$taskInstallRoot = Join-Path $taskRoot 'app'
$taskDecoyRoot = Join-Path $taskRoot 'decoy'
$taskExpectedApp = Join-Path $taskInstallRoot 'DSH Desktop.exe'
$taskHelperPath = Join-Path $taskInstallRoot 'DSH Helper.exe'
$taskDecoyPath = Join-Path $taskDecoyRoot 'DSH Desktop.exe'
$taskHelper = $null
$taskDecoy = $null

try {
  New-Item -ItemType Directory -Path $taskInstallRoot, $taskDecoyRoot | Out-Null
  Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32\ping.exe') -Destination $taskHelperPath
  Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32\ping.exe') -Destination $taskDecoyPath
  $taskHelper = Start-Process -FilePath $taskHelperPath -ArgumentList '-t', '127.0.0.1' -PassThru -WindowStyle Hidden
  $taskDecoy = Start-Process -FilePath $taskDecoyPath -ArgumentList '-t', '127.0.0.1' -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 500

  $taskProcesses = @(Get-CimInstance Win32_Process)
  $taskDirectoryMatches = @($taskProcesses | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith(
      $taskInstallRoot,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  })
  $taskNameMatches = @($taskProcesses | Where-Object {
    $_.ExecutablePath -and [System.IO.Path]::GetFileName($_.ExecutablePath) -ieq 'DSH Desktop.exe'
  })
  $taskExactMatches = @($taskProcesses | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.Equals(
      $taskExpectedApp,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  })

  $taskResult = [ordered]@{
    scenario = 'installer process matching is scoped to the exact installed application path'
    installRoot = $taskInstallRoot
    expectedApp = $taskExpectedApp
    helperPid = $taskHelper.Id
    sameNameDecoyPid = $taskDecoy.Id
    oldDirectoryPredicateMatchedHelper = $taskDirectoryMatches.ProcessId -contains $taskHelper.Id
    globalNamePredicateMatchedDecoy = $taskNameMatches.ProcessId -contains $taskDecoy.Id
    exactPathPredicateMatchedHelper = $taskExactMatches.ProcessId -contains $taskHelper.Id
    exactPathPredicateMatchedDecoy = $taskExactMatches.ProcessId -contains $taskDecoy.Id
  }
  $taskResult['reproduced'] = (
    $taskResult.oldDirectoryPredicateMatchedHelper -and
    $taskResult.globalNamePredicateMatchedDecoy -and
    -not $taskResult.exactPathPredicateMatchedHelper -and
    -not $taskResult.exactPathPredicateMatchedDecoy
  )
  $taskResult | ConvertTo-Json
  if (-not $taskResult.reproduced) { exit 1 }
} finally {
  foreach ($taskProcess in @($taskHelper, $taskDecoy)) {
    if ($null -ne $taskProcess -and -not $taskProcess.HasExited) {
      Stop-Process -Id $taskProcess.Id -Force -ErrorAction SilentlyContinue
      $taskProcess.WaitForExit()
    }
  }
  $taskResolvedRoot = [System.IO.Path]::GetFullPath($taskRoot)
  if (-not $taskResolvedRoot.StartsWith($taskTempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      -not ([System.IO.Path]::GetFileName($taskResolvedRoot)).StartsWith('dsh-installer-process-scope-', [System.StringComparison]::Ordinal)) {
    throw "Refusing to remove unexpected reproduction path: $taskResolvedRoot"
  }
  if (Test-Path -LiteralPath $taskResolvedRoot) {
    Remove-Item -LiteralPath $taskResolvedRoot -Recurse -Force
  }
}

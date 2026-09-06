#requires -Version 7.0
<#
Preview by default. -Apply removes only the listed generated paths.
Use -AllArtifacts to remove the newest installer too; otherwise retain one.
Legacy test directories are optional, age-bounded and never followed through links.
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$AllArtifacts,
  [switch]$IncludeLegacyTemp,
  [switch]$RemoveDiagnostics,
  [ValidateRange(1,720)][int]$MinimumAgeHours = 24
)
$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath.TrimEnd('\','/')
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
$targets = [Collections.Generic.List[object]]::new()

function Assert-ChildPath([string]$Path, [string]$Boundary) {
  $absolute = [IO.Path]::GetFullPath($Path)
  $prefix = $Boundary.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
  if (-not $absolute.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escaped cleanup boundary: $Path" }
  return $absolute
}
function Assert-UnlinkedAncestors([string]$Path, [string]$Boundary) {
  $current = [IO.Path]::GetDirectoryName($Path)
  while ($current -and $current.Length -ge $Boundary.Length) {
    $info = Get-Item -LiteralPath $current -Force
    if (($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Linked cleanup ancestor: $current" }
    if ($current.Equals($Boundary, [StringComparison]::OrdinalIgnoreCase)) { break }
    $current = [IO.Path]::GetDirectoryName($current)
  }
}
function Add-Target([string]$Path, [string]$Boundary, [string]$Reason) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $absolute = Assert-ChildPath $Path $Boundary
  Assert-UnlinkedAncestors $absolute $Boundary
  $info = Get-Item -LiteralPath $absolute -Force
  if (($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing linked cleanup root: $absolute" }
  if ($Boundary -eq $workspaceRoot) {
    $relative = [IO.Path]::GetRelativePath($workspaceRoot, $absolute).Replace('\','/')
    $tracked = @(git -C $workspaceRoot ls-files -- $relative)
    if ($LASTEXITCODE -ne 0 -or $tracked.Count) { throw "Refusing tracked/unverified cleanup path: $relative" }
  }
  $targets.Add([pscustomobject]@{path=$absolute;boundary=$Boundary;reason=$Reason})
}

$dist = Join-Path $workspaceRoot 'dsh-plugin-desktop/dist'
$retainedInstaller = $null
if (Test-Path -LiteralPath $dist) {
  Assert-UnlinkedAncestors (Join-Path $dist 'child') $workspaceRoot
  if ($AllArtifacts) { Add-Target $dist $workspaceRoot 'all local packaging outputs' }
  else {
    $retainedInstaller = Get-ChildItem -LiteralPath $dist -File | Where-Object Name -match '^DSH-Desktop-.*\.(exe|zip|dmg)$' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    foreach ($item in Get-ChildItem -LiteralPath $dist -Force) {
      if ($retainedInstaller -and $item.FullName -eq $retainedInstaller.FullName) { continue }
      if ($retainedInstaller -and -not $item.PSIsContainer -and $item.Length -lt 65536 -and ($item.Name -in @('latest.yml','latest-mac.yml') -or $item.Name -match '^SHA256SUMS')) {
        $metadata = [IO.File]::ReadAllText($item.FullName)
        if ($metadata.Contains($retainedInstaller.Name)) { continue }
      }
      Add-Target $item.FullName $workspaceRoot 'superseded artifact or packaging staging'
    }
  }
}
foreach ($relative in @('docs/local/rejected-artifacts','.build','dsh-plugin-desktop/node_modules/.vite','dsh-plugin-desktop/node_modules/.vite-temp','dsh-community-market/node_modules/.vite','dsh-community-market/node_modules/.vite-temp')) {
  Add-Target (Join-Path $workspaceRoot $relative) $workspaceRoot 'regenerable local artifact/cache'
}
if ($RemoveDiagnostics) {
  Add-Target (Join-Path $workspaceRoot 'docs/local/system-performance-audit') $workspaceRoot 'user-requested removal of mixed personal diagnostics'
}
if ($IncludeLegacyTemp) {
  # Literal mkdtemp prefixes reviewed in this repository's tests/scripts.
  $legacyPrefixes = @('dsh-check-','dsh-cli-diagnostics-','dsh-updates-','dsh-log-','dsh-log-e2e-','dsh-log-link-','dsh-run-','dsh-desktop-profile-','dsh-desktop-plugins-','dsh-workbench-git-','dsh-dx-','dsh-dx-dump-','dsh-dx-dump-limit-','dsh-dx-dump-link-','dsh-dx-user-data-link-','dsh-dx-lifecycle-','dsh-dx-lifecycle-limit-','dsh-dx-lifecycle-file-link-','dsh-dx-lifecycle-parent-link-','dsh-dx-recovery-','dsh-dx-retain-','dsh-dx-limit-','dsh-dx-link-','dsh-dx-logs-link-')
  $pattern = '^(?:' + (($legacyPrefixes | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')[A-Za-z0-9]{6}$'
  $cutoff = (Get-Date).AddHours(-$MinimumAgeHours)
  foreach ($item in Get-ChildItem -LiteralPath $tempRoot -Directory -Force) {
    if ($item.Name -cmatch $pattern -and $item.LastWriteTime -lt $cutoff) { Add-Target $item.FullName $tempRoot 'expired project test directory' }
  }
}

# Preserve the exact reviewed plan in one overwritten local file, not a growing
# series of per-version snapshots. No file contents or application logs copied.
$planPath = Join-Path $workspaceRoot 'docs/local/cleanup-plan.json'
[pscustomobject]@{generatedAt=(Get-Date).ToString('o');apply=[bool]$Apply;retainedInstaller=$retainedInstaller.FullName;targets=@($targets)} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $planPath -Encoding utf8
Write-Output "Cleanup targets: $($targets.Count); plan: $planPath"
if ($retainedInstaller) { Write-Output "Retain: $($retainedInstaller.FullName)" }
if (-not $Apply) { Write-Output 'Preview only. No target removed.'; return }

# Reading command lines is necessary to avoid deleting a running test or an
# unpacked app. A failed process inventory aborts rather than guessing.
$running = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object ProcessId -ne $PID | ForEach-Object { $_.CommandLine; $_.ExecutablePath } | Where-Object { $_ })
function Remove-TreeWithoutFollowingLinks([string]$Path, [string]$Boundary) {
  $path = Assert-ChildPath $Path $Boundary
  $attributes = [IO.File]::GetAttributes($path)
  if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    # Non-recursive deletion unlinks the reparse point, never its destination.
    if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) { [IO.Directory]::Delete($path) }
    else { [IO.File]::Delete($path) }
    return
  }
  if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) {
    foreach ($child in [IO.Directory]::EnumerateFileSystemEntries($path)) { Remove-TreeWithoutFollowingLinks $child $Boundary }
    [IO.Directory]::Delete($path)
  } else {
    if (($attributes -band [IO.FileAttributes]::ReadOnly) -ne 0) { [IO.File]::SetAttributes($path, $attributes -band (-bnot [IO.FileAttributes]::ReadOnly)) }
    [IO.File]::Delete($path)
  }
}
$removed = 0
$skipped = 0
foreach ($target in $targets) {
  if ($running | Where-Object { $_.IndexOf($target.path, [StringComparison]::OrdinalIgnoreCase) -ge 0 }) { $skipped++; continue }
  $verified = Assert-ChildPath $target.path $target.boundary
  Assert-UnlinkedAncestors $verified $target.boundary
  Remove-TreeWithoutFollowingLinks $verified $target.boundary
  $removed++
  if ($removed % 250 -eq 0) { Write-Output "Removed $removed of $($targets.Count) targets" }
}
Write-Output "Removed $removed targets; skipped $skipped targets referenced by running processes."

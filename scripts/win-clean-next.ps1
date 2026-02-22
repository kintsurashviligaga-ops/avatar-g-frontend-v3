$ErrorActionPreference = 'Stop'

$root = Get-Location
$attempts = 12
$targets = @('.next', '.turbo', 'node_modules')

function Get-BackoffMs([int]$attempt) {
  $ms = [math]::Min(200 * [math]::Pow(2, $attempt - 1), 1800)
  return [int]$ms
}

function Stop-NodeProcesses {
  $ancestorPids = New-Object System.Collections.Generic.HashSet[int]
  $currentPid = $PID
  for ($i = 0; $i -lt 8; $i++) {
    if ($currentPid -le 0) { break }
    [void]$ancestorPids.Add([int]$currentPid)
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $currentPid" -ErrorAction SilentlyContinue
    if ($null -eq $proc) { break }
    $currentPid = [int]$proc.ParentProcessId
  }

  $node = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { -not $ancestorPids.Contains([int]$_.Id) }
  if ($null -eq $node) {
    Write-Host '[win-clean] No running node processes found.'
    return
  }

  Write-Host "[win-clean] Stopping $($node.Count) node process(es)..."
  $node | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

function Remove-WithRetries([string]$targetRelative, [int]$maxAttempts) {
  $target = Join-Path $root $targetRelative

  if (-not (Test-Path $target)) {
    Write-Host "[win-clean] $targetRelative not found"
    return $true
  }

  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
      Start-Sleep -Milliseconds 90
      if (-not (Test-Path $target)) {
        Write-Host "[win-clean] Removed $targetRelative (attempt $i)"
        return $true
      }
    } catch {
      if ($i -lt $maxAttempts) {
        Start-Sleep -Milliseconds (Get-BackoffMs $i)
      }
    }
  }

  Write-Warning "[win-clean] Failed to remove $targetRelative after $maxAttempts attempts"

  try {
    $target = Join-Path $root $targetRelative
    $staleName = "$targetRelative`_stale_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    $stalePath = Join-Path $root $staleName
    Rename-Item -LiteralPath $target -NewName $staleName -ErrorAction Stop
    Write-Warning "[win-clean] Applied fallback rename: $targetRelative -> $stalePath"
    return $true
  } catch {
    Write-Warning "[win-clean] Fallback rename failed for $targetRelative"
  }

  return $false
}

function Clear-NpmCache {
  Write-Host '[win-clean] Clearing npm cache (verify mode)...'
  npm cache verify | Out-Null
  npm cache clean --force | Out-Null
}

Write-Host "[win-clean] Repo: $root"

if ($root.Path -match 'OneDrive') {
  Write-Warning '[win-clean] Repo is inside OneDrive. This can increase lock/EPERM issues on Windows.'
}

Stop-NodeProcesses

$allRemoved = $true
foreach ($target in $targets) {
  $ok = Remove-WithRetries -targetRelative $target -maxAttempts $attempts
  if (-not $ok) { $allRemoved = $false }
}

try {
  Clear-NpmCache
  Write-Host '[win-clean] npm cache cleared.'
} catch {
  Write-Warning '[win-clean] npm cache clear failed (non-fatal).'
}

if (-not $allRemoved) {
  Write-Error '[win-clean] Cleanup incomplete. Close VS Code and terminal sessions, then retry.'
  exit 1
}

Write-Host '[win-clean] Cleanup completed successfully.'
exit 0

$ErrorActionPreference = 'SilentlyContinue'

$root = Get-Location
$nextPath = Join-Path $root '.next'
$attempts = 10

function Get-BackoffMs([int]$attempt) {
  $ms = [math]::Min(200 * [math]::Pow(2, $attempt - 1), 1500)
  return [int]$ms
}

function Try-RemoveWithRetries([string]$target, [int]$maxAttempts) {
  if (-not (Test-Path $target)) {
    Write-Host "[win-clean-next] .next not found"
    return $true
  }

  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
      Start-Sleep -Milliseconds 75
      if (-not (Test-Path $target)) {
        Write-Host "[win-clean-next] Removed .next (attempt $i)"
        return $true
      }
    } catch {
      # retry
    }

    if ($i -lt $maxAttempts) {
      Start-Sleep -Milliseconds (Get-BackoffMs $i)
    }
  }

  return $false
}

Write-Host "[win-clean-next] Repo: $root"
$ok = Try-RemoveWithRetries -target $nextPath -maxAttempts $attempts

if ($ok) {
  Write-Host "[win-clean-next] Cleanup completed"
  exit 0
}

Write-Warning "[win-clean-next] .next appears locked after retries"
Write-Host ""
Write-Host "LOCK DIAGNOSTICS"
Write-Host "- Close VS Code windows for this repo"
Write-Host "- Close browser tabs hitting localhost"
Write-Host "- Stop node/next dev servers manually"
Write-Host ""

if ($root.Path -match 'OneDrive') {
  Write-Warning "Current path is inside OneDrive. This is a common lock source for .next on Windows."
}

Write-Host "Possible node processes (best-effort):"
Get-Process node | Select-Object Id, ProcessName, Path | Format-Table -AutoSize

Write-Host ""
Write-Host "Manual commands (not executed):"
Write-Host "  PowerShell inspect: Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path"
Write-Host "  PowerShell OPTIONAL kill: Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
Write-Host "  Cmd inspect: tasklist | findstr node"
Write-Host ""
Write-Host "Permanent fix: move repo outside OneDrive, e.g.: C:\dev\avatar-g or C:\projects\avatar-g"

exit 1

$ErrorActionPreference = 'Stop'

Write-Host '[win-reinstall] Starting Windows reinstall workflow...'

& powershell -ExecutionPolicy Bypass -File scripts/win-clean-next.ps1
if ($LASTEXITCODE -ne 0) {
  Write-Error '[win-reinstall] Cleanup failed.'
  exit $LASTEXITCODE
}

Write-Host '[win-reinstall] Installing dependencies with npm ci...'
npm ci
if ($LASTEXITCODE -ne 0) {
  Write-Error '[win-reinstall] npm ci failed.'
  exit $LASTEXITCODE
}

Write-Host '[win-reinstall] Build verification...'
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Error '[win-reinstall] build failed.'
  exit $LASTEXITCODE
}

Write-Host '[win-reinstall] Completed successfully.'

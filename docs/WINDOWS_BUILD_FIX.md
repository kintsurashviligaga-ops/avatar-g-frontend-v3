# Windows Build Fix for OneDrive `.next` Locks

## Why this happens
On Windows, when a Next.js repo is inside OneDrive, sync/indexing can temporarily lock files under `.next`.
During cleanup, `next build` or prebuild deletion may fail with errors like:
- `UNKNOWN: unknown error, rmdir ...\.next\types\...`
- `code: 'UNKNOWN', syscall: 'rmdir'`

This is a file-locking/environment issue, not TypeScript or app compile logic.

## What is implemented
- Resilient prebuild cleanup with retries and backoff: `scripts/clean-next.mjs`
- Best-effort fallback rename when `.next` cannot be deleted:
  - `.next` -> `.next_stale_<timestamp>`
- Windows lock diagnostics output (manual actions only, no auto-kill)
- Manual Windows helper script: `scripts/win-clean-next.ps1`
- Build-time warning when repo path is inside OneDrive

## Primary permanent fix (recommended)
Move the repository outside OneDrive.

Recommended paths:
- `C:\dev\avatar-g`
- `C:\projects\avatar-g`

### Suggested move steps
1. Close VS Code and terminal sessions using the repo.
2. Copy/move project folder from OneDrive to a non-OneDrive path.
3. Open the new folder in VS Code.
4. Reinstall dependencies:
   - `npm install`
5. Run validation:
   - `npm run clean`
   - `npm run build`

## Optional mitigation
Disable OneDrive sync for the project folder (if your org policy allows it).

## Commands
### Standard cleanup + build
```bash
npm run clean
npm run build
```

### If lock persists on Windows
```bash
npm run clean:win
```

Then retry:
```bash
npm run build
```

## Manual diagnostic commands (not auto-executed)
PowerShell inspect:
```powershell
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path
```

PowerShell OPTIONAL manual force-stop:
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

Cmd inspect:
```cmd
tasklist | findstr node
```

## Recommended folder layout
```text
C:\dev\avatar-g\
  avatar-g-frontend-v3\

# or

C:\projects\avatar-g\
  avatar-g-frontend-v3\
```

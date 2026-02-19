# Windows Build Reliability (OneDrive)

If this project is stored inside OneDrive (for example under `C:\Users\...\OneDrive\...`), Next.js builds can fail with errors like:

- `EINVAL: invalid argument, readlink ... .next\static\chunks\...`
- file-in-use errors while cleaning `.next`

## Why this happens

OneDrive can lock or virtualize files during sync. Next.js frequently deletes and recreates files in `.next`, and these file operations can conflict with OneDrive's sync/file-lock behavior on Windows.

## Recommended setup

Move the repo outside OneDrive to a local path such as:

- `C:\projects\avatar-g-frontend-v3`

Then run:

```bash
npm install
npm run build
```

## Project scripts added for safer cleanup

This repo uses cross-platform cleanup before build:

- `npm run clean` → `rimraf .next .turbo`
- `npm run build` automatically runs `prebuild` first

This improves reliability on Windows, but moving outside OneDrive is still the safest fix.

import path from 'node:path';

const cwd = process.cwd();
const normalized = cwd.toLowerCase();
const hasOneDrive = normalized.includes(`${path.sep}onedrive${path.sep}`) || normalized.includes('/onedrive/');

console.log(`[cwd-check] Current working directory: ${cwd}`);

if (hasOneDrive) {
  console.warn('[cwd-check] WARNING: Project is running from a OneDrive-managed path.');
  console.warn('[cwd-check] Use C:\\Projects\\avatar-g-frontend-v3 to avoid .next file lock/build issues.');
  process.exitCode = 1;
} else {
  console.log('[cwd-check] OK: Not running inside OneDrive path.');
}

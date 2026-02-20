let shown = false;

function warnIfOneDrivePath() {
  if (shown) return;

  const cwd = process.cwd();
  if (!/onedrive/i.test(cwd)) return;

  shown = true;
  console.warn('');
  console.warn('[windows-onedrive-warning] Detected project inside OneDrive:', cwd);
  console.warn('[windows-onedrive-warning] OneDrive can lock `.next` during cleanup and cause build failures on Windows.');
  console.warn('[windows-onedrive-warning] Recommended: move repo to C:\\dev\\avatar-g or C:\\projects\\avatar-g');
  console.warn('');
}

module.exports = { warnIfOneDrivePath };

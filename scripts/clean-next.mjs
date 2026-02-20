#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const includeAll = args.has('--all');
const root = process.cwd();
const isWindows = process.platform === 'win32';

const targets = ['.next', '.turbo'];
if (includeAll) {
  targets.push(path.join('node_modules', '.cache'));
}

const removalSummary = [];
let cleanupHadFailure = false;
let usedFallbackRename = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoffMs(attempt) {
  return Math.min(200 * Math.pow(2, attempt - 1), 1500);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeWithRetries(targetPath, attempts = 10) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 0 });
      const stillExists = await pathExists(targetPath);
      if (!stillExists) {
        return { ok: true, attempts: attempt };
      }
      lastError = new Error(`Path still exists after rm: ${targetPath}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await sleep(nextBackoffMs(attempt));
    }
  }

  return { ok: false, attempts, error: lastError };
}

function printLockDiagnosticsBlock() {
  const oneDriveInPath = /onedrive/i.test(root);

  console.warn('\n================ LOCK DIAGNOSTICS ================');
  if (oneDriveInPath) {
    console.warn('Detected OneDrive path in current repo location. This is a common cause of .next lock failures on Windows.');
  } else {
    console.warn('Windows file lock detected while cleaning build artifacts.');
  }
  console.warn('Likely lock holders: VS Code file watchers, browser tabs on localhost, or active node/next dev servers.');
  console.warn('Try closing VS Code windows for this repo, closing localhost tabs, and stopping running dev servers.');
  console.warn('');
  console.warn('Manual inspection command (PowerShell):');
  console.warn('  Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path');
  console.warn('Optional manual kill command (PowerShell):');
  console.warn('  Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force');
  console.warn('Manual inspection command (cmd):');
  console.warn('  tasklist | findstr node');
  console.warn('');
  console.warn('Primary permanent fix: move this repo out of OneDrive, e.g.:');
  console.warn('  C:\\dev\\avatar-g');
  console.warn('  C:\\projects\\avatar-g');
  console.warn('===============================================\n');
}

function printActionableFailureBlock() {
  console.warn('\n================ CLEANUP NOTICE ================');
  console.warn('Build cleanup hit a Windows file lock while removing `.next`.');
  console.warn('This is commonly caused by OneDrive sync and file watchers holding `.next` files open.');
  console.warn('What this script did: retried delete with backoff, then attempted fallback rename.');
  console.warn('What you should do next if locks persist:');
  console.warn('  1) Close VS Code windows for this repo');
  console.warn('  2) Close browser tabs using localhost for this app');
  console.warn('  3) Stop running node/next dev servers manually');
  console.warn('  4) Move the repo outside OneDrive (recommended permanent fix)');
  console.warn('===============================================\n');
}

async function tryFallbackRename(nextDirAbs) {
  const exists = await pathExists(nextDirAbs);
  if (!exists) {
    return { ok: true, skipped: true };
  }

  const staleName = `.next_stale_${Date.now()}`;
  const stalePath = path.join(root, staleName);

  try {
    await fs.rename(nextDirAbs, stalePath);
    return { ok: true, staleName };
  } catch (error) {
    return { ok: false, error };
  }
}

async function cleanTarget(targetRel) {
  const targetAbs = path.join(root, targetRel);
  const existsBefore = await pathExists(targetAbs);

  if (!existsBefore) {
    removalSummary.push({ target: targetRel, status: 'not-found' });
    return;
  }

  const result = await removeWithRetries(targetAbs, 10);
  if (result.ok) {
    removalSummary.push({ target: targetRel, status: 'removed', attempts: result.attempts });
    return;
  }

  cleanupHadFailure = true;

  if (targetRel === '.next') {
    printActionableFailureBlock();
    if (isWindows) {
      printLockDiagnosticsBlock();
    }

    const fallback = await tryFallbackRename(targetAbs);
    if (fallback.ok) {
      usedFallbackRename = !fallback.skipped;
      removalSummary.push({
        target: targetRel,
        status: fallback.skipped ? 'missing-after-failure' : 'renamed-fallback',
        staleName: fallback.staleName,
      });
      return;
    }

    removalSummary.push({
      target: targetRel,
      status: 'failed',
      error: String(result.error?.message || result.error || 'Unknown error'),
      fallbackError: String(fallback.error?.message || fallback.error || 'Unknown fallback error'),
    });
    return;
  }

  removalSummary.push({
    target: targetRel,
    status: 'failed',
    error: String(result.error?.message || result.error || 'Unknown error'),
  });
}

async function main() {
  console.log(`[clean-next] Starting cleanup in: ${root}`);
  console.log(`[clean-next] Targets: ${targets.join(', ')}`);

  for (const target of targets) {
    await cleanTarget(target);
  }

  console.log('\n[clean-next] Cleanup summary:');
  for (const item of removalSummary) {
    if (item.status === 'removed') {
      console.log(`  - ${item.target}: removed (attempt ${item.attempts})`);
    } else if (item.status === 'renamed-fallback') {
      console.log(`  - ${item.target}: fallback rename applied -> ${item.staleName}`);
    } else if (item.status === 'not-found') {
      console.log(`  - ${item.target}: not found`);
    } else if (item.status === 'missing-after-failure') {
      console.log(`  - ${item.target}: not found after retries`);
    } else {
      console.log(`  - ${item.target}: FAILED (${item.error})`);
      if (item.fallbackError) {
        console.log(`      fallback rename error: ${item.fallbackError}`);
      }
    }
  }

  console.log(`[clean-next] Fallback rename used: ${usedFallbackRename ? 'yes' : 'no'}`);

  const hardFailures = removalSummary.filter((item) => item.status === 'failed');
  if (hardFailures.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (cleanupHadFailure) {
    console.log('[clean-next] Cleanup completed with lock handling fallback. Continuing build flow.');
  } else {
    console.log('[clean-next] Cleanup completed successfully.');
  }
}

main().catch((error) => {
  console.error('[clean-next] Unexpected error:', error);
  process.exitCode = 1;
});

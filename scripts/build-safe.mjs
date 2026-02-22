#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const forceClean = args.has('--clean');

function runNodeScript(scriptRelativePath, scriptArgs = []) {
  const scriptPath = path.join(process.cwd(), scriptRelativePath);
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    env: process.env,
  });

  return result.status ?? 1;
}

function runNextBuild() {
  const result = spawnSync('npx', ['next', 'build'], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  return result.status ?? 1;
}

function cleanAll() {
  return runNodeScript(path.join('scripts', 'clean-next.mjs'), ['--all']);
}

function main() {
  if (forceClean) {
    const cleanStatus = cleanAll();
    if (cleanStatus !== 0) {
      process.exit(cleanStatus);
    }
  }

  let buildStatus = runNextBuild();
  if (buildStatus === 0) {
    process.exit(0);
  }

  console.warn('[build-safe] First build attempt failed. Retrying after full clean...');
  const cleanStatus = cleanAll();
  if (cleanStatus !== 0) {
    process.exit(cleanStatus);
  }

  buildStatus = runNextBuild();
  process.exit(buildStatus);
}

main();

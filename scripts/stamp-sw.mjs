#!/usr/bin/env node
/**
 * Build-time service-worker cache-buster. Stamps the DEPLOY'S commit SHA into public/sw.js's CACHE_NAME so the
 * shell cache name changes on EVERY deploy — the SW's `activate` handler then deletes every non-matching cache,
 * so returning visitors can never be served a stale bundle after a deploy. This replaces the old manual
 * `avatar-g-shell-vNNN` bump (which recurred as a stale-cache bug whenever the bump was forgotten).
 *
 * Runs inside `vercel-build` (before `next build`). Locally / off-Vercel it falls back to a dev tag, so a plain
 * `next build` never leaves an un-stamped placeholder. Idempotent + fail-soft: never throws the build.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SW = 'public/sw.js';
try {
  if (!existsSync(SW)) { console.warn('[stamp-sw] public/sw.js not found — skipping'); process.exit(0); }
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '').trim().slice(0, 7);
  const tag = sha || `dev-${Date.now().toString(36)}`;
  const src = readFileSync(SW, 'utf8');
  const next = src.replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = 'avatar-g-shell-${tag}';`);
  if (next === src && !/const CACHE_NAME = '[^']*';/.test(src)) {
    console.warn('[stamp-sw] CACHE_NAME line not found — sw.js left unchanged');
    process.exit(0);
  }
  writeFileSync(SW, next);
  console.log(`[stamp-sw] CACHE_NAME → avatar-g-shell-${tag}`);
} catch (e) {
  console.warn('[stamp-sw] non-fatal:', e && e.message ? e.message : e);
  process.exit(0); // never fail the build over the cache-buster
}

#!/usr/bin/env node
/**
 * One-command applier for the generation_jobs migration (#5 Reload Recovery).
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=abcd node scripts/apply-generation-jobs-migration.mjs
 *
 * (PROJECT_REF is the subdomain of your Supabase URL: https://<ref>.supabase.co)
 * If SUPABASE_PROJECT_REF is omitted it is parsed from NEXT_PUBLIC_SUPABASE_URL.
 *
 * Runs supabase/migrations/20260523_generation_jobs.sql against your project via
 * the Supabase Management API (pure fetch, no deps). This is the exact action a
 * human would do in the SQL editor — scripted so it is repeatable, idempotent
 * (CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS),
 * and CI-able. Activating this table flips reload-recovery from dormant
 * (fail-open no-op) to live.
 *
 * The script cannot run without YOUR access token — that secret exists only in
 * your Supabase account and is never stored in this repo.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '20260523_generation_jobs.sql');

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };

function fail(msg) {
  console.error(`\n${C.red}${C.bold}✗ ${msg}${C.reset}\n`);
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  fail(
    'SUPABASE_ACCESS_TOKEN is required.\n' +
    `  ${C.yellow}Get one:${C.reset} ${C.cyan}https://supabase.com/dashboard/account/tokens${C.reset}\n` +
    `  ${C.dim}then: SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=<ref> node scripts/apply-generation-jobs-migration.mjs${C.reset}`,
  );
}

let ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (m) ref = m[1];
}
if (!ref) {
  fail('SUPABASE_PROJECT_REF is required (or set NEXT_PUBLIC_SUPABASE_URL so it can be parsed).');
}

let sql;
try {
  sql = readFileSync(SQL_PATH, 'utf8');
} catch {
  fail(`could not read migration file at ${SQL_PATH}`);
}

console.log(`${C.bold}Applying generation_jobs migration${C.reset} ${C.dim}→ project ${ref}${C.reset}`);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
}).catch((e) => fail(`network error: ${e instanceof Error ? e.message : e}`));

if (!res.ok) {
  let detail = '';
  try { detail = JSON.stringify(await res.json()); } catch { detail = await res.text().catch(() => ''); }
  fail(`Supabase Management API ${res.status}\n  ${detail.slice(0, 400)}`);
}

console.log(`\n${C.green}${C.bold}✓ Migration applied${C.reset} — generation_jobs table + RLS + indexes are live.`);
console.log(`${C.dim}Verify in SQL editor:  SELECT tablename FROM pg_tables WHERE tablename = 'generation_jobs';${C.reset}`);
console.log(`${C.dim}Reload-recovery (#5) is now active for authenticated produce runs.${C.reset}\n`);
process.exit(0);

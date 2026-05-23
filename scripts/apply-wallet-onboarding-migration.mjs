#!/usr/bin/env node
/**
 * One-command applier for the wallet + onboarding migration.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=abcd node scripts/apply-wallet-onboarding-migration.mjs
 *
 * Applies supabase/migrations/20260523_wallet_and_onboarding.sql via the Supabase
 * Management API (idempotent: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE /
 * CREATE TABLE IF NOT EXISTS). Activates: server-side GEL top-up reconciliation,
 * the atomic free-counter, and avatar-name persistence. Token never leaves YOUR env.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '20260523_wallet_and_onboarding.sql');
const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };

function fail(m) { console.error(`\n${C.red}${C.bold}✗ ${m}${C.reset}\n`); process.exit(1); }

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) fail(`SUPABASE_ACCESS_TOKEN is required.\n  ${C.cyan}https://supabase.com/dashboard/account/tokens${C.reset}`);

let ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (m) ref = m[1];
}
if (!ref) fail('SUPABASE_PROJECT_REF is required (or set NEXT_PUBLIC_SUPABASE_URL).');

let sql;
try { sql = readFileSync(SQL_PATH, 'utf8'); } catch { fail(`could not read ${SQL_PATH}`); }

console.log(`${C.bold}Applying wallet + onboarding migration${C.reset} ${C.dim}→ project ${ref}${C.reset}`);
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

console.log(`\n${C.green}${C.bold}✓ Migration applied${C.reset} — credit_wallet_gel / consume_free_avatar_chat / set_avatar_name + profile columns live.`);
console.log(`${C.dim}Verify:  SELECT proname FROM pg_proc WHERE proname IN ('credit_wallet_gel','consume_free_avatar_chat','set_avatar_name');${C.reset}\n`);
process.exit(0);

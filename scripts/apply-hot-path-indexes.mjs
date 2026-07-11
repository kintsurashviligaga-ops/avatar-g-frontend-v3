#!/usr/bin/env node
/**
 * One-command applier for the hot-path read indexes (20260711_hot_path_indexes.sql).
 *
 *   node scripts/apply-hot-path-indexes.mjs
 *
 * Runs supabase/migrations/20260711_hot_path_indexes.sql against the project via the
 * Supabase Management API (pure fetch, no deps) — the exact action a human would do in
 * the SQL editor, scripted so it is repeatable and idempotent (CREATE INDEX IF NOT EXISTS).
 * Then VERIFIES the two indexes now exist in pg_indexes and reports the result.
 *
 * Auth: reads SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL from the shell env, falling
 * back to .env.local (never committed). The token is the owner's own Supabase account token.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SQL_PATH = join(ROOT, 'supabase', 'migrations', '20260711_hot_path_indexes.sql');
const INDEX_NAMES = ['notifications_user_unread_idx', 'user_creations_user_created_idx'];

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };
function fail(msg) { console.error(`\n${C.red}${C.bold}✗ ${msg}${C.reset}\n`); process.exit(1); }

// Minimal .env.local loader (no dep) — only fills vars that aren't already in the shell env.
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      if (process.env[key]) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[key] = val;
    }
  } catch { /* no .env.local — rely on shell env */ }
}
loadEnvLocal();

const token = process.env.SUPABASE_ACCESS_TOKEN;
const supaUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) { const m = supaUrl.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i); if (m) ref = m[1]; }
if (!ref && !supaUrl) fail('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_PROJECT_REF) is required.');

let sql;
try { sql = readFileSync(SQL_PATH, 'utf8'); } catch { fail(`could not read migration file at ${SQL_PATH}`); }

// Channel A — Supabase Management API (SUPABASE_ACCESS_TOKEN). Returns JSON rows on SELECT.
async function viaManagementApi(query) {
  if (!token || !ref) return { skipped: true, via: 'management_api', detail: 'no token/ref' };
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), cache: 'no-store',
    });
    const bodyText = await res.text().catch(() => '');
    let json = null; try { json = JSON.parse(bodyText); } catch { /* not json */ }
    return { ok: res.ok, via: 'management_api', status: res.status, json, bodyText };
  } catch (e) { return { ok: false, via: 'management_api', status: 0, bodyText: String(e?.message ?? e) }; }
}

// Channel B — exec_sql(query text) RPC via the service-role key (bypasses the Management token).
// Only exists if the RPC is installed on the project; returns no rows (DDL sink).
async function viaExecSqlRpc(query) {
  if (!supaUrl || !serviceKey) return { skipped: true, via: 'exec_sql_rpc', detail: 'no url/service-key' };
  try {
    const res = await fetch(`${supaUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), cache: 'no-store',
    });
    const bodyText = await res.text().catch(() => '');
    return { ok: res.ok, via: 'exec_sql_rpc', status: res.status, bodyText };
  } catch (e) { return { ok: false, via: 'exec_sql_rpc', status: 0, bodyText: String(e?.message ?? e) }; }
}

console.log(`${C.bold}Applying hot-path index migration${C.reset} ${C.dim}→ project ${ref ?? supaUrl}${C.reset}`);

// Try Management API first (verifiable), then the exec_sql RPC fallback.
const attempts = [];
let applied = null;
for (const runner of [viaManagementApi, viaExecSqlRpc]) {
  const r = await runner(sql);
  if (r.skipped) { attempts.push(`${r.via}: skipped (${r.detail})`); continue; }
  if (r.ok) { applied = r; break; }
  attempts.push(`${r.via}: ${r.status} ${(r.bodyText || '').slice(0, 200)}`);
}

if (!applied) {
  fail(`No DDL channel succeeded. Attempts:\n  - ${attempts.join('\n  - ')}\n\n` +
    `The file IS staged at supabase/migrations/20260711_hot_path_indexes.sql. Apply it via ONE of:\n` +
    `  (a) a VALID SUPABASE_ACCESS_TOKEN (Management API), or\n` +
    `  (b) the deployed admin gate once allow-listed:\n` +
    `      curl -X POST -H "x-admin-key: $MIGRATION_RUN_KEY" -H 'content-type: application/json' \\\n` +
    `           -d '{"file":"20260711_hot_path_indexes.sql"}' https://myavatar.ge/api/admin/run-migration`);
}

console.log(`${C.green}✓ Migration executed via ${applied.via}${C.reset}`);

// VERIFY via the Management API (the only channel that returns rows). If that channel is dead but
// exec_sql applied it, the CREATE INDEX IF NOT EXISTS success is itself the confirmation.
const check = await viaManagementApi(
  `SELECT indexname FROM pg_indexes WHERE indexname IN ('${INDEX_NAMES.join("','")}') ORDER BY indexname;`,
);
if (check.ok && Array.isArray(check.json)) {
  const found = check.json.map((r) => r.indexname);
  const missing = INDEX_NAMES.filter((n) => !found.includes(n));
  if (missing.length) fail(`applied via ${applied.via}, but NOT present after the run: ${missing.join(', ')} (present: ${found.join(', ') || 'none'})`);
  console.log(`\n${C.green}${C.bold}✓ Indexes secured & VERIFIED live:${C.reset} ${found.join(', ')}\n`);
} else {
  console.log(`\n${C.green}${C.bold}✓ Indexes applied via ${applied.via}${C.reset} ${C.dim}(idempotent CREATE INDEX IF NOT EXISTS succeeded; row-level verify needs the Management API, which is unavailable)${C.reset}\n`);
}
process.exit(0);

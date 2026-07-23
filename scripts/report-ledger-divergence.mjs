#!/usr/bin/env node
/**
 * READ-ONLY ledger reporter for the split-brain unification (docs/ledger-unification).
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=abcd node scripts/report-ledger-divergence.mjs
 *
 * (PROJECT_REF is the subdomain of your Supabase URL; parsed from NEXT_PUBLIC_SUPABASE_URL if omitted.)
 *
 * Runs ONLY the two read-only files — 01_introspect.sql + 02_report_divergence.sql — against your
 * project via the Supabase Management API, statement by statement, and prints each result set. It is
 * a REPORTER, not an applier: every statement is scanned first and REFUSED if it contains a mutating
 * keyword, so it can never write to your database even if the .sql files are later edited.
 *
 * The mutating reconciliation (03_reconcile.sql) is intentionally NOT runnable here — apply it by hand
 * in the SQL editor so a human reads its preview before committing. See docs/ledger-unification/README.md.
 *
 * Your access token exists only in your Supabase account and is never stored in this repo.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, '..', 'docs', 'ledger-unification');
const FILES = ['01_introspect.sql', '02_report_divergence.sql'];

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };
function fail(msg) { console.error(`\n${C.red}${C.bold}✗ ${msg}${C.reset}\n`); process.exit(1); }

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  fail(
    'SUPABASE_ACCESS_TOKEN is required.\n' +
    `  ${C.yellow}Get one:${C.reset} ${C.cyan}https://supabase.com/dashboard/account/tokens${C.reset}\n` +
    `  ${C.dim}then: SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=<ref> node scripts/report-ledger-divergence.mjs${C.reset}`,
  );
}

let ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (m) ref = m[1];
}
if (!ref) fail('SUPABASE_PROJECT_REF is required (or set NEXT_PUBLIC_SUPABASE_URL so it can be parsed).');

// Defense in depth: this tool only ever reads. Any statement with a mutating verb is refused.
const MUTATING = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|commit|begin|call|do)\b/i;

/** Strip `--` line comments, split into statements on `;`, drop blanks. (01/02 have no dollar-quotes.) */
function statements(sql) {
  const noComments = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  return noComments.split(';').map((s) => s.trim()).filter(Boolean);
}

async function runStatement(sql) {
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
  return res.json().catch(() => []);
}

console.log(`${C.bold}Ledger divergence report${C.reset} ${C.dim}→ project ${ref} (READ-ONLY)${C.reset}\n`);

for (const file of FILES) {
  let sql;
  try { sql = readFileSync(join(DOCS, file), 'utf8'); } catch { fail(`could not read ${file}`); }
  console.log(`${C.cyan}${C.bold}═══ ${file} ═══${C.reset}`);
  const stmts = statements(sql);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    if (MUTATING.test(stmt)) {
      console.log(`${C.yellow}  · skipped a non-read statement (this tool is read-only)${C.reset}`);
      continue;
    }
    const rows = await runStatement(stmt);
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 70);
    console.log(`\n${C.dim}  [${i + 1}] ${preview}…${C.reset}`);
    console.table(Array.isArray(rows) ? rows : [rows]);
  }
  console.log('');
}

console.log(`${C.green}${C.bold}✓ Report complete.${C.reset} ${C.dim}Choose a reconciliation policy per docs/ledger-unification/README.md §3.${C.reset}\n`);
process.exit(0);

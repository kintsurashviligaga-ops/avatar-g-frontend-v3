#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Live exposure check — what can someone holding ONLY the public anon key do to the database?
 *
 *   node scripts/check-db-exposure.mjs          # reads NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY from env or .env.local
 *
 * The anon key ships in every page's JavaScript, so this is exactly an anonymous attacker's view.
 * Everything here is READ-ONLY or side-effect-free by construction:
 *   - table probes select `id`-less row counts (Range 0-0) and print only the count, never data;
 *   - RPC probes call money functions with the all-zero UUID and amount 0, which every one of them treats as
 *     a no-op (no profile row → nothing to change; amount 0 → early return) EVEN IF it were executable —
 *     but after 20260929a the call must be refused with "permission denied" before the body runs.
 * Exit 0 = locked down. Exit 1 = something is still reachable (the report says what).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const file = resolve(process.cwd(), '.env.local');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvLocal();
const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
if (!URL_ || !ANON) {
  console.error('check-db-exposure: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.');
  process.exit(2);
}
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const ZERO = '00000000-0000-0000-0000-000000000000';

/** Tables an anonymous visitor must see ZERO rows of. */
const TABLES = ['profiles', 'credit_ledger', 'wallet_topups', 'jobs', 'job_steps', 'artifacts', 'project_intelligence',
  'generation_jobs', 'agent_evolution_traces', 'music_jobs', 'avatar_builder_jobs', 'image_architect_jobs', 'transactions',
  'studio_jobs', 'provider_webhook_events', 'longform_jobs', 'longform_scenes',
  // 20261001a — subscription tiers ("no such table" until it is applied, which also counts as locked).
  'subscriptions', 'subscription_allowance_grants',
  // 20261002a — BOG orders decide what a payment is worth; 20261002f — the client error log (service role only).
  'bog_orders', 'error_logs'];

/** Functions an anonymous visitor must NOT be able to execute, with no-op arguments. */
const RPCS = [
  ['add_credits', { p_user_id: ZERO, p_amount: 0 }],
  ['refund_credits', { p_user_id: ZERO, p_amount: 0, p_ref: 'exposure-probe' }],
  ['credit_wallet_gel', { p_user_id: ZERO, p_amount: 0, p_ref: 'exposure-probe' }],
  ['deduct_credits', { p_user_id: ZERO, p_amount: 0, p_ref: 'exposure-probe' }],
  // 20261002d. No profile row for ZERO, so even an executable probe raises before its first write.
  ['deduct_credits_once', { p_user_id: ZERO, p_amount: 0, p_ref: 'exposure-probe' }],
  ['consume_free_film', { p_user_id: ZERO }],
  ['consume_free_avatar_chat', { p_user_id: ZERO }],
  ['restore_free_film', { p_user_id: ZERO }],
  ['restore_free_avatar_chat', { p_user_id: ZERO }],
  ['set_avatar_name', { p_user_id: ZERO, p_name: '' }],
  // 20261001a. p_credits 0 makes the function raise 'invalid_allowance_grant' before its first write, so even an
  // executable probe changes nothing.
  ['grant_subscription_allowance', {
    p_user_id: ZERO, p_invoice_id: '', p_tier: 'none', p_credits: 0, p_subscription_id: null, p_customer_id: null,
    p_price_id: null, p_period_start: null, p_period_end: null,
  }],
  // 20261002a — the BOG money calls. Each probe is a no-op even if executable: an unknown order raises 'unknown_order'
  // (fulfil) or answers recorded:false (failure) before any write, and credits 0 raises 'invalid_claim' (claim).
  ['bog_fulfill_order', { p_shop_order_id: 'exposure-probe', p_bog_order_id: null, p_card_mask: null, p_card_saved: false }],
  ['bog_claim_renewal', { p_subscription_id: ZERO, p_credits: 0 }],
  ['bog_record_renewal_failure', { p_shop_order_id: 'exposure-probe', p_reason: 'exposure-probe' }],
  // A no-op even if executable: the all-zero job has no scenes and the ordinal list is empty. (claim_longform_jobs is
  // deliberately NOT probed — were it executable, the probe itself would lease real jobs.)
  ['claim_longform_scenes', { p_job_id: ZERO, p_ordinals: [] }],
];

async function countRows(table) {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
    signal: AbortSignal.timeout(20_000),
  });
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  if (res.status === 401 || res.status === 403) return { table, visible: 0, note: `denied (${res.status})` };
  if (res.status === 404) return { table, visible: 0, note: 'no such table' };
  return { table, visible: Number.isFinite(total) ? total : -1, note: `http ${res.status}` };
}

async function probeRpc([fn, args]) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(20_000),
  });
  let body = {};
  try { body = await res.json(); } catch { /* empty */ }
  const denied = res.status === 401 || res.status === 403 || body?.code === '42501' || /permission denied/i.test(body?.message || '');
  const missing = res.status === 404 && body?.code === 'PGRST202';
  return { fn, executable: !denied && !missing, note: denied ? 'permission denied' : missing ? 'not exposed' : `http ${res.status}` };
}

const tables = [];
for (const t of TABLES) tables.push(await countRows(t));
const rpcs = [];
for (const r of RPCS) rpcs.push(await probeRpc(r));

console.log('Anonymous view (public anon key only)\n');
for (const t of tables) console.log(`${t.visible > 0 ? '✗' : '✓'} table ${t.table.padEnd(24)} rows visible: ${String(t.visible).padStart(4)}  (${t.note})`);
for (const r of rpcs) console.log(`${r.executable ? '✗' : '✓'} rpc   ${r.fn.padEnd(24)} ${r.executable ? 'EXECUTABLE' : r.note}`);

const bad = tables.filter((t) => t.visible > 0).length + rpcs.filter((r) => r.executable).length;
console.log(`\n${bad === 0 ? 'LOCKED DOWN' : `${bad} EXPOSURE(S) REMAIN`}`);
process.exit(bad === 0 ? 0 : 1);

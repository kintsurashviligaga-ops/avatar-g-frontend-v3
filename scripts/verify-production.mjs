#!/usr/bin/env node
/**
 * Production readiness verifier — a black-box probe of the live MyAvatar.ge
 * surfaces a founder/operator can run anytime to confirm the pipeline is armed.
 *
 *   node scripts/verify-production.mjs                 # against https://myavatar.ge
 *   VERIFY_BASE=https://staging.example node scripts/verify-production.mjs
 *
 * It asserts security boundaries (founder gate 403 for anon; config coarse to
 * anon — no leak), that Stripe resolves (wallet-topup 401, not 503), and that
 * the live generators respond. It does NOT need credentials and never triggers a
 * paid generation. Exit 0 = all green, 1 = a hard check failed.
 *
 * NOTE: the Supabase RPC layer (credit_wallet_gel / wallet_topups) cannot be
 * black-box probed — verify it in the SQL editor (query printed at the end).
 */

const BASE = process.env.VERIFY_BASE ?? 'https://myavatar.ge';
const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };
const PASS = `${C.green}✓ PASS${C.reset}`;
const FAIL = `${C.red}✗ FAIL${C.reset}`;
const WARN = `${C.yellow}▲ WARN${C.reset}`;

let hardFails = 0;

async function probe(method, path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    let text = '';
    try { text = await res.text(); } catch { /* ignore */ }
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: e instanceof Error ? e.message : String(e) };
  }
}

function row(label, verdict, detail) {
  console.log(`  ${verdict}  ${C.bold}${label.padEnd(34)}${C.reset} ${C.dim}${detail}${C.reset}`);
}

function check(label, ok, detail, hard = true) {
  if (ok) { row(label, PASS, detail); return; }
  row(label, hard ? FAIL : WARN, detail);
  if (hard) hardFails++;
}

console.log(`\n${C.bold}${C.cyan}MyAvatar production readiness${C.reset} ${C.dim}→ ${BASE}${C.reset}\n`);

// ── Security boundaries ──
const fv = await probe('POST', '/api/billing/founder-verify');
check('Founder gate forbids anon (403)', fv.status === 403, `got ${fv.status}`);

const cfg = await probe('GET', '/api/health/config');
let cfgCoarse = false;
try { const j = JSON.parse(cfg.text); cfgCoarse = !('integrations' in j) && typeof j.ready === 'boolean'; } catch { /* */ }
check('Config detail not leaked to anon', cfg.status === 200 && cfgCoarse, `status ${cfg.status}`);

// ── Stripe provider (401 = key resolves, 503 = missing) ──
const wt = await probe('POST', '/api/billing/wallet-topup', { amountGel: 10 });
check('Stripe live key resolves', wt.status === 401, wt.status === 503 ? 'STRIPE_SECRET_KEY missing (503)' : `got ${wt.status} (expect 401 = configured + auth-gated)`);

// ── Live generators ──
const home = await probe('GET', '/');
check('App shell serving', home.status === 200 || home.status === 307, `got ${home.status}`);

const chat = await probe('POST', '/api/chat/gemini', { messages: [{ role: 'user', content: 'ok' }] });
check('Chat generation', chat.status === 200, `got ${chat.status}`, false);

const tts = await probe('POST', '/api/elevenlabs/tts', { text: 'გამარჯობა', locale: 'ka' });
check('Premium Georgian TTS', tts.status === 200, `got ${tts.status}`, false);

const produce = await probe('POST', '/api/orchestrator/produce', {});
check('Produce auth-gated (401)', produce.status === 401, `got ${produce.status}`);

console.log('');
if (hardFails === 0) {
  console.log(`${C.green}${C.bold}  PRODUCTION READY ✓${C.reset}  ${C.dim}all hard checks green${C.reset}`);
} else {
  console.log(`${C.red}${C.bold}  NOT READY — ${hardFails} hard check(s) failed${C.reset}`);
}
console.log(`${C.dim}  DB layer (probe-blind) — verify in Supabase SQL editor:${C.reset}`);
console.log(`${C.dim}    SELECT proname FROM pg_proc WHERE proname IN ('credit_wallet_gel','consume_free_avatar_chat');${C.reset}\n`);

process.exit(hardFails === 0 ? 0 : 1);

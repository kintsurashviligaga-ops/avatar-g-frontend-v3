#!/usr/bin/env node
/**
 * Run the three paid Omni checks against myavatar.ge as YOU (v5.1 M-3, GG D-07). See docs/v5.1-phase2/omni-paid-checks.md.
 *
 *   node scripts/omni-checks/run.mjs                      # dry run: free price probes only, nothing is made
 *   node scripts/omni-checks/run.mjs --go --from11 '<id>' # C1 + C2 + C3, at most ✦70 (about $1.04)
 *   node scripts/omni-checks/run.mjs --go --skip-c3       # C1 + C2 only
 *
 * Sign-in: MYAVATAR_COOKIE (the Cookie header of a signed-in myavatar.ge request, from DevTools → Network) or
 * MYAVATAR_TOKEN (the Supabase access token). Read from the environment only, sent only to --base, never printed or saved.
 *
 * Why a script and not localhost: a paid Omni call needs Production's Workload Identity (localhost cannot reach Vertex,
 * and a Preview refuses paid work), and this goes through the real routes, so the price check, the debit, the refund and
 * the Library filing are the ones users get.
 *
 * Every paid step first asks the route its price for free (expectedCredits: 0 → 409 price_changed with the real price)
 * and stops if that price is not the one the price book row says, or if the run would pass ✦70.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_CLIP_PROMPT, DEFAULT_EXTEND_PROMPT, EXPECTED_CREDITS, INTERACTION_TTL_MS, MAX_RUN_CREDITS, USD_PER_CREDIT,
  bareJobId, interactionAgeDays, judge, readOmniJobId, withinBudget,
} from './plan.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};

const BASE = opt('base', 'https://myavatar.ge').replace(/\/+$/, '');
const GO = flag('go');
const SKIP_C3 = flag('skip-c3');
const FROM11 = opt('from11', '');
const CLIP_PROMPT = opt('prompt', DEFAULT_CLIP_PROMPT);
const EXTEND_PROMPT = opt('extend-prompt', DEFAULT_EXTEND_PROMPT);
const POLL_MS = Number(process.env.OMNI_CHECKS_POLL_MS) || 10_000;
const POLL_MAX_MS = 6 * 60_000;

// Filled as the run goes, so a stop half way still saves what was paid for (see die and saveResults).
const results = [];
let spent = 0;
let started = 0;
let before = null;

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  // Once something paid has started, a stop must still leave a record: what ran, its job id and what it cost.
  if (started > 0) saveResults(null, msg);
  process.exit(1);
}
// 127.0.0.1 only for run.test.ts's fake server: the sign-in is never sent anywhere else.
if (!/^https:\/\/([a-z0-9-]+\.)*(myavatar\.ge|vercel\.app)$/.test(BASE) && !/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) {
  die('--base must be https://myavatar.ge or a vercel.app deployment');
}

const COOKIE = (process.env.MYAVATAR_COOKIE ?? '').trim();
const TOKEN = (process.env.MYAVATAR_TOKEN ?? '').trim();
if (!COOKIE && !TOKEN) die('set MYAVATAR_COOKIE or MYAVATAR_TOKEN (see the runbook); it is never printed.');
const authHeaders = COOKIE ? { cookie: COOKIE } : { authorization: `Bearer ${TOKEN}` };

if (FROM11) {
  const j = readOmniJobId(FROM11);
  if (!j) die('--from11 is not an Omni job id');
  if (j.model !== 'gemini-omni-1.1-flash-preview') die('--from11 was made on 1.2 (its id has m2); C3 needs a clip from before #295');
}

/** Never throws: a network error or timeout comes back as httpStatus 0, so a paid step is never lost to a crash. */
async function call(method, path, body) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...authHeaders, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(Number(process.env.OMNI_CHECKS_TIMEOUT_MS) || 90_000),
    });
    const json = await r.json().catch(() => ({}));
    return { httpStatus: r.status, ...json };
  } catch (e) {
    return { httpStatus: 0, error: `network: ${e?.name === 'TimeoutError' ? 'no answer in time' : (e?.message ?? 'failed')}` };
  }
}

/** The route's own price, free: a wrong expectedCredits is refused before anything is reserved. */
async function priceOf(path, body) {
  const r = await call('POST', path, { ...body, expectedCredits: 0 });
  if (r.httpStatus === 409 && typeof r.credits === 'number') return r.credits;
  return die(`price probe ${path} answered ${r.httpStatus} ${r.error ?? ''} ${JSON.stringify(r.issues ?? '')}`);
}

async function poll(jobId) {
  const t0 = Date.now();
  for (;;) {
    const s = await call('GET', `/api/genjutsu/status?id=${encodeURIComponent(jobId)}`);
    if (s.done) return s;
    // A sign-in that expired mid-run never comes back by waiting; the job itself keeps going on the server.
    if (s.httpStatus === 401 || s.httpStatus === 403) return { state: 'signed_out' };
    if (Date.now() - t0 > POLL_MAX_MS) return { state: 'timeout' };
    console.log(`  … ${s.state ?? s.httpStatus} (${Math.round((Date.now() - t0) / 1000)} s)`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function balance() {
  const b = await call('GET', '/api/credits/balance');
  return typeof b.balance === 'number' ? b.balance : null;
}

/** A copy for the thread, without the sign-in, the signed links or the charge tokens. */
function saveResults(after, stoppedBecause) {
  const dir = process.env.OMNI_CHECKS_OUT || join(process.cwd(), 'omni-checks-out');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `result-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const clean = results.map(({ videoUrl, ...r }) => ({ ...r, hasVideo: !!videoUrl }));
  const out = { base: BASE, at: new Date().toISOString(), spent, before, after, ...(stoppedBecause ? { stoppedBecause } : {}), results: clean };
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`saved: ${file}`);
}

async function paidStep(name, path, body, expectCredits) {
  const quoted = await priceOf(path, body);
  console.log(`${name}: the route quotes ✦${quoted} (price book: ✦${expectCredits})`);
  if (quoted !== expectCredits) die(`${name}: the price is not the approved row; nothing was made`);
  if (!withinBudget(spent, quoted)) die(`${name}: would pass the ✦${MAX_RUN_CREDITS} cap for this run`);
  if (!GO) return null;
  const start = await call('POST', path, { ...body, expectedCredits: quoted });
  if (start.httpStatus === 0) {
    // The request may or may not have reached the server: it could be running and charged. Never send it again blind.
    started++;
    results.push({ name, pass: false, outcome: 'unknown', notes: [`${start.error}; it may have started: check the Library and the balance before running again`] });
    die(`${name}: no answer to the start request; stopped so nothing is paid twice`);
  }
  if (start.httpStatus === 202) {
    started++;
    spent += start.credits ?? 0;
  }
  console.log(`${name}: started (${start.httpStatus})${start.jobId ? `, ${readOmniJobId(start.jobId)?.model}` : ` ${start.error ?? ''}`}`);
  const final = start.httpStatus === 202 ? await poll(start.jobId) : null;
  if (final?.state === 'failed' && final.refunded) spent -= start.credits ?? 0;
  return { start, final };
}

before = await balance();
const cap = `cap ✦${MAX_RUN_CREDITS} ≈ $${(MAX_RUN_CREDITS * USD_PER_CREDIT).toFixed(2)}`;
console.log(`\nOmni paid checks → ${BASE} ${GO ? `(PAID RUN, ${cap})` : '(dry run: price probes only)'}`);
console.log(`balance before: ${before === null ? 'unknown (token sign-in cannot read it; use MYAVATAR_COOKIE)' : `✦${before}`}\n`);

// C1: a new clip with a Georgian line, 4 s 720p → 1.2.
const clipBody = { prompt: CLIP_PROMPT, seconds: 4, resolution: '720p', aspect: '9:16', speech: 'ka' };
const c1 = await paidStep('C1 new clip (1.2)', '/api/video/clip', clipBody, EXPECTED_CREDITS.clip720_4);
if (c1) {
  results.push(judge({ name: 'C1 new clip on 1.2', ...c1, expectCredits: EXPECTED_CREDITS.clip720_4, expectModel: 'gemini-omni-1.2-flash', expectOp: 'clip' }));
}

// C2: „გააგრძელე" on C1's clip → stays on 1.2. The dry run cannot price it: there is no clip to continue yet.
if (c1?.final?.state === 'ready') {
  const extend = { op: 'extend', from: c1.start.jobId, prompt: EXTEND_PROMPT, seconds: 4, resolution: '720p' };
  const c2 = await paidStep('C2 continue the 1.2 clip', '/api/video/omni-edit', extend, EXPECTED_CREDITS.extend720_4);
  if (c2) {
    results.push(judge({ name: 'C2 continue on 1.2', ...c2, expectCredits: EXPECTED_CREDITS.extend720_4, expectModel: 'gemini-omni-1.2-flash', expectOp: 'extend' }));
  }
} else if (GO) {
  results.push({ name: 'C2 continue on 1.2', pass: false, outcome: 'skipped', notes: ['C1 made no clip'] });
} else {
  console.log("C2: priced in the paid run (it needs C1's clip)");
}

// C3: „გააგრძელე" on a clip 1.1 made before #295 → stays on 1.1, or fails refunded once Google dropped it.
if (SKIP_C3) {
  console.log('C3: skipped (--skip-c3)');
} else if (!FROM11) {
  console.log('C3: needs --from11 <job id of a 1.1 clip> (runbook step 2 finds one); not run');
} else {
  const age = interactionAgeDays(FROM11);
  const old = age !== null && age * 864e5 > INTERACTION_TTL_MS;
  console.log(`C3: the 1.1 clip is ${age?.toFixed(1)} days old${old ? " (past Google's 7 days: expect a refunded failure)" : ''}`);
  const extend = { op: 'extend', from: FROM11, prompt: EXTEND_PROMPT, seconds: 4, resolution: '720p' };
  const c3 = await paidStep('C3 continue a 1.1 clip', '/api/video/omni-edit', extend, EXPECTED_CREDITS.extend720_4);
  if (c3) {
    results.push(judge({
      name: 'C3 continue on 1.1', ...c3, expectCredits: EXPECTED_CREDITS.extend720_4,
      expectModel: 'gemini-omni-1.1-flash-preview', expectOp: 'extend', allowRefundedFailure: true,
    }));
  }
}

const after = GO ? await balance() : before;
console.log('\n── Result ──');
for (const r of results) {
  console.log(`${r.pass ? '✓ PASS' : '✗ FAIL'}  ${r.name}: ${r.outcome}${r.credits !== undefined ? `, ✦${r.credits}` : ''}`);
  for (const n of r.notes ?? []) console.log(`      ${n}`);
  if (r.jobId) console.log(`      job: ${r.jobId}`);
  if (r.videoUrl) console.log('      video: open it from the Library (signed link not printed)');
}
if (GO) {
  console.log(`spent in this run: ✦${spent} ≈ $${(spent * USD_PER_CREDIT).toFixed(2)}`);
  if (before !== null && after !== null) {
    const diff = before - after;
    console.log(`balance: ✦${before} → ✦${after} (difference ✦${diff}${diff === spent ? ', matches' : ', DOES NOT MATCH the run'})`);
  }
  saveResults(after);
}
process.exit(GO && results.length && results.every((r) => r.pass) ? 0 : GO ? 1 : 0);

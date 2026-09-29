/* eslint-disable no-console */
/**
 * Higgsfield smoke test — brief §3c.
 *
 *   npm run hf:smoke                # estimate only: NO credits spent, proves auth + model access
 *   npm run hf:smoke -- --submit    # also submits the CHEAPEST params per model and polls to a terminal state
 *   npm run hf:smoke -- --only=soul --json=/tmp/hf-smoke.json
 *   npm run hf:smoke -- --submit --image-url=https://… --video-url=https://…   (unlocks i2v / motion control)
 *
 * Prints `model | estimate | status | latency | output-url` — one row per registered model.
 *
 * Rules carried from the Higgsfield docs (docs/concepts/errors, polling, billing-and-retention):
 *  - Credentials are read from HF_CREDENTIALS or HF_API_KEY_ID + HF_API_KEY_SECRET. They are never printed.
 *  - A generation POST is NEVER retried after an ambiguous timeout — there is no idempotency key, a retry
 *    would double-charge. The row is marked `ambiguous-timeout`; check the Console for the request.
 *  - Polling: 2 s → 10 s with jitter; only GET status is retried on 5xx/network errors.
 *  - Every response's X-Correlation-ID is kept next to the request_id (needed by Higgsfield support).
 *
 * Runs on plain Node ≥ 22.18 (type stripping) — no SDK, no dotenv, no path aliases — so it also proves the
 * raw REST surface independently of @higgsfield/client.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Service = 'image' | 'video' | 'motion' | 'avatar';
type Ctx = { imageUrl: string | null; videoUrl: string | null; firstImageOutput: string | null };
type Estimate = { credits: string; usd: string };
type TerminalStatus = 'completed' | 'failed' | 'nsfw' | 'canceled';
type RowStatus =
  | 'estimated'
  | TerminalStatus
  | 'skipped'
  | 'ambiguous-timeout'
  | 'poll-timeout'
  | `http-${number}`
  | 'error';

type SmokeModel = {
  /** Our registry id (what lib/providers/registry.ts will use). */
  id: string;
  label: string;
  service: Service;
  /** Higgsfield endpoint id — exactly as documented on docs.higgsfield.ai/docs/models. */
  endpoint: string;
  /** Cheapest documented input. Return null to skip with `skip`. */
  input: (ctx: Ctx) => Record<string, unknown> | null;
  skip?: (ctx: Ctx) => string | null;
  /** Application-level poll deadline for this model. */
  timeoutMs: number;
  /** Which output key the docs promise. */
  output: 'images' | 'video';
};

type Row = {
  id: string;
  endpoint: string;
  service: Service;
  estimate: Estimate | null;
  estimateGel: number | null;
  status: RowStatus;
  latencyMs: number | null;
  outputUrl: string | null;
  requestId: string | null;
  correlationId: string | null;
  note: string | null;
};

// ---------------------------------------------------------------------------------------------------------
// Registered models — first wave (brief §11 defaults), endpoints verified against the docs on 2026-09-28.
// Nano Banana is NOT in Higgsfield's public catalogue (16 image entries: SOUL/Soul ID/Marketing Studio/Grok/
// Recraft/Qwen/Ideogram/Z-Image) — it stays on our existing provider. Soul ID is a TRAINING workflow whose
// endpoint page could not be fetched during Phase 0; it is listed as skipped until confirmed in the Console.
// ---------------------------------------------------------------------------------------------------------
const PLACEHOLDER_IMAGE = 'https://myavatar.ge/logo.png';

const MODELS: SmokeModel[] = [
  {
    id: 'hf/soul-2',
    label: 'SOUL V2 · text→image',
    service: 'image',
    endpoint: 'higgsfield-ai/soul/v2/standard',
    input: () => ({ prompt: 'Editorial portrait in soft daylight, Tbilisi courtyard' }),
    timeoutMs: 5 * 60_000,
    output: 'images',
  },
  {
    id: 'hf/kling-3-std-t2v',
    label: 'Kling 3.0 Standard · text→video',
    service: 'video',
    endpoint: 'kling-video/v3.0/std/text-to-video',
    // duration min 3, sound off = cheapest documented combination
    input: () => ({ prompt: 'A slow cinematic tracking shot along a sunlit coastal road.', duration: 3, sound: 'off', aspect_ratio: '16:9' }),
    timeoutMs: 15 * 60_000,
    output: 'video',
  },
  {
    id: 'hf/kling-3-pro-t2v',
    label: 'Kling 3.0 Pro · text→video',
    service: 'video',
    endpoint: 'kling-video/v3.0/pro/text-to-video',
    input: () => ({ prompt: 'A slow cinematic tracking shot along a sunlit coastal road.', duration: 3, sound: 'off', aspect_ratio: '16:9' }),
    timeoutMs: 15 * 60_000,
    output: 'video',
  },
  {
    id: 'hf/kling-3-std-i2v',
    label: 'Kling 3.0 Standard · image→video',
    service: 'video',
    endpoint: 'kling-video/v3.0/std/image-to-video',
    // Chains the SOUL output when --submit produced one; otherwise a public placeholder (estimate only needs a URI).
    input: (ctx) => ({ prompt: 'Gentle camera push-in, subject turns to the light.', duration: 3, sound: 'off', image_url: ctx.imageUrl ?? ctx.firstImageOutput ?? PLACEHOLDER_IMAGE }),
    timeoutMs: 15 * 60_000,
    output: 'video',
  },
  {
    id: 'hf/seedance-2.5-t2v',
    label: 'Seedance 2.5 · text→video',
    service: 'video',
    endpoint: 'bytedance/seedance-2.5/text-to-video',
    // duration min 4, 480p, no audio = cheapest documented combination
    input: () => ({ prompt: 'A cinematic wide shot of ocean waves at sunset, gentle camera movement.', duration: 4, resolution: '480p', generate_audio: false, aspect_ratio: '16:9' }),
    timeoutMs: 15 * 60_000,
    output: 'video',
  },
  {
    id: 'hf/kling-3-motion-control-std',
    label: 'Kling 3.0 Motion Control · Standard',
    service: 'motion',
    endpoint: 'kling-video/v3/motion-control/std',
    skip: (ctx) => (ctx.videoUrl ? null : 'needs --video-url (3–30 s public reference video)'),
    input: (ctx) => ({ image_url: ctx.imageUrl ?? ctx.firstImageOutput ?? PLACEHOLDER_IMAGE, video_url: ctx.videoUrl, keep_original_sound: 'no' }),
    timeoutMs: 20 * 60_000,
    output: 'video',
  },
  {
    id: 'hf/genjutsu-motion-transfer',
    label: 'Genjutsu · motion transfer',
    service: 'motion',
    endpoint: 'higgsfield/genjutsu/motion-transfer/v1.0',
    skip: (ctx) => (ctx.videoUrl ? null : 'needs --video-url (≥ 4 s public source video)'),
    input: (ctx) => ({ video_url: ctx.videoUrl, image_urls: [ctx.imageUrl ?? ctx.firstImageOutput ?? PLACEHOLDER_IMAGE] }),
    timeoutMs: 20 * 60_000,
    output: 'video',
  },
  {
    id: 'hf/soul-id',
    label: 'Soul ID · character training',
    service: 'avatar',
    endpoint: 'higgsfield-ai/soul-id',
    skip: () => 'training workflow — endpoint unverified in Phase 0, confirm in console.higgsfield.ai before enabling',
    input: () => null,
    timeoutMs: 30 * 60_000,
    output: 'images',
  },
];

// ---------------------------------------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------------------------------------
function loadDotEnvLocal(): void {
  const file = resolve(process.cwd(), '.env.local');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Returns the header value or a human explanation of what is missing. Never returns the secret to a log. */
function credentials(): { header: string } | { missing: string } {
  const single = (process.env.HF_CREDENTIALS ?? '').trim();
  if (single) {
    if (!single.includes(':')) return { missing: 'HF_CREDENTIALS must be "KEY_ID:KEY_SECRET"' };
    return { header: `Key ${single}` };
  }
  const id = (process.env.HF_API_KEY_ID ?? '').trim();
  const secret = (process.env.HF_API_KEY_SECRET ?? '').trim();
  if (!id && !secret) return { missing: 'HF_API_KEY_ID + HF_API_KEY_SECRET (or HF_CREDENTIALS) are not set' };
  if (!id) return { missing: 'HF_API_KEY_ID is empty' };
  if (!secret) return { missing: 'HF_API_KEY_SECRET is empty — the console issues a key ID AND a secret; both are needed' };
  return { header: `Key ${id}:${secret}` };
}

const BASE = (process.env.HF_API_BASE_URL ?? 'https://api.higgsfield.ai').replace(/\/$/, '');
// Mirrors lib/billing/fx.ts GEL_PER_USD (2.7) — the script cannot import the alias, so the env override is the SSoT hook.
const GEL_PER_USD = Number(process.env.HF_USD_GEL_RATE) || 2.7;
const GEL_MARGIN = Number(process.env.HF_GEL_MARGIN) || 1.35;
const toGel = (usd: string | number): number => Math.round(Number(usd) * GEL_PER_USD * GEL_MARGIN * 100) / 100;

// ---------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------
type HfResponse = { status: number; json: any; correlationId: string | null };

async function hf(method: 'GET' | 'POST', url: string, auth: string, body?: unknown, timeoutMs = 60_000): Promise<HfResponse> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json', 'User-Agent': 'myavatar-hf-smoke/0.1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { detail: text.slice(0, 300) }; }
  return { status: res.status, json, correlationId: res.headers.get('x-correlation-id') };
}

/** Docs table (concepts/errors) → one short human line. Never parses prose for decisions. */
function explain(status: number, detail: unknown): string {
  const d = typeof detail === 'string' ? detail : JSON.stringify(detail ?? '').slice(0, 160);
  switch (status) {
    case 400: return /concurren/i.test(d) ? `concurrency limit reached — queue it (${d})` : `bad request: ${d}`;
    case 401: return 'invalid credentials (401) — check HF_API_KEY_ID / HF_API_KEY_SECRET';
    case 403: return 'HIGGSFIELD CREDITS EXHAUSTED (403) — top up in console.higgsfield.ai (admin alert path in prod)';
    case 404: return 'model not available for this account (404) — enable it in the Console or pick the registry fallback';
    case 422: return `validation failed (422): ${d}`;
    case 423: return 'model temporarily blocked (423) — retry later / fallback';
    case 503: return 'model disabled or not ready (503) — retry later / fallback';
    default: return `HTTP ${status}: ${d}`;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollUntilTerminal(statusUrl: string, auth: string, deadlineMs: number): Promise<{ status: TerminalStatus | 'poll-timeout'; body: any; correlationId: string | null }> {
  const started = Date.now();
  let delay = 2_000;
  let lastCorrelation: string | null = null;
  while (Date.now() - started < deadlineMs) {
    let res: HfResponse | null = null;
    try {
      res = await hf('GET', statusUrl, auth, undefined, 30_000);
    } catch {
      res = null; // network failure: retry the GET with backoff (allowed by the docs)
    }
    if (res) {
      lastCorrelation = res.correlationId ?? lastCorrelation;
      if (res.status === 401 || res.status === 404) return { status: 'poll-timeout', body: res.json, correlationId: lastCorrelation };
      if (res.status < 500 && res.json && typeof res.json.status === 'string') {
        const s = res.json.status as string;
        if (s === 'completed' || s === 'failed' || s === 'nsfw' || s === 'canceled') return { status: s, body: res.json, correlationId: lastCorrelation };
      }
    }
    await sleep(delay + Math.random() * 500);
    delay = Math.min(delay * 1.5, 10_000);
  }
  return { status: 'poll-timeout', body: null, correlationId: lastCorrelation };
}

function outputUrlOf(body: any, kind: 'images' | 'video'): string | null {
  if (!body) return null;
  if (kind === 'images') return body.images?.[0]?.url ?? body.payload?.images?.[0]?.url ?? null;
  return body.video?.url ?? body.payload?.video?.url ?? null;
}

// ---------------------------------------------------------------------------------------------------------
// One model
// ---------------------------------------------------------------------------------------------------------
async function runModel(m: SmokeModel, auth: string, ctx: Ctx, submit: boolean): Promise<Row> {
  const row: Row = { id: m.id, endpoint: m.endpoint, service: m.service, estimate: null, estimateGel: null, status: 'skipped', latencyMs: null, outputUrl: null, requestId: null, correlationId: null, note: null };
  const skip = m.skip?.(ctx) ?? null;
  const input = skip ? null : m.input(ctx);
  if (skip || !input) { row.note = skip ?? 'no input'; return row; }

  // 1) estimate — the price the user will be shown before anything is charged
  const t0 = Date.now();
  try {
    const est = await hf('POST', `${BASE}/estimate/${m.endpoint}`, auth, input);
    row.correlationId = est.correlationId;
    if (est.status !== 200) { row.status = `http-${est.status}`; row.note = explain(est.status, est.json?.detail); row.latencyMs = Date.now() - t0; return row; }
    if (est.json?.type === 'description') {
      // Token-priced (Seedance 2.5): no number, only prose. The studio prices these itself
      // (lib/providers/higgsfield/tokenPricing.ts); here the 720p per-second rate is shown for reference.
      const m = String(est.json.pricing_description ?? '').match(/\$([0-9.]+) at 720p/);
      row.note = `token-priced — ~$${m?.[1] ?? '?'}/s at 720p before discount`;
      row.status = 'estimated';
      row.latencyMs = Date.now() - t0;
      if (!submit) return row;
    } else {
      row.estimate = { credits: String(est.json.credits), usd: String(est.json.usd) };
      row.estimateGel = toGel(est.json.usd);
      row.status = 'estimated';
    }
  } catch (e) {
    row.status = 'error'; row.note = `estimate: ${(e as Error).message}`; row.latencyMs = Date.now() - t0; return row;
  }
  if (!submit) { row.latencyMs = Date.now() - t0; return row; }

  // 2) submit — exactly once. An ambiguous timeout is recorded, never retried (no idempotency key).
  const t1 = Date.now();
  let sub: HfResponse;
  try {
    sub = await hf('POST', `${BASE}/${m.endpoint}`, auth, input, 60_000);
  } catch (e) {
    row.status = 'ambiguous-timeout';
    row.note = `submit did not answer in 60 s (${(e as Error).name}); NOT retried — check the Console for a charged request`;
    row.latencyMs = Date.now() - t1;
    return row;
  }
  row.correlationId = sub.correlationId ?? row.correlationId;
  if (sub.status !== 200 && sub.status !== 201 && sub.status !== 202) { row.status = `http-${sub.status}`; row.note = explain(sub.status, sub.json?.detail); row.latencyMs = Date.now() - t1; return row; }
  row.requestId = sub.json?.request_id ?? null;
  const statusUrl: string | undefined = sub.json?.status_url;
  if (!row.requestId || !statusUrl) { row.status = 'error'; row.note = 'submission accepted without request_id/status_url'; row.latencyMs = Date.now() - t1; return row; }

  // 3) poll to a terminal state
  const done = await pollUntilTerminal(statusUrl, auth, m.timeoutMs);
  row.latencyMs = Date.now() - t1;
  row.correlationId = done.correlationId ?? row.correlationId;
  row.status = done.status;
  if (done.status === 'completed') {
    row.outputUrl = outputUrlOf(done.body, m.output);
    if (m.output === 'images' && row.outputUrl && !ctx.firstImageOutput) ctx.firstImageOutput = row.outputUrl;
  } else if (done.status === 'failed') {
    row.note = typeof done.body?.error === 'string' ? done.body.error : 'generation failed (not charged)';
  } else if (done.status === 'nsfw') {
    row.note = 'rejected by moderation (not charged)';
  } else if (done.status === 'poll-timeout') {
    row.note = `no terminal state within ${Math.round(m.timeoutMs / 60_000)} min — request_id kept, check status later`;
  }
  return row;
}

// ---------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------
function arg(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

function fmtEstimate(r: Row): string {
  if (!r.estimate) return '—';
  return `${r.estimate.credits} cr · $${r.estimate.usd} · ${r.estimateGel?.toFixed(2)} ₾`;
}

function printTable(rows: Row[]): void {
  const cols = ['model', 'estimate', 'status', 'latency', 'output-url'];
  const data = rows.map((r) => [r.id, fmtEstimate(r), r.status, r.latencyMs === null ? '—' : `${(r.latencyMs / 1000).toFixed(1)}s`, r.outputUrl ?? (r.note ? `(${r.note})` : '—')]);
  const widths = cols.map((c, i) => Math.max(c.length, ...data.map((d) => d[i]?.length ?? 0)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' | ');
  console.log(line(cols));
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
  for (const d of data) console.log(line(d));
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const creds = credentials();
  if ('missing' in creds) {
    console.error(`hf-smoke: cannot start — ${creds.missing}.`);
    console.error('Create a dev credential pair in https://console.higgsfield.ai and put it in .env.local (never in code).');
    process.exit(2);
  }
  const submit = arg('submit') === 'true';
  const only = arg('only');
  const ctx: Ctx = { imageUrl: arg('image-url'), videoUrl: arg('video-url'), firstImageOutput: null };
  const selected = MODELS.filter((m) => !only || m.id.includes(only) || m.endpoint.includes(only));
  if (selected.length === 0) { console.error(`hf-smoke: --only=${only} matched no registered model`); process.exit(2); }

  console.log(`hf-smoke · ${BASE} · ${submit ? 'ESTIMATE + SUBMIT (credits WILL be spent)' : 'estimate only (no credits spent)'} · GEL = usd × ${GEL_PER_USD} × ${GEL_MARGIN}`);
  console.log(`models: ${selected.length}/${MODELS.length}${only ? ` (filter "${only}")` : ''}\n`);

  const rows: Row[] = [];
  // Sequential on purpose: the account concurrency limit (400) must not be tripped by the smoke test itself,
  // and the SOUL output is chained into the image→video rows.
  for (const m of selected) {
    process.stdout.write(`▶ ${m.label} … `);
    const row = await runModel(m, creds.header, ctx, submit);
    console.log(`${row.status}${row.note ? ` — ${row.note}` : ''}`);
    rows.push(row);
  }

  console.log('');
  printTable(rows);

  const estimated = rows.filter((r) => r.estimate);
  const totalUsd = estimated.reduce((s, r) => s + Number(r.estimate!.usd), 0);
  const totalCredits = estimated.reduce((s, r) => s + Number(r.estimate!.credits), 0);
  console.log(`\nestimated total for one run of every enabled model: ${totalCredits.toFixed(3)} credits · $${totalUsd.toFixed(3)} · ${toGel(totalUsd).toFixed(2)} ₾`);
  const green = rows.filter((r) => r.status === 'estimated' || r.status === 'completed').length;
  const skipped = rows.filter((r) => r.status === 'skipped').length;
  const red = rows.length - green - skipped;
  console.log(`green ${green} · skipped ${skipped} · red ${red}`);
  for (const r of rows) if (r.requestId) console.log(`  ${r.id}: request_id=${r.requestId} correlation=${r.correlationId ?? '—'}`);

  const jsonOut = arg('json');
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, submit, gelPerUsd: GEL_PER_USD, gelMargin: GEL_MARGIN, rows }, null, 2));
    console.log(`\nwrote ${jsonOut}`);
  }
  process.exit(red > 0 ? 1 : 0);
}

main().catch((e) => { console.error('hf-smoke: fatal', (e as Error).message); process.exit(1); });

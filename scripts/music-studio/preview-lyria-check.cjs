'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- a plain-node CommonJS build script */
/**
 * The REAL, PAID Google Lyria test on Vertex AI from a Vercel Preview build (Music Studio final certification).
 *
 * Why a build step: Vertex is reachable only with the Preview identity (Vercel OIDC → GCP STS → keyless service account;
 * the provider condition admits `environment:preview` only), so no laptop or CI job can make this call. Same pattern as
 * scripts/gcp/preview-inference-check.cjs.
 *
 * It does nothing unless ALL of these hold:
 *   · VERCEL_ENV=preview and GEMINI_TRANSPORT=vertex (Production, local and CI builds are skipped);
 *   · scripts/music-studio/lyria-check.request.json is in the commit, names the owner's approval reference and a cap.
 *     It is committed for ONE build and deleted in the very next commit once the result is read.
 * Then it makes at most CASES.length generateContent calls of lyria-3-clip-preview — ONE per case, never a retry (an
 * uncertain outcome may already be billed) — and stops before a call that could take the planned spend over the cap.
 *
 * Output (served by that Preview only): public/preview-checks/lyria/<case>.<ext> (the audio, as Google returned it) and
 * public/preview-checks/lyria/result.json (HTTP status, Google's error status enum, MIME, bytes, SHA-256, the model's text
 * part, timings). Never a token, key or Google's error text. Audio QC (ffprobe/ffmpeg) is done on the downloaded files.
 * It never fails the build: any error, and a hard timeout, end with exit code 0.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { redact } = require('../gcp/preview-inference-check.cjs');

const PREFIX = '[lyria-check]';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const CALL_TIMEOUT_MS = 170000;
const HARD_TIMEOUT_MS = 600000;
const ROOT = path.resolve(__dirname, '..', '..');
const REQUEST_FILE = path.join(ROOT, 'scripts', 'music-studio', 'lyria-check.request.json');
const OUT_DIR = path.join(ROOT, 'public', 'preview-checks', 'lyria');

const MODEL = 'lyria-3-clip-preview';
/** Reference price per clip (cloud.google.com/vertex-ai/generative-ai/pricing, rechecked 2026-10-14). Planning only. */
const USD_PER_CLIP = 0.04;
const MAX_CAP_USD = 5;

/** Fixed cases — the request file cannot add prompts. Same input shape as lib/ai/lyriaMusic.ts composes. */
const CASES = [
  {
    name: 'A-instrumental',
    input: 'Calm cinematic cello and piano over soft rain, slow tempo, 70 BPM.\n\nInstrumental only, no vocals.',
  },
  {
    name: 'B-vocal-en',
    input:
      'A warm acoustic pop song, female lead vocal, sung in English, gentle guitar and piano.\n\nLyrics:\n' +
      'City lights are glowing on the river tonight\nEvery street is singing and my heart is light\n' +
      'Hold my hand and walk with me until the morning comes\nWe will dance like children to the beating of the drums',
  },
  {
    name: 'C-vocal-ka-experimental',
    input:
      'A warm Georgian folk-pop song, female lead vocal, sung in Georgian, panduri and soft strings.\n\nLyrics:\n' +
      'თბილისის შუქი ღამეში ანთია\nმტკვარი მღერის, გული ხარობს\nხელი მომეცი, ვიაროთ ერთად\nდილამდე ვიცეკვოთ, ვიმღეროთ',
  },
];

const PATTERNS = {
  GCP_PROJECT_ID: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
  GCP_PROJECT_NUMBER: /^\d{1,20}$/,
  GCP_WORKLOAD_IDENTITY_POOL_ID: /^[a-z0-9-]{4,32}$/,
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: /^[a-z0-9-]{4,32}$/,
  GCP_SERVICE_ACCOUNT_EMAIL: /^[a-z0-9-]{6,30}@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/,
};
const APPROVAL_RE = /^GG-\d{8}-[A-Z0-9-]{4,60}$/;

function readRequest(file = REQUEST_FILE) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { none: true };
  }
  try {
    const r = JSON.parse(raw);
    if (typeof r.approval !== 'string' || !APPROVAL_RE.test(r.approval)) return { invalid: 'approval' };
    const cap = Number(r.capUsd);
    if (!(cap > 0 && cap <= MAX_CAP_USD)) return { invalid: 'capUsd' };
    const spentBefore = Number(r.spentBeforeUsd ?? 0);
    if (!(spentBefore >= 0)) return { invalid: 'spentBeforeUsd' };
    const names = Array.isArray(r.cases) ? r.cases : CASES.map((c) => c.name);
    if (!names.every((n) => CASES.some((c) => c.name === n))) return { invalid: 'cases' };
    return { approval: r.approval, cap, spentBefore, cases: CASES.filter((c) => names.includes(c.name)) };
  } catch {
    return { invalid: 'json' };
  }
}

function plan(env, request) {
  if (env.VERCEL_ENV !== 'preview') return { skip: 'not a Vercel Preview build' };
  if ((env.GEMINI_TRANSPORT ?? '').trim().toLowerCase() !== 'vertex') return { skip: 'GEMINI_TRANSPORT is not vertex' };
  if (request.none) return { skip: 'no request file' };
  if (request.invalid) return { skip: `invalid request (${request.invalid})` };
  const bad = Object.keys(PATTERNS).filter((k) => !PATTERNS[k].test((env[k] ?? '').trim()));
  if (bad.length) return { skip: `missing or invalid ${bad.join(',')}` };
  if (!env.VERCEL_OIDC_TOKEN) return { skip: 'VERCEL_OIDC_TOKEN is not set in this build' };
  // Cap: every planned call counts in full, on top of what earlier runs under the same approval already spent.
  const allowed = Math.floor((request.cap - request.spentBefore + 1e-9) / USD_PER_CLIP);
  const cases = request.cases.slice(0, Math.max(0, allowed));
  if (!cases.length) return { skip: 'cap reached' };
  const v = (k) => env[k].trim();
  return {
    subjectToken: env.VERCEL_OIDC_TOKEN,
    cases,
    approval: request.approval,
    capUsd: request.cap,
    spentBeforeUsd: request.spentBefore,
    audience: `//iam.googleapis.com/projects/${v('GCP_PROJECT_NUMBER')}/locations/global/workloadIdentityPools/${v('GCP_WORKLOAD_IDENTITY_POOL_ID')}/providers/${v('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID')}`,
    impersonationUrl: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${v('GCP_SERVICE_ACCOUNT_EMAIL')}:generateAccessToken`,
    url: `https://aiplatform.googleapis.com/v1/projects/${v('GCP_PROJECT_ID')}/locations/global/publishers/google/models/${MODEL}:generateContent`,
  };
}

function reasonOf(text) {
  try {
    const status = JSON.parse(text)?.error?.status;
    return typeof status === 'string' && /^[A-Z_]{3,40}$/.test(status) ? status : undefined;
  } catch {
    return undefined;
  }
}

const EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac' };

/** One case → one call. `write(name, bytes)` stores the audio. Never retries. */
async function runCase(p, c, accessToken, fetchImpl, write) {
  const t0 = Date.now();
  const row = { case: c.name, model: MODEL, location: 'global', transport: 'vertex', ok: false, dispatched: true };
  let res;
  try {
    res = await fetchImpl(p.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: c.input }] }],
        generationConfig: { responseModalities: ['AUDIO', 'TEXT'] },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    // Uncertain outcome: the request may have reached Google and be billed. Counted as spent; never re-sent.
    return { ...row, ms: Date.now() - t0, uncertain: true, error: err instanceof Error ? err.name : 'unknown' };
  }
  const text = await res.text().catch(() => '');
  row.ms = Date.now() - t0;
  row.status = res.status;
  if (!res.ok) {
    const reason = reasonOf(text);
    return { ...row, ...(reason ? { reason } : {}) };
  }
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    return { ...row, error: 'unparseable body' };
  }
  const cand = j?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const audio = parts.find((x) => x?.inlineData?.data);
  const caption = parts.map((x) => (typeof x?.text === 'string' ? x.text : '')).join('\n').trim();
  Object.assign(row, {
    finishReason: typeof cand?.finishReason === 'string' ? cand.finishReason : null,
    ...(typeof j?.modelVersion === 'string' ? { modelVersion: redact(j.modelVersion, 60) } : {}),
    textPart: caption.slice(0, 4000),
    usage: j?.usageMetadata ?? null,
    safety: cand?.safetyRatings ?? null,
    promptFeedback: j?.promptFeedback ?? null,
  });
  if (!audio) return { ...row, error: 'no audio part' };
  const mime = String(audio.inlineData.mimeType || '').toLowerCase();
  const bytes = Buffer.from(audio.inlineData.data, 'base64');
  const file = `${c.name}.${EXT[mime.split(';')[0]] || 'bin'}`;
  write(file, bytes);
  return { ...row, ok: true, mime, bytes: bytes.byteLength, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), file };
}

async function runCheck(env, request, opts = {}) {
  const lib = opts.lib ?? require('google-auth-library');
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const write = opts.write ?? ((name, bytes) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, name), bytes);
  });
  const p = plan(env, request);
  const base = { checkedAt: new Date().toISOString(), env: env.VERCEL_ENV ?? null, commit: env.VERCEL_GIT_COMMIT_SHA ?? null };
  if ('skip' in p) return { ...base, skipped: p.skip };
  const out = { ...base, approval: p.approval, capUsd: p.capUsd, spentBeforeUsd: p.spentBeforeUsd, usdPerClipReference: USD_PER_CLIP, results: [] };

  const client = lib.ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: p.audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: p.impersonationUrl,
    subject_token_supplier: { getSubjectToken: async () => p.subjectToken },
    scopes: [SCOPE],
  });
  if (!client) return { ...out, step: 'client' };
  let accessToken;
  try {
    ({ token: accessToken } = await client.getAccessToken());
    if (!accessToken) throw new Error('no access token returned');
  } catch (err) {
    const status = typeof err?.response?.status === 'number' ? err.response.status : undefined;
    return { ...out, step: 'token', ...(status ? { status } : {}) };
  }
  for (const c of p.cases) {
    const row = await runCase(p, c, accessToken, fetchImpl, write);
    out.results.push(row);
    console.log(`${PREFIX} case=${row.case} ok=${row.ok} http=${row.status ?? '-'}${row.reason ? ` reason=${row.reason}` : ''}${row.bytes ? ` bytes=${row.bytes}` : ''} ms=${row.ms}`);
  }
  out.dispatchedCalls = out.results.length;
  // Upper bound for planning: every dispatched call (2xx, 4xx or uncertain) counted at the reference price.
  out.plannedSpendUpperBoundUsd = Number((out.results.length * USD_PER_CLIP).toFixed(2));
  return out;
}

async function main() {
  setTimeout(() => {
    console.log(`${PREFIX} ok=false hard timeout after ${HARD_TIMEOUT_MS / 1000}s`);
    process.exit(0);
  }, HARD_TIMEOUT_MS).unref();
  try {
    const request = readRequest();
    const result = await runCheck(process.env, request);
    if (result.skipped) console.log(`${PREFIX} skipped: ${result.skipped}`);
    if (!request.none && process.env.VERCEL_ENV === 'preview') {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (err) {
    console.log(`${PREFIX} ok=false crashed: ${redact(err instanceof Error ? err.message : String(err))}`);
  }
  process.exitCode = 0;
}

if (require.main === module) void main();

module.exports = { plan, readRequest, runCheck, CASES, MODEL, USD_PER_CLIP };

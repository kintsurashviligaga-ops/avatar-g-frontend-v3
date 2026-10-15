'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- a plain-node CommonJS build script */
/**
 * Global E2E certification (2026-10-14): the REAL, PAID Google image + Veo test on Vertex AI from ONE Vercel Preview build.
 *
 * Why a build step: Vertex is reachable only with the Preview identity (Vercel OIDC → GCP STS → keyless SA; the WIF
 * provider admits `environment:preview` only). Same pattern as scripts/music-studio/preview-lyria-check.cjs, plus a
 * durable anti-replay rule the earlier checks lacked:
 *
 *   · the request file must carry `notAfter` (ISO time, at most 6 h after the build) — a rebuild/redeploy of the armed
 *     commit after that moment is a no-op, so an old commit can never spend again;
 *   · VERCEL_ENV=preview and GEMINI_TRANSPORT=vertex, else skipped (Production, local and CI builds never call);
 *   · fixed CASES only (the request file can only select them), ONE call per case, never a retry (an uncertain outcome
 *     may already be billed and is counted in full), and a case is skipped when its worst-case price would cross the cap.
 *
 * Output (that Preview only): public/preview-checks/global/<case>.<ext> + result.json (HTTP status, Google's status enum,
 * MIME, bytes, SHA-256, timings, operation id). Never a token, key or Google's error text. Never fails the build.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { redact } = require('../gcp/preview-inference-check.cjs');

const PREFIX = '[media-check]';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const ROOT = path.resolve(__dirname, '..', '..');
const REQUEST_FILE = path.join(ROOT, 'scripts', 'global-e2e', 'media-check.request.json');
const OUT_DIR = path.join(ROOT, 'public', 'preview-checks', 'global');
const CALL_TIMEOUT_MS = 120000;
const VEO_WAIT_MS = 6 * 60000;
const VEO_POLL_MS = 10000;
const HARD_TIMEOUT_MS = 20 * 60000;
const MAX_CAP_USD = 5;
const MAX_WINDOW_MS = 6 * 3600000;
const APPROVAL_RE = /^GG-\d{8}-[A-Z0-9-]{4,60}$/;

const IMAGE_MODEL = 'gemini-3.1-flash-image';
const VEO_MODEL = 'veo-3.1-fast-generate-001';
/**
 * Worst-case reservation per call. Image: the 4K output tier (~$0.15; we ask for the default 1K, ~$0.067 — third-party
 * listings, Google's page not machine-readable). Veo Fast 720p with audio $0.10/s × 4 s = $0.40 (lib/veo/capabilities.ts),
 * reserved at 1.5× = $0.60.
 */
const RESERVE_USD = { image: 0.15, veo: 0.6 };

const SUBJECT = 'a small red vintage tin robot toy with round glass eyes standing on a wooden desk';
const CASES = [
  { name: 'IMG-1-generate', kind: 'image', aspect: '16:9', prompt: `Photorealistic product photo of ${SUBJECT}, soft window light, shallow depth of field. No people, no text.` },
  { name: 'IMG-2-edit-background', kind: 'image', from: 'IMG-1-generate', prompt: 'Replace only the background with a calm blue studio backdrop. Keep the robot exactly as it is: same shape, colour, pose and position.' },
  { name: 'VEO-1-t2v-9x16', kind: 'veo', aspect: '9:16', prompt: `Slow dolly-in on ${SUBJECT}, warm morning light, a faint mechanical whirring sound. No people, no text.` },
  { name: 'VEO-2-i2v-16x9', kind: 'veo', aspect: '16:9', from: 'IMG-1-generate', prompt: 'The tin robot slowly turns its head toward the camera and blinks its glass eyes; gentle ticking sound. No people, no text.' },
];

const PATTERNS = {
  GCP_PROJECT_ID: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
  GCP_PROJECT_NUMBER: /^\d{1,20}$/,
  GCP_WORKLOAD_IDENTITY_POOL_ID: /^[a-z0-9-]{4,32}$/,
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: /^[a-z0-9-]{4,32}$/,
  GCP_SERVICE_ACCOUNT_EMAIL: /^[a-z0-9-]{6,30}@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/,
};

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
    const notAfter = Date.parse(r.notAfter);
    if (!Number.isFinite(notAfter)) return { invalid: 'notAfter' };
    const names = Array.isArray(r.cases) ? r.cases : CASES.map((c) => c.name);
    if (!names.every((n) => CASES.some((c) => c.name === n))) return { invalid: 'cases' };
    return { approval: r.approval, cap, spentBefore, notAfter, cases: CASES.filter((c) => names.includes(c.name)) };
  } catch {
    return { invalid: 'json' };
  }
}

function plan(env, request, now = Date.now()) {
  if (env.VERCEL_ENV !== 'preview') return { skip: 'not a Vercel Preview build' };
  if ((env.GEMINI_TRANSPORT ?? '').trim().toLowerCase() !== 'vertex') return { skip: 'GEMINI_TRANSPORT is not vertex' };
  if (request.none) return { skip: 'no request file' };
  if (request.invalid) return { skip: `invalid request (${request.invalid})` };
  if (now > request.notAfter) return { skip: 'request expired (notAfter passed) — a rebuild never spends' };
  if (request.notAfter - now > MAX_WINDOW_MS) return { skip: 'notAfter is more than 6 h ahead' };
  const bad = Object.keys(PATTERNS).filter((k) => !PATTERNS[k].test((env[k] ?? '').trim()));
  const veoLocation = (env.GCP_VEO_LOCATION ?? '').trim() || 'us-central1';
  if (!/^[a-z0-9-]{2,40}$/.test(veoLocation) || veoLocation === 'global') bad.push('GCP_VEO_LOCATION');
  if (bad.length) return { skip: `missing or invalid ${bad.join(',')}` };
  if (!env.VERCEL_OIDC_TOKEN) return { skip: 'VERCEL_OIDC_TOKEN is not set in this build' };
  // Reserve every planned call's worst case up front; drop cases (and their dependants) that would cross the cap.
  let budget = request.cap - request.spentBefore;
  const cases = [];
  for (const c of request.cases) {
    const cost = RESERVE_USD[c.kind];
    if (c.from && !cases.some((x) => x.name === c.from)) continue;
    if (cost > budget + 1e-9) continue;
    budget -= cost;
    cases.push(c);
  }
  if (!cases.length) return { skip: 'cap reached' };
  const v = (k) => env[k].trim();
  const project = encodeURIComponent(v('GCP_PROJECT_ID'));
  return {
    subjectToken: env.VERCEL_OIDC_TOKEN,
    cases,
    approval: request.approval,
    capUsd: request.cap,
    spentBeforeUsd: request.spentBefore,
    reservedUsd: Number((request.cap - request.spentBefore - budget).toFixed(2)),
    audience: `//iam.googleapis.com/projects/${v('GCP_PROJECT_NUMBER')}/locations/global/workloadIdentityPools/${v('GCP_WORKLOAD_IDENTITY_POOL_ID')}/providers/${v('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID')}`,
    impersonationUrl: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${v('GCP_SERVICE_ACCOUNT_EMAIL')}:generateAccessToken`,
    imageUrl: `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${IMAGE_MODEL}:generateContent`,
    veoBase: `https://${veoLocation}-aiplatform.googleapis.com/v1/projects/${project}/locations/${veoLocation}/publishers/google/models/${VEO_MODEL}`,
    veoLocation,
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

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4' };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function post(fetchImpl, url, token, body) {
  return fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
}

async function runImage(p, c, token, deps, outputs) {
  const t0 = Date.now();
  const row = { case: c.name, kind: 'image', model: IMAGE_MODEL, location: 'global', ok: false, dispatched: true };
  const ref = c.from ? outputs[c.from] : null;
  const parts = [...(ref ? [{ inlineData: { mimeType: ref.mime, data: ref.bytes.toString('base64') } }] : []), { text: c.prompt }];
  const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], ...(c.aspect ? { imageConfig: { aspectRatio: c.aspect } } : {}) } };
  let res;
  try {
    res = await post(deps.fetchImpl, p.imageUrl, token, body);
  } catch (err) {
    return { ...row, ms: Date.now() - t0, uncertain: true, error: err instanceof Error ? err.name : 'unknown' };
  }
  const text = await res.text().catch(() => '');
  Object.assign(row, { ms: Date.now() - t0, status: res.status });
  if (!res.ok) return { ...row, ...(reasonOf(text) ? { reason: reasonOf(text) } : {}) };
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ...row, error: 'unparseable body' };
  }
  const cand = j?.candidates?.[0];
  const img = (cand?.content?.parts ?? []).find((x) => x?.inlineData?.data);
  Object.assign(row, { finishReason: cand?.finishReason ?? null, usage: j?.usageMetadata ?? null, ...(typeof j?.modelVersion === 'string' ? { modelVersion: redact(j.modelVersion, 60) } : {}) });
  if (!img) return { ...row, error: 'no image part' };
  const mime = String(img.inlineData.mimeType || '').toLowerCase().split(';')[0];
  const bytes = Buffer.from(img.inlineData.data, 'base64');
  const file = `${c.name}.${EXT[mime] || 'bin'}`;
  deps.write(file, bytes);
  outputs[c.name] = { mime, bytes };
  return { ...row, ok: true, mime, bytes: bytes.byteLength, sha256: sha(bytes), file, ...(ref ? { inputSha256: sha(ref.bytes) } : {}) };
}

async function runVeo(p, c, token, deps, outputs) {
  const t0 = Date.now();
  const row = { case: c.name, kind: 'veo', model: VEO_MODEL, location: p.veoLocation, ok: false, dispatched: true, durationSec: 4, resolution: '720p', aspect: c.aspect, generateAudio: true };
  const ref = c.from ? outputs[c.from] : null;
  const instance = { prompt: c.prompt, ...(ref ? { image: { bytesBase64Encoded: ref.bytes.toString('base64'), mimeType: ref.mime } } : {}) };
  // Same parameter set lib/veo/payload.ts buildVertexPayload sends; no storageUri → Vertex returns the bytes inline.
  const parameters = { aspectRatio: c.aspect, durationSeconds: 4, resolution: '720p', sampleCount: 1, personGeneration: 'allow_adult', generateAudio: true };
  let res;
  try {
    res = await post(deps.fetchImpl, `${p.veoBase}:predictLongRunning`, token, { instances: [instance], parameters });
  } catch (err) {
    return { ...row, ms: Date.now() - t0, uncertain: true, error: err instanceof Error ? err.name : 'unknown' };
  }
  const text = await res.text().catch(() => '');
  row.status = res.status;
  if (!res.ok) return { ...row, ms: Date.now() - t0, ...(reasonOf(text) ? { reason: reasonOf(text) } : {}) };
  let opName;
  try {
    opName = JSON.parse(text).name;
  } catch {
    /* fallthrough */
  }
  if (typeof opName !== 'string') return { ...row, ms: Date.now() - t0, uncertain: true, error: 'no operation name' };
  row.operationId = redact(opName.split('/').pop(), 80);
  // Polling is free; only the submit above bills. The submit is never repeated.
  while (Date.now() - t0 < VEO_WAIT_MS) {
    await deps.sleep(VEO_POLL_MS);
    let op;
    try {
      const r = await post(deps.fetchImpl, `${p.veoBase}:fetchPredictOperation`, token, { operationName: opName });
      if (!r.ok) continue;
      op = await r.json();
    } catch {
      continue;
    }
    if (!op?.done) continue;
    row.ms = Date.now() - t0;
    if (op.error) return { ...row, opError: reasonOf(JSON.stringify({ error: { status: op.error.status } })) ?? `code_${op.error.code}` };
    const resp = op.response ?? {};
    row.raiMediaFilteredCount = resp.raiMediaFilteredCount ?? 0;
    const vid = (resp.videos ?? [])[0];
    if (!vid?.bytesBase64Encoded) return { ...row, error: vid?.gcsUri ? 'gcs output (unexpected)' : 'no video' };
    const bytes = Buffer.from(vid.bytesBase64Encoded, 'base64');
    const file = `${c.name}.mp4`;
    deps.write(file, bytes);
    outputs[c.name] = { mime: 'video/mp4', bytes };
    return { ...row, ok: true, mime: vid.mimeType || 'video/mp4', bytes: bytes.byteLength, sha256: sha(bytes), file, ...(ref ? { inputSha256: sha(ref.bytes) } : {}) };
  }
  return { ...row, ms: Date.now() - t0, uncertain: true, error: 'wait timeout (may still bill)' };
}

async function runCheck(env, request, opts = {}) {
  const lib = opts.lib ?? require('google-auth-library');
  const deps = {
    fetchImpl: opts.fetchImpl ?? globalThis.fetch,
    sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    write: opts.write ?? ((name, bytes) => {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, name), bytes);
    }),
  };
  const p = plan(env, request, opts.now);
  const base = { checkedAt: new Date().toISOString(), env: env.VERCEL_ENV ?? null, commit: env.VERCEL_GIT_COMMIT_SHA ?? null };
  if ('skip' in p) return { ...base, skipped: p.skip };
  const out = { ...base, approval: p.approval, capUsd: p.capUsd, spentBeforeUsd: p.spentBeforeUsd, reservedUsd: p.reservedUsd, reservePerCallUsd: RESERVE_USD, results: [] };
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
  let token;
  try {
    ({ token } = await client.getAccessToken());
    if (!token) throw new Error('no access token');
  } catch (err) {
    const status = typeof err?.response?.status === 'number' ? err.response.status : undefined;
    return { ...out, step: 'token', ...(status ? { status } : {}) };
  }
  const outputs = {};
  for (const c of p.cases) {
    if (c.from && !outputs[c.from]) {
      out.results.push({ case: c.name, kind: c.kind, dispatched: false, skipped: `input ${c.from} missing` });
      continue;
    }
    const row = c.kind === 'image' ? await runImage(p, c, token, deps, outputs) : await runVeo(p, c, token, deps, outputs);
    out.results.push(row);
    console.log(`${PREFIX} case=${row.case} ok=${row.ok} http=${row.status ?? '-'}${row.reason ? ` reason=${row.reason}` : ''}${row.bytes ? ` bytes=${row.bytes}` : ''} ms=${row.ms ?? '-'}`);
  }
  const dispatched = out.results.filter((r) => r.dispatched);
  out.dispatchedCalls = dispatched.length;
  out.reservedSpendUpperBoundUsd = Number(dispatched.reduce((s, r) => s + RESERVE_USD[r.kind], 0).toFixed(2));
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

module.exports = { plan, readRequest, runCheck, CASES, RESERVE_USD, IMAGE_MODEL, VEO_MODEL };

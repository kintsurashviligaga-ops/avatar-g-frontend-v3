'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- a plain-node CommonJS build script */
/**
 * Gemini "INFERENCE VERIFIED" on Vertex AI from a Vercel Preview build — one owner-approved generation, no sign-in.
 *
 * Runs before `next build` (vercel.json buildCommand). It does nothing unless ALL of these hold:
 *   · VERCEL_ENV=preview and GEMINI_TRANSPORT=vertex (Production, local and CI builds are skipped);
 *   · the request file scripts/gcp/inference-check.request.json is in the commit. It names the owner's approval and is
 *     committed only after the owner confirms the paid call, then deleted again once the result is read — so a build
 *     without it spends nothing.
 * Then it trades the build's Vercel OIDC token (VERCEL_OIDC_TOKEN; the same `sub` as the Preview functions' token) at GCP
 * STS, impersonates the keyless service account and asks ONE short generateContent of the requested model on the
 * GCP_GEMINI_LOCATION endpoint (default global) — a few tokens, a fraction of a cent, billed to the GCP project.
 *
 * The result goes to public/preview-checks/google-inference.json (served by that Preview only, so it can be read without
 * the Vercel dashboard) and to one `[gcp-inference-check]` log line: HTTP status, Google's error status enum, finish
 * reason, token counts and the first characters of the reply — never a token, key or Google's error text. It never
 * fails the build: any error, and a hard timeout, end with exit code 0.
 */

const fs = require('fs');
const path = require('path');

const PREFIX = '[gcp-inference-check]';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TIMEOUT_MS = 20000;
const HARD_TIMEOUT_MS = 40000;
const ROOT = path.resolve(__dirname, '..', '..');
const REQUEST_FILE = path.join(ROOT, 'scripts', 'gcp', 'inference-check.request.json');
const OUT_FILE = path.join(ROOT, 'public', 'preview-checks', 'google-inference.json');

/** The only models this check may call: the chat default (cheapest proof that generateContent works). */
const ALLOWED_MODELS = ['gemini-3.8-flash'];
const PROMPT = 'Reply with exactly one word: ok';

// Each value lands in a URL (STS audience, impersonation path, Vertex path), so each is checked before use.
const PATTERNS = {
  GCP_PROJECT_ID: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
  GCP_PROJECT_NUMBER: /^\d{1,20}$/,
  GCP_WORKLOAD_IDENTITY_POOL_ID: /^[a-z0-9-]{4,32}$/,
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: /^[a-z0-9-]{4,32}$/,
  GCP_SERVICE_ACCOUNT_EMAIL: /^[a-z0-9-]{6,30}@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/,
};
const LOCATION_RE = /^[a-z0-9-]{2,40}$/;
const REQUEST_ID_RE = /^[a-z0-9-]{6,64}$/;

function redact(text, max = 200) {
  return String(text)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]')
    .replace(/ya29\.[\w.-]+/g, '[token]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]')
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[pem]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** The owner's request, or why there is none. */
function readRequest(file = REQUEST_FILE) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { none: true };
  }
  try {
    const r = JSON.parse(raw);
    const model = typeof r.model === 'string' ? r.model : ALLOWED_MODELS[0];
    if (typeof r.requestId !== 'string' || !REQUEST_ID_RE.test(r.requestId)) return { invalid: 'requestId' };
    if (!ALLOWED_MODELS.includes(model)) return { invalid: 'model' };
    if (typeof r.approvedBy !== 'string' || typeof r.approvedAt !== 'string') return { invalid: 'approval' };
    return { requestId: r.requestId, model };
  } catch {
    return { invalid: 'json' };
  }
}

/** Decide whether this build calls anything. Returns { skip } or the validated configuration. */
function plan(env, request) {
  if (env.VERCEL_ENV !== 'preview') return { skip: 'not a Vercel Preview build' };
  if ((env.GEMINI_TRANSPORT ?? '').trim().toLowerCase() !== 'vertex') return { skip: 'GEMINI_TRANSPORT is not vertex' };
  if (request.none) return { skip: 'no request file' };
  if (request.invalid) return { skip: `invalid request (${request.invalid})` };
  const bad = Object.keys(PATTERNS).filter((k) => !PATTERNS[k].test((env[k] ?? '').trim()));
  const location = (env.GCP_GEMINI_LOCATION ?? '').trim() || 'global';
  if (!LOCATION_RE.test(location)) bad.push('GCP_GEMINI_LOCATION');
  if (bad.length) return { skip: `missing or invalid ${bad.join(',')}` };
  if (!env.VERCEL_OIDC_TOKEN) return { skip: 'VERCEL_OIDC_TOKEN is not set in this build' };
  const v = (k) => env[k].trim();
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return {
    subjectToken: env.VERCEL_OIDC_TOKEN,
    location,
    model: request.model,
    requestId: request.requestId,
    audience: `//iam.googleapis.com/projects/${v('GCP_PROJECT_NUMBER')}/locations/global/workloadIdentityPools/${v('GCP_WORKLOAD_IDENTITY_POOL_ID')}/providers/${v('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID')}`,
    impersonationUrl: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${v('GCP_SERVICE_ACCOUNT_EMAIL')}:generateAccessToken`,
    url: `https://${host}/v1/projects/${v('GCP_PROJECT_ID')}/locations/${location}/publishers/google/models/${request.model}:generateContent`,
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

/**
 * token → one generateContent. `lib` is google-auth-library (injected for tests). Returns the result object
 * (`{ skipped }` when nothing was called).
 */
async function runCheck(env, request, lib = require('google-auth-library'), fetchImpl = globalThis.fetch, now = () => new Date()) {
  const p = plan(env, request);
  const base = { checkedAt: now().toISOString(), env: env.VERCEL_ENV ?? null, ...(request.requestId ? { requestId: request.requestId } : {}) };
  if ('skip' in p) return { ...base, skipped: p.skip };

  const out = { ...base, transport: 'vertex', location: p.location, model: p.model, ok: false };
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

  let res;
  try {
    res = await fetchImpl(p.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
        generationConfig: { maxOutputTokens: 64, temperature: 0 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ...out, step: 'generate', error: err instanceof Error ? err.name : 'unknown' };
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const reason = reasonOf(text);
    return { ...out, step: 'generate', status: res.status, ...(reason ? { reason } : {}) };
  }
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    /* reported below */
  }
  const cand = j?.candidates?.[0];
  const reply = (cand?.content?.parts ?? []).map((x) => (typeof x?.text === 'string' ? x.text : '')).join('');
  const u = j?.usageMetadata ?? {};
  return {
    ...out,
    ok: Boolean(cand),
    step: 'generate',
    status: res.status,
    finishReason: typeof cand?.finishReason === 'string' ? cand.finishReason : null,
    reply: redact(reply, 40),
    ...(typeof j?.modelVersion === 'string' ? { modelVersion: redact(j.modelVersion, 60) } : {}),
    usage: {
      prompt: typeof u.promptTokenCount === 'number' ? u.promptTokenCount : null,
      output: typeof u.candidatesTokenCount === 'number' ? u.candidatesTokenCount : null,
      thoughts: typeof u.thoughtsTokenCount === 'number' ? u.thoughtsTokenCount : null,
      total: typeof u.totalTokenCount === 'number' ? u.totalTokenCount : null,
    },
  };
}

function line(result) {
  if (result.skipped) return `${PREFIX} skipped: ${result.skipped}`;
  const parts = [`ok=${result.ok}`, `model=${result.model}`, `location=${result.location}`, `step=${result.step}`];
  if (result.status) parts.push(`http=${result.status}`);
  if (result.reason) parts.push(`reason=${result.reason}`);
  if (result.finishReason) parts.push(`finish=${result.finishReason}`);
  if (result.usage?.total != null) parts.push(`tokens=${result.usage.total}`);
  return `${PREFIX} ${parts.join(' ')}`;
}

function writeResult(result, file = OUT_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  setTimeout(() => {
    console.log(`${PREFIX} ok=false timed out after ${HARD_TIMEOUT_MS / 1000}s`);
    process.exit(0);
  }, HARD_TIMEOUT_MS).unref();
  try {
    const request = readRequest();
    const result = await runCheck(process.env, request);
    console.log(line(result));
    // Only a requested check leaves a file behind; an ordinary build publishes nothing.
    if (!request.none && process.env.VERCEL_ENV === 'preview') writeResult(result);
  } catch (err) {
    console.log(`${PREFIX} ok=false crashed: ${redact(err instanceof Error ? err.message : String(err))}`);
  }
  process.exitCode = 0;
}

if (require.main === module) void main();

module.exports = { plan, runCheck, readRequest, line, redact, writeResult };

'use strict';
/**
 * GCP Part 0 "AUTH VERIFIED" from the build log — no sign-in, nothing billed.
 *
 * Runs before `next build` (vercel.json buildCommand). On a Vercel **Preview** build with VEO_TRANSPORT=vertex it
 * trades the build's Vercel OIDC token (VERCEL_OIDC_TOKEN, which Vercel sets in builds; functions get the
 * x-vercel-oidc-token header instead) at GCP STS, impersonates the Veo service account, lists one object of the Veo
 * bucket and signs one blob as the service account — the same three free calls as lib/veo/authCheck.ts, which the
 * admin provider probe runs at request time. A Preview build token carries the same `sub`
 * (…:environment:preview) as a Preview function token, so a pass here proves the pool, provider condition,
 * impersonation binding, bucket grant and signBlob role for the identity the Preview functions use.
 *
 * Prints ONE line, `[gcp-auth-check] …`: step names, the token's sub/environment claims and redacted errors —
 * never a token or a signature. Every other environment (Production, local, CI) is skipped. It never fails the
 * build: any error, and a hard timeout, end with exit code 0.
 */

const PREFIX = '[gcp-auth-check]';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TIMEOUT_MS = 8000;
const HARD_TIMEOUT_MS = 30000;

// Each value lands in a URL (STS audience, impersonation path, GCS path), so each is checked before use.
const PATTERNS = {
  GCP_PROJECT_NUMBER: /^\d{1,20}$/,
  GCP_WORKLOAD_IDENTITY_POOL_ID: /^[a-z0-9-]{4,32}$/,
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: /^[a-z0-9-]{4,32}$/,
  GCP_SERVICE_ACCOUNT_EMAIL: /^[a-z0-9-]{6,30}@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/,
};
const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/;

function redact(text, max = 200) {
  return String(text)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]')
    .replace(/ya29\.[\w.-]+/g, '[token]')
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[pem]')
    .replace(/([?&](?:X-Goog-Signature|X-Goog-Credential|access_token|token)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** STS / IAM Credentials / GCS error → "HTTP 403: PERMISSION_DENIED: …", redacted. */
function describe(err) {
  const e = err && typeof err === 'object' ? err : {};
  const status = typeof e.response?.status === 'number' ? e.response.status : undefined;
  let detail = '';
  const data = e.response?.data;
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') {
      detail = [data.error, typeof data.error_description === 'string' ? data.error_description : ''].filter(Boolean).join(': ');
    } else if (data.error && typeof data.error === 'object') {
      detail = [data.error.status, data.error.message].filter((x) => typeof x === 'string').join(': ');
    }
  }
  if (!detail) detail = typeof e.message === 'string' ? e.message : String(err);
  return `${status !== undefined ? `HTTP ${status}` : 'error'}: ${redact(detail)}`;
}

/** The non-secret claims of a JWT (payload only; the signature is never read or printed). */
function claimsOf(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(String(jwt).split('.')[1] ?? '', 'base64url').toString('utf8'));
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : '?',
      environment: typeof payload.environment === 'string' ? payload.environment : '?',
    };
  } catch {
    return { sub: '?', environment: '?' };
  }
}

/** Decide whether this build checks anything. Returns { skip } or the validated configuration. */
function plan(env) {
  if (env.VERCEL_ENV !== 'preview') return { skip: 'not a Vercel Preview build' };
  if (env.VEO_TRANSPORT !== 'vertex') return { skip: 'VEO_TRANSPORT is not vertex' };
  const bad = Object.keys(PATTERNS).filter((k) => !PATTERNS[k].test((env[k] ?? '').trim()));
  const bucket = (env.GCP_VEO_BUCKET ?? '').trim().replace(/^gs:\/\//, '').split('/')[0];
  if (!BUCKET_RE.test(bucket)) bad.push('GCP_VEO_BUCKET');
  if (bad.length) return { skip: `missing or invalid ${bad.join(',')}` };
  if (!env.VERCEL_OIDC_TOKEN) return { skip: 'VERCEL_OIDC_TOKEN is not set in this build' };
  const v = (k) => env[k].trim();
  return {
    subjectToken: env.VERCEL_OIDC_TOKEN,
    bucket,
    audience: `//iam.googleapis.com/projects/${v('GCP_PROJECT_NUMBER')}/locations/global/workloadIdentityPools/${v('GCP_WORKLOAD_IDENTITY_POOL_ID')}/providers/${v('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID')}`,
    impersonationUrl: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${v('GCP_SERVICE_ACCOUNT_EMAIL')}:generateAccessToken`,
  };
}

/**
 * token → bucket → sign, as lib/veo/authCheck.ts does. `lib` is google-auth-library (injected for tests).
 * Returns the one line to print.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain-node CommonJS build script
async function runCheck(env, lib = require('google-auth-library'), fetchImpl = globalThis.fetch) {
  const p = plan(env);
  if ('skip' in p) return `${PREFIX} skipped: ${p.skip}`;

  const claims = claimsOf(p.subjectToken);
  const head = `${PREFIX} env=${claims.environment} sub=${redact(claims.sub, 160)}`;
  const steps = ['mode:wif'];
  const client = lib.ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: p.audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: p.impersonationUrl,
    subject_token_supplier: { getSubjectToken: async () => p.subjectToken },
    scopes: [SCOPE],
  });
  if (!client) return `${head} ok=false mode:wif client:failed`;

  let accessToken;
  try {
    ({ token: accessToken } = await client.getAccessToken());
    if (!accessToken) throw new Error('no access token returned');
    steps.push('token:ok');
  } catch (err) {
    steps.push(`token:failed ${describe(err)}`);
    return `${head} ok=false ${steps.join(' ')}`;
  }

  let ok = true;
  try {
    const r = await fetchImpl(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(p.bucket)}/o?maxResults=1&fields=kind`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (r.ok) steps.push('bucket:ok');
    else {
      ok = false;
      const body = await r.text().catch(() => '');
      steps.push(`bucket:failed HTTP ${r.status} ${redact(body, 160)}`.trimEnd());
    }
  } catch (err) {
    ok = false;
    steps.push(`bucket:failed ${describe(err)}`);
  }

  try {
    await new lib.GoogleAuth({ authClient: client }).sign('myavatar-vertex-auth-check');
    steps.push('sign:ok');
  } catch (err) {
    ok = false;
    steps.push(`sign:failed ${describe(err)}`);
  }

  return `${head} ok=${ok} ${steps.join(' ')}`;
}

async function main() {
  setTimeout(() => {
    console.log(`${PREFIX} ok=false timed out after ${HARD_TIMEOUT_MS / 1000}s`);
    process.exit(0);
  }, HARD_TIMEOUT_MS).unref();
  try {
    console.log(await runCheck(process.env));
  } catch (err) {
    console.log(`${PREFIX} ok=false crashed: ${redact(err instanceof Error ? err.message : String(err))}`);
  }
  process.exitCode = 0;
}

if (require.main === module) void main();

module.exports = { plan, runCheck, redact, claimsOf };

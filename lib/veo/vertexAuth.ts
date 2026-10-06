/**
 * lib/veo/vertexAuth.ts — who we are to Vertex AI and Cloud Storage (docs/VEO_ENGINE.md §4, §5).
 *
 * Two auth modes, read from env and never logged:
 *   • wif (recommended, keyless) — Vercel OIDC token → GCP STS → service-account impersonation. The recipe is
 *     vercel.com/docs/oidc/gcp: ExternalAccountClient.fromJSON with a `subject_token_supplier` that returns the
 *     Vercel OIDC token of the current invocation.
 *   • service_account_key — a JSON key (base64 or raw) → a JWT client.
 * Scope: cloud-platform (Vertex AI predictLongRunning + Cloud Storage). One client per warm instance, rebuilt only
 * when the config it was built from changes.
 *
 * vertexConfig() is total: malformed env returns null (never throws) and vertexConfigProblems() names what is
 * missing or malformed — variable NAMES only, never values, so it is safe to show on an admin/health surface.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { ExternalAccountClient, GoogleAuth, JWT, type AuthClient } from 'google-auth-library';
import type { VertexConfig } from './types';

export const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
/** Veo on Vertex is served from us-central1 only (Google locations table, 2026-09). */
export const VEO_DEFAULT_LOCATION = 'us-central1';

const WIF_VARS = [
  'GCP_PROJECT_NUMBER',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
] as const;
type WifVar = (typeof WIF_VARS)[number];

const NO_AUTH_PROBLEM = `GCP_SERVICE_ACCOUNT_KEY or ${WIF_VARS.join(' + ')}`;

// Every value below is interpolated into a URL (Vertex host/path, STS audience, IAM impersonation path), so each is
// held to the character set Google documents for it — a stray '/', ':' or space would silently re-route the request.
const PROJECT_ID_RE = /^[a-z0-9][a-z0-9.:-]{0,99}$/; // incl. legacy domain-scoped ids and a bare project number
const LOCATION_RE = /^[a-z0-9-]{2,40}$/; // becomes the `{location}-aiplatform.googleapis.com` host label
const PROJECT_NUMBER_RE = /^\d{1,20}$/;
const POOL_ID_RE = /^[a-z0-9][a-z0-9-]{2,62}$/; // Google: 4–32 lowercase letters, digits, hyphens (kept lenient)
// No '/', ':', '?', '#', '%' or backslash, and exactly one '@': the email is placed RAW into the impersonation URL (a '?' or
// '#' would cut `:generateAccessToken` off the path). It must not be percent-encoded, because google-auth-library
// reads it back out of that URL for signBlob and the V4 X-Goog-Credential.
const EMAIL_RE = /^[^\s@/:?#%\\]+@[^\s@/:?#%\\]+\.[^\s@/:?#%\\]+$/;
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;
const PREFIX_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/** GCS bucket naming rules (lowercase letters, digits, '-', '_', '.'; starts and ends alphanumeric; 3–222 chars). */
export function isValidGcsBucketName(name: string): boolean {
  return BUCKET_NAME_RE.test(name) && !name.includes('..');
}

export type VertexAuthErrorCode = 'not_configured' | 'client_init_failed' | 'oidc_unavailable' | 'token_failed' | 'no_token';

/** Every failure this module raises. Messages are pre-sanitised: no tokens, keys, signed URLs or env values. */
export class VertexAuthError extends Error {
  readonly code: VertexAuthErrorCode;
  readonly status?: number;
  constructor(code: VertexAuthErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'VertexAuthError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

/**
 * Strip anything credential-shaped from text that may reach a log: PEM blocks, JWTs (the Vercel OIDC subject token
 * and signed assertions), OAuth access tokens, URL query strings (signed URLs, upload ids) and long base64 runs.
 * Google/gaxios errors carry the failed request's config — including the STS body with the subject token — so
 * callers must never forward a raw auth error; they forward this instead.
 */
export function redactSecrets(text: string, max = 240): string {
  return text
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[redacted-key]')
    .replace(/\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g, '[redacted-jwt]')
    .replace(/\bya29\.[\w.-]+/g, '[redacted-token]')
    .replace(/(https?:\/\/[^\s?#"']+)\?[^\s"']*/g, '$1?[redacted]')
    .replace(/[A-Za-z0-9+/_=-]{120,}/g, '[redacted-blob]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

interface ServiceAccountKey {
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
}

interface EnvReading {
  config: VertexConfig | null;
  problems: string[];
  /** Key material for the service_account_key mode — kept out of VertexConfig so the config itself is loggable. */
  key: ServiceAccountKey | null;
}

/** process.env or any plain map of it (NodeJS.ProcessEnv itself demands NODE_ENV under Next's typings). */
export type EnvSource = Readonly<Record<string, string | undefined>>;

const clean = (v: string | undefined): string => (v ?? '').trim();

/** Accepts `gs://bucket[/prefix]`, `bucket[/prefix]`. Returns the canonical `gs://bucket[/prefix]` or null. */
function normalizeBucket(raw: string): string | null {
  let rest = raw;
  if (/^gs:\/\//i.test(rest)) rest = rest.slice(5);
  else if (rest.includes('://')) return null; // https://storage.googleapis.com/… etc. — not a bucket reference
  const [bucket = '', ...segments] = rest.split('/');
  if (!isValidGcsBucketName(bucket)) return null;
  const parts = segments.filter((s) => s.length > 0);
  if (parts.some((s) => s === '.' || s === '..' || !PREFIX_SEGMENT_RE.test(s))) return null;
  return parts.length ? `gs://${bucket}/${parts.join('/')}` : `gs://${bucket}`;
}

/** Service-account JSON key: raw JSON, or base64/base64url of it (Node's base64 decoder accepts both alphabets). */
function parseServiceAccountKey(raw: string): ServiceAccountKey | null {
  const text = raw.trim();
  if (!text) return null;
  const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== undefined && o.type !== 'service_account') return null;
  const clientEmail = typeof o.client_email === 'string' ? o.client_email.trim() : '';
  let privateKey = typeof o.private_key === 'string' ? o.private_key : '';
  // A key pasted through a dashboard or shell often arrives double-escaped: literal "\n" pairs instead of newlines,
  // which PEM parsing rejects with an opaque "error:1E08010C:DECODER routines::unsupported".
  if (!privateKey.includes('\n') && privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (!EMAIL_RE.test(clientEmail) || !/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(privateKey)) return null;
  const privateKeyId = typeof o.private_key_id === 'string' && o.private_key_id ? o.private_key_id : undefined;
  return { clientEmail, privateKey, ...(privateKeyId ? { privateKeyId } : {}) };
}

function readVertexEnv(env: EnvSource, requireVeo = true): EnvReading {
  const problems: string[] = [];

  const projectId = clean(env.GCP_PROJECT_ID);
  if (!projectId) problems.push('GCP_PROJECT_ID');
  else if (!PROJECT_ID_RE.test(projectId)) problems.push('GCP_PROJECT_ID (malformed)');

  const locationVar = requireVeo ? 'GCP_VEO_LOCATION' : 'GCP_GEMINI_LOCATION';
  const location = clean(env[locationVar]) || (requireVeo ? VEO_DEFAULT_LOCATION : 'global');
  if (!LOCATION_RE.test(location)) problems.push(`${locationVar} (malformed)`);

  const bucketRaw = clean(env.GCP_VEO_BUCKET);
  const bucket = bucketRaw ? normalizeBucket(bucketRaw) : null;
  if (requireVeo && !bucketRaw) problems.push('GCP_VEO_BUCKET');
  else if (requireVeo && !bucket) problems.push('GCP_VEO_BUCKET (malformed)');

  const wif = Object.fromEntries(WIF_VARS.map((n) => [n, clean(env[n])])) as Record<WifVar, string>;
  const wifAny = WIF_VARS.some((n) => wif[n]);
  const wifMissing = WIF_VARS.filter((n) => !wif[n]);
  const wifMalformed = WIF_VARS.filter((n) => {
    const v = wif[n];
    if (!v) return false;
    if (n === 'GCP_PROJECT_NUMBER') return !PROJECT_NUMBER_RE.test(v);
    if (n === 'GCP_SERVICE_ACCOUNT_EMAIL') return !EMAIL_RE.test(v);
    return !POOL_ID_RE.test(v);
  });

  let auth: VertexConfig['auth'] | null = null;
  let key: ServiceAccountKey | null = null;
  // WIF wins when complete: it is the recommended mode and has no long-lived secret to leak.
  if (wifAny && !wifMissing.length && !wifMalformed.length) {
    auth = {
      mode: 'wif',
      projectNumber: wif.GCP_PROJECT_NUMBER,
      serviceAccountEmail: wif.GCP_SERVICE_ACCOUNT_EMAIL,
      poolId: wif.GCP_WORKLOAD_IDENTITY_POOL_ID,
      providerId: wif.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    };
  } else {
    const keyRaw = clean(env.GCP_SERVICE_ACCOUNT_KEY);
    key = keyRaw ? parseServiceAccountKey(keyRaw) : null;
    if (key) auth = { mode: 'service_account_key', clientEmail: key.clientEmail };
    else {
      if (wifAny) problems.push(...wifMissing, ...wifMalformed.map((n) => `${n} (malformed)`));
      if (keyRaw) problems.push('GCP_SERVICE_ACCOUNT_KEY (malformed)');
      if (!wifAny && !keyRaw) problems.push(NO_AUTH_PROBLEM);
    }
  }

  if (problems.length || !auth) return { config: null, problems, key: null };
  return { config: { projectId, location, bucket: bucket ?? '', auth }, problems: [], key };
}

/** Gemini needs project/auth only; its location is independent of Veo and it needs no storage bucket. */
export function vertexAiConfig(env: EnvSource = process.env): Omit<VertexConfig, 'bucket'> | null {
  const config = readVertexEnv(env, false).config;
  return config ? { projectId: config.projectId, location: config.location, auth: config.auth } : null;
}

export function vertexAiConfigProblems(env: EnvSource = process.env): string[] {
  return readVertexEnv(env, false).problems;
}

/** The Vertex transport's config, or null unless project, bucket and one auth mode are complete and well-formed. */
export function vertexConfig(env: EnvSource = process.env): VertexConfig | null {
  return readVertexEnv(env).config;
}

/** What keeps vertexConfig() null — env variable names (suffixed " (malformed)" when set but unusable). [] when complete. */
export function vertexConfigProblems(env: EnvSource = process.env): string[] {
  return readVertexEnv(env).problems;
}

/**
 * The Vercel OIDC token of the current invocation, fetched on every STS exchange (google-auth-library caches the
 * resulting GCP access token for its lifetime, so this runs roughly once an hour per warm instance).
 *
 * Deliberately called with NO arguments: the supplier receives `{ audience, subjectTokenType, transporter }`, and
 * @vercel/oidc ≥3.8 treats an `audience` option as "exchange the token for this audience" — passing the context
 * straight through (`getSubjectToken: getVercelOidcToken`) would trade the token for one GCP's provider rejects.
 */
async function vercelSubjectToken(): Promise<string> {
  let detail = 'empty token';
  try {
    const { getVercelOidcToken } = await import('@vercel/oidc');
    const token = await getVercelOidcToken();
    if (token) return token;
  } catch (err) {
    detail = redactSecrets(err instanceof Error ? err.message : String(err));
  }
  throw new VertexAuthError(
    'oidc_unavailable',
    `Vercel OIDC token unavailable (${detail}) — WIF needs a Vercel deployment with OIDC federation enabled`,
  );
}

interface BuiltClients {
  client: AuthClient;
  /**
   * What @google-cloud/storage must be given. A bare JWT cannot sign V4 URLs there: the signer reads `client_email`
   * via GoogleAuth.getCredentials(), which has no JWT branch and falls through to a GCE metadata probe →
   * "Unable to find credentials". Wrapping with `credentials` makes key-mode signing local (RSA, no network), and
   * for WIF GoogleAuth derives the service-account email from the impersonation URL and signs through IAM
   * signBlob (the service account needs roles/iam.serviceAccountTokenCreator on itself).
   */
  googleAuth: GoogleAuth;
}

function buildClients(config: VertexConfig, key: ServiceAccountKey | null): BuiltClients {
  const { auth } = config;
  if (auth.mode === 'wif') {
    const client = ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${auth.projectNumber}/locations/global/workloadIdentityPools/${auth.poolId}/providers/${auth.providerId}`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${auth.serviceAccountEmail}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: () => vercelSubjectToken() },
      scopes: [VERTEX_SCOPE],
    });
    if (!client) throw new VertexAuthError('client_init_failed', 'Vertex WIF client could not be built from the configuration');
    return { client, googleAuth: new GoogleAuth({ authClient: client, projectId: config.projectId }) };
  }
  if (!key) throw new VertexAuthError('client_init_failed', 'Vertex service-account key is missing');
  const client = new JWT({
    email: key.clientEmail,
    key: key.privateKey,
    ...(key.privateKeyId ? { keyId: key.privateKeyId } : {}),
    scopes: [VERTEX_SCOPE],
  });
  const googleAuth = new GoogleAuth({
    authClient: client,
    credentials: { client_email: key.clientEmail, private_key: key.privateKey },
    projectId: config.projectId,
  });
  return { client, googleAuth };
}

const memo: { veo: ({ fingerprint: string } & BuiltClients) | null; gemini: ({ fingerprint: string } & BuiltClients) | null } = { veo: null, gemini: null };

/** A digest of everything the clients are built from; a rotated key with the same email still changes it. */
function fingerprintOf(reading: EnvReading): string {
  return createHash('sha256')
    .update(JSON.stringify([reading.config, reading.key?.privateKey ?? '', reading.key?.privateKeyId ?? '']))
    .digest('hex');
}

function currentClients(requireVeo = true): BuiltClients {
  const reading = readVertexEnv(process.env, requireVeo);
  if (!reading.config) {
    throw new VertexAuthError('not_configured', `Vertex AI is not configured: ${reading.problems.join(', ')}`);
  }
  const fingerprint = fingerprintOf(reading);
  const slot = requireVeo ? 'veo' : 'gemini';
  const cached = memo[slot];
  if (cached && cached.fingerprint === fingerprint) return cached;
  const built = buildClients(reading.config, reading.key);
  memo[slot] = { fingerprint, ...built };
  return built;
}

/** The memoised Vertex auth client (IdentityPoolClient for WIF, JWT for a key). Throws VertexAuthError('not_configured'). */
export function getVertexAuthClient(requireVeo = true): AuthClient {
  return currentClients(requireVeo).client;
}

/** The same client wrapped for @google-cloud/storage, able to sign V4 URLs in both modes (see BuiltClients). */
export function getVertexGoogleAuth(): GoogleAuth {
  return currentClients().googleAuth;
}

function describeAuthFailure(err: unknown): { message: string; status?: number } {
  const e = (err && typeof err === 'object' ? err : {}) as {
    response?: { status?: unknown; data?: unknown };
    message?: unknown;
  };
  const status = typeof e.response?.status === 'number' ? e.response.status : undefined;
  let detail = '';
  const data = e.response?.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.error === 'string') {
      // STS: { error: 'invalid_grant', error_description: 'The audience in ID Token … does not match …' }
      detail = [d.error, typeof d.error_description === 'string' ? d.error_description : ''].filter(Boolean).join(': ');
    } else if (d.error && typeof d.error === 'object') {
      // IAM Credentials: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Permission … denied' } }
      const inner = d.error as Record<string, unknown>;
      detail = [inner.status, inner.message].filter((x): x is string => typeof x === 'string').join(': ');
    }
  }
  if (!detail && typeof e.message === 'string') detail = e.message;
  if (!detail && typeof err === 'string') detail = err;
  const head = status !== undefined ? `HTTP ${status}` : 'error';
  return { message: detail ? `${head}: ${redactSecrets(detail)}` : head, ...(status !== undefined ? { status } : {}) };
}

/** A bearer token for Vertex REST calls. google-auth-library caches and refreshes it, so call it per request. */
export async function getVertexAccessToken(requireVeo = true): Promise<string> {
  const client = getVertexAuthClient(requireVeo);
  let token: string | null | undefined;
  try {
    ({ token } = await client.getAccessToken());
  } catch (err) {
    if (err instanceof VertexAuthError) throw err;
    const { message, status } = describeAuthFailure(err);
    throw new VertexAuthError('token_failed', `Vertex access token request failed (${message})`, status);
  }
  if (!token) throw new VertexAuthError('no_token', 'Vertex auth returned no access token');
  return token;
}

/** Drops the memoised clients so the next call rebuilds from the current env. Tests only. */
export function __resetVertexAuthForTests(): void {
  memo.veo = null;
  memo.gemini = null;
}

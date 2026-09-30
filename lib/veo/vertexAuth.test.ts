/** @jest-environment node */
/**
 * vertexAuth against mocked google-auth-library + @vercel/oidc (no network). The rules under test are the contract
 * in docs/VEO_ENGINE.md §4–§5: env → VertexConfig (total, names-only problems), the Vercel OIDC → STS →
 * impersonation recipe, the lazily-called subject token, one memoised client per config, sanitised errors.
 */
jest.mock('server-only', () => ({}));

jest.mock('@vercel/oidc', () => ({ getVercelOidcToken: jest.fn() }));

jest.mock('google-auth-library', () => {
  class JWT {
    opts: Record<string, unknown>;
    getAccessToken = jest.fn();
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
    }
  }
  class GoogleAuth {
    opts: Record<string, unknown>;
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
    }
  }
  return { JWT, GoogleAuth, ExternalAccountClient: { fromJSON: jest.fn() } };
});

import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient, GoogleAuth, JWT } from 'google-auth-library';
import {
  VEO_DEFAULT_LOCATION,
  VERTEX_SCOPE,
  VertexAuthError,
  __resetVertexAuthForTests,
  getVertexAccessToken,
  getVertexAuthClient,
  getVertexGoogleAuth,
  isValidGcsBucketName,
  redactSecrets,
  vertexConfig,
  vertexConfigProblems,
} from './vertexAuth';

const oidc = getVercelOidcToken as jest.MockedFunction<typeof getVercelOidcToken>;
const fromJSON = ExternalAccountClient.fromJSON as unknown as jest.Mock;

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n';
const SA_EMAIL = 'veo-runner@my-proj.iam.gserviceaccount.com';
const keyJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'service_account', project_id: 'my-proj', private_key_id: 'kid-1', private_key: PEM, client_email: SA_EMAIL, ...over });
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

const BASE = { GCP_PROJECT_ID: 'my-proj', GCP_VEO_BUCKET: 'gs://my-bucket/veo-out' };
const WIF = {
  GCP_PROJECT_NUMBER: '123456789012',
  GCP_SERVICE_ACCOUNT_EMAIL: SA_EMAIL,
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const KEY = { GCP_SERVICE_ACCOUNT_KEY: b64(keyJson()) };

const ENV_NAMES = [
  'GCP_PROJECT_ID', 'GCP_VEO_LOCATION', 'GCP_VEO_BUCKET', 'GCP_SERVICE_ACCOUNT_KEY',
  'GCP_PROJECT_NUMBER', 'GCP_SERVICE_ACCOUNT_EMAIL', 'GCP_WORKLOAD_IDENTITY_POOL_ID', 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
] as const;
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const n of ENV_NAMES) saved[n] = process.env[n]; });
afterAll(() => {
  for (const n of ENV_NAMES) {
    if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n];
  }
});
function setEnv(vars: Record<string, string>) {
  for (const n of ENV_NAMES) delete process.env[n];
  Object.assign(process.env, vars);
}

const fakeExternalClient = () => ({ kind: 'external', getAccessToken: jest.fn() });

beforeEach(() => {
  __resetVertexAuthForTests();
  jest.clearAllMocks();
  fromJSON.mockImplementation(() => fakeExternalClient());
  setEnv({});
});

// ── vertexConfig ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('vertexConfig — env → config', () => {
  it('builds a WIF config with the us-central1 default and a canonical gs:// bucket', () => {
    expect(vertexConfig({ ...BASE, ...WIF })).toEqual({
      projectId: 'my-proj',
      location: 'us-central1',
      bucket: 'gs://my-bucket/veo-out',
      auth: { mode: 'wif', projectNumber: '123456789012', serviceAccountEmail: SA_EMAIL, poolId: 'vercel-pool', providerId: 'vercel-provider' },
    });
    expect(VEO_DEFAULT_LOCATION).toBe('us-central1');
  });

  it('honours GCP_VEO_LOCATION and trims whitespace around every value', () => {
    const cfg = vertexConfig({ GCP_PROJECT_ID: '  my-proj ', GCP_VEO_BUCKET: ' my-bucket ', GCP_VEO_LOCATION: ' europe-west4 ', ...KEY });
    expect(cfg).toMatchObject({ projectId: 'my-proj', bucket: 'gs://my-bucket', location: 'europe-west4' });
  });

  it.each([
    ['my-bucket', 'gs://my-bucket'],
    ['gs://my-bucket', 'gs://my-bucket'],
    ['gs://my-bucket/', 'gs://my-bucket'],
    ['gs://my-bucket/a/b', 'gs://my-bucket/a/b'],
    ['gs://my-bucket//a//b/', 'gs://my-bucket/a/b'],
    ['GS://my-bucket/p', 'gs://my-bucket/p'],
    ['my-bucket/p', 'gs://my-bucket/p'],
    ['my.dotted_bucket-1', 'gs://my.dotted_bucket-1'],
  ])('accepts bucket %p as %p', (raw, canonical) => {
    expect(vertexConfig({ ...BASE, GCP_VEO_BUCKET: raw, ...KEY })?.bucket).toBe(canonical);
  });

  it.each([
    ['https://storage.googleapis.com/my-bucket'],
    ['gs://'],
    ['gs://My-Bucket'],
    ['gs://ab'],
    ['gs://-bucket'],
    ['gs://my-bucket/../etc'],
    ['gs://my-bucket/a b'],
    ['gs://my..bucket'],
  ])('rejects malformed bucket %p without throwing', (raw) => {
    const env = { ...BASE, GCP_VEO_BUCKET: raw, ...KEY };
    expect(vertexConfig(env)).toBeNull();
    expect(vertexConfigProblems(env)).toEqual(['GCP_VEO_BUCKET (malformed)']);
  });

  it('decodes a base64 key, and accepts raw JSON too', () => {
    const auth = { mode: 'service_account_key', clientEmail: SA_EMAIL };
    expect(vertexConfig({ ...BASE, ...KEY })?.auth).toEqual(auth);
    expect(vertexConfig({ ...BASE, GCP_SERVICE_ACCOUNT_KEY: keyJson() })?.auth).toEqual(auth);
    expect(vertexConfig({ ...BASE, GCP_SERVICE_ACCOUNT_KEY: Buffer.from(keyJson()).toString('base64url') })?.auth).toEqual(auth);
  });

  it('accepts line-wrapped base64 (the `base64` CLI wraps at 76 columns)', () => {
    const wrapped = (b64(keyJson()).match(/.{1,76}/g) ?? []).join('\n');
    expect(vertexConfig({ ...BASE, GCP_SERVICE_ACCOUNT_KEY: wrapped })?.auth.mode).toBe('service_account_key');
  });

  it('never exposes key material in the config', () => {
    const cfg = vertexConfig({ ...BASE, ...KEY });
    expect(JSON.stringify(cfg)).not.toContain('PRIVATE KEY');
  });

  it('prefers WIF over a key when both are complete (keyless is the recommended mode)', () => {
    expect(vertexConfig({ ...BASE, ...WIF, ...KEY })?.auth.mode).toBe('wif');
  });

  it('falls back to a valid key when the WIF set is only partial', () => {
    const { GCP_WORKLOAD_IDENTITY_POOL_ID: _omit, ...partial } = WIF;
    const env = { ...BASE, ...partial, ...KEY };
    expect(vertexConfig(env)?.auth.mode).toBe('service_account_key');
    expect(vertexConfigProblems(env)).toEqual([]);
  });
});

describe('vertexConfigProblems — names only, never throws', () => {
  it('lists every missing piece when nothing is set', () => {
    expect(vertexConfig({})).toBeNull();
    expect(vertexConfigProblems({})).toEqual([
      'GCP_PROJECT_ID',
      'GCP_VEO_BUCKET',
      'GCP_SERVICE_ACCOUNT_KEY or GCP_PROJECT_NUMBER + GCP_SERVICE_ACCOUNT_EMAIL + GCP_WORKLOAD_IDENTITY_POOL_ID + GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
    ]);
  });

  it('names exactly the missing WIF variables of a partial set', () => {
    expect(vertexConfigProblems({ ...BASE, GCP_PROJECT_NUMBER: '1', GCP_SERVICE_ACCOUNT_EMAIL: SA_EMAIL })).toEqual([
      'GCP_WORKLOAD_IDENTITY_POOL_ID',
      'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
    ]);
  });

  it.each([
    ['GCP_PROJECT_NUMBER', 'proj-123'],
    ['GCP_SERVICE_ACCOUNT_EMAIL', 'evil@x.com/../../other'],
    ['GCP_SERVICE_ACCOUNT_EMAIL', 'not-an-email'],
    ['GCP_SERVICE_ACCOUNT_EMAIL', 'veo?x@my-proj.iam.gserviceaccount.com'],
    ['GCP_SERVICE_ACCOUNT_EMAIL', 'veo@my-proj.iam.gserviceaccount.com#frag'],
    ['GCP_SERVICE_ACCOUNT_EMAIL', 'veo%2F@my-proj.iam.gserviceaccount.com'],
    ['GCP_WORKLOAD_IDENTITY_POOL_ID', 'Pool With Spaces'],
    ['GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', 'prov/../x'],
  ])('flags a malformed %s (it is interpolated into a URL)', (name, value) => {
    const env = { ...BASE, ...WIF, [name]: value };
    expect(vertexConfig(env)).toBeNull();
    expect(vertexConfigProblems(env)).toEqual([`${name} (malformed)`]);
  });

  it.each([
    ['garbage base64', '%%%not-base64%%%'],
    ['base64 of non-JSON', b64('hello world')],
    ['a JSON array', b64('[1,2]')],
    ['no private_key', b64(keyJson({ private_key: undefined }))],
    ['a non-PEM private_key', b64(keyJson({ private_key: 'abc' }))],
    ['a bad client_email', b64(keyJson({ client_email: 'nope' }))],
    ['an authorized_user credential', b64(keyJson({ type: 'authorized_user' }))],
    ['truncated raw JSON', keyJson().slice(0, 40)],
  ])('flags a malformed key (%s) and never throws', (_label, value) => {
    const env = { ...BASE, GCP_SERVICE_ACCOUNT_KEY: value };
    expect(() => vertexConfig(env)).not.toThrow();
    expect(vertexConfig(env)).toBeNull();
    expect(vertexConfigProblems(env)).toEqual(['GCP_SERVICE_ACCOUNT_KEY (malformed)']);
  });

  it('repairs a double-escaped private key ("\\n" pairs instead of newlines)', () => {
    const escaped = keyJson({ private_key: PEM.replace(/\n/g, '\\n') });
    expect(vertexConfig({ ...BASE, GCP_SERVICE_ACCOUNT_KEY: escaped })?.auth.mode).toBe('service_account_key');
  });

  it('flags malformed project id and location', () => {
    expect(vertexConfigProblems({ ...BASE, ...KEY, GCP_PROJECT_ID: 'My Project' })).toEqual(['GCP_PROJECT_ID (malformed)']);
    expect(vertexConfigProblems({ ...BASE, ...KEY, GCP_VEO_LOCATION: 'us central1' })).toEqual(['GCP_VEO_LOCATION (malformed)']);
    expect(vertexConfigProblems({ ...BASE, ...KEY, GCP_VEO_LOCATION: 'evil.com/x' })).toEqual(['GCP_VEO_LOCATION (malformed)']);
  });

  it('never echoes a value — only names', () => {
    const env = {
      GCP_PROJECT_ID: 'SECRET PROJECT', GCP_VEO_BUCKET: 'https://SECRET-BUCKET',
      GCP_SERVICE_ACCOUNT_KEY: 'SECRET-KEY-MATERIAL', GCP_SERVICE_ACCOUNT_EMAIL: 'SECRET-EMAIL',
    };
    const text = vertexConfigProblems(env).join(' | ');
    expect(text).not.toMatch(/SECRET/);
    expect(text).toContain('GCP_PROJECT_ID (malformed)');
  });

  it('is [] exactly when vertexConfig() is non-null', () => {
    const envs = [{}, BASE, { ...BASE, ...WIF }, { ...BASE, ...KEY }, { ...WIF }, { ...BASE, GCP_PROJECT_NUMBER: '1' }];
    for (const env of envs) expect(vertexConfigProblems(env).length === 0).toBe(vertexConfig(env) !== null);
  });

  it('reads process.env by default', () => {
    setEnv({ ...BASE, ...WIF });
    expect(vertexConfig()?.auth.mode).toBe('wif');
    expect(vertexConfigProblems()).toEqual([]);
  });
});

describe('isValidGcsBucketName', () => {
  it('follows the GCS naming rules', () => {
    for (const ok of ['abc', 'my-bucket', 'my_bucket.v2', 'a1b']) expect(isValidGcsBucketName(ok)).toBe(true);
    for (const bad of ['ab', 'Abc', '-abc', 'abc-', 'a..b', 'a/b', '', 'a b']) expect(isValidGcsBucketName(bad)).toBe(false);
  });
});

// ── clients ───────────────────────────────────────────────────────────────────────────────────────────────────────

describe('getVertexAuthClient — Workload Identity Federation', () => {
  beforeEach(() => setEnv({ ...BASE, ...WIF }));

  it('builds the documented Vercel → STS → impersonation client with the cloud-platform scope', () => {
    const client = getVertexAuthClient();
    expect(fromJSON).toHaveBeenCalledTimes(1);
    const opts = fromJSON.mock.calls[0][0];
    expect(opts).toMatchObject({
      type: 'external_account',
      audience: '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA_EMAIL}:generateAccessToken`,
      scopes: [VERTEX_SCOPE],
    });
    expect(VERTEX_SCOPE).toBe('https://www.googleapis.com/auth/cloud-platform');
    expect(client).toBe(fromJSON.mock.results[0]?.value);
  });

  it('does not touch the Vercel OIDC token at import or construction — only per token fetch', async () => {
    getVertexAuthClient();
    expect(oidc).not.toHaveBeenCalled();
    oidc.mockResolvedValueOnce('vercel-oidc-jwt');
    const supplier = fromJSON.mock.calls[0][0].subject_token_supplier;
    await expect(supplier.getSubjectToken({ audience: 'x', subjectTokenType: 'y', transporter: {} })).resolves.toBe('vercel-oidc-jwt');
    expect(oidc).toHaveBeenCalledTimes(1);
  });

  it('calls getVercelOidcToken with NO arguments (an audience option would trigger a token exchange)', async () => {
    getVertexAuthClient();
    oidc.mockResolvedValueOnce('t');
    const supplier = fromJSON.mock.calls[0][0].subject_token_supplier;
    await supplier.getSubjectToken({ audience: '//iam.googleapis.com/…', subjectTokenType: 'jwt', transporter: {} });
    expect(oidc.mock.calls[0]).toEqual([]);
  });

  it('turns a missing OIDC token into VertexAuthError(oidc_unavailable) without leaking token text', async () => {
    getVertexAuthClient();
    const supplier = fromJSON.mock.calls[0][0].subject_token_supplier;
    oidc.mockRejectedValueOnce(new Error("The 'x-vercel-oidc-token' header is missing eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig"));
    const err = await supplier.getSubjectToken({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VertexAuthError);
    expect((err as VertexAuthError).code).toBe('oidc_unavailable');
    expect((err as VertexAuthError).message).toContain('x-vercel-oidc-token');
    expect((err as VertexAuthError).message).not.toContain('eyJzdWIiOiJ4In0');
    oidc.mockResolvedValueOnce('');
    await expect(supplier.getSubjectToken({})).rejects.toMatchObject({ code: 'oidc_unavailable' });
  });

  it('wraps the client in a GoogleAuth for Storage (WIF signs through IAM signBlob)', () => {
    const ga = getVertexGoogleAuth() as unknown as { opts: Record<string, unknown> };
    expect(ga).toBeInstanceOf(GoogleAuth);
    expect(ga.opts).toEqual({ authClient: getVertexAuthClient(), projectId: 'my-proj' });
  });

  it('fails loudly when google-auth-library rejects the options', () => {
    fromJSON.mockReturnValueOnce(null);
    expect(() => getVertexAuthClient()).toThrow(expect.objectContaining({ code: 'client_init_failed' }));
  });
});

describe('getVertexAuthClient — service-account key', () => {
  beforeEach(() => setEnv({ ...BASE, ...KEY }));

  it('builds a JWT with the key, key id and cloud-platform scope', () => {
    const client = getVertexAuthClient() as unknown as { opts: Record<string, unknown> };
    expect(client).toBeInstanceOf(JWT);
    expect(client.opts).toEqual({ email: SA_EMAIL, key: PEM, keyId: 'kid-1', scopes: [VERTEX_SCOPE] });
    expect(fromJSON).not.toHaveBeenCalled();
  });

  it('gives Storage a GoogleAuth that carries client_email + private_key so V4 URLs sign locally', () => {
    const ga = getVertexGoogleAuth() as unknown as { opts: Record<string, unknown> };
    expect(ga.opts).toEqual({
      authClient: getVertexAuthClient(),
      credentials: { client_email: SA_EMAIL, private_key: PEM },
      projectId: 'my-proj',
    });
  });
});

describe('memoisation', () => {
  it('returns one client per warm instance', () => {
    setEnv({ ...BASE, ...WIF });
    const a = getVertexAuthClient();
    expect(getVertexAuthClient()).toBe(a);
    expect(getVertexGoogleAuth()).toBe(getVertexGoogleAuth());
    expect(fromJSON).toHaveBeenCalledTimes(1);
  });

  it('rebuilds when the config changes', () => {
    setEnv({ ...BASE, ...WIF });
    const a = getVertexAuthClient();
    process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'other@my-proj.iam.gserviceaccount.com';
    const b = getVertexAuthClient();
    expect(b).not.toBe(a);
    expect(fromJSON).toHaveBeenCalledTimes(2);
  });

  it('rebuilds when a key is rotated even though the email is unchanged', () => {
    setEnv({ ...BASE, ...KEY });
    const a = getVertexAuthClient();
    process.env.GCP_SERVICE_ACCOUNT_KEY = b64(keyJson({ private_key: PEM.replace('MIIEvQ', 'MIIEvR'), private_key_id: 'kid-2' }));
    expect(getVertexAuthClient()).not.toBe(a);
  });

  it('switches mode when the env switches mode', () => {
    setEnv({ ...BASE, ...KEY });
    expect(getVertexAuthClient()).toBeInstanceOf(JWT);
    setEnv({ ...BASE, ...WIF });
    expect(getVertexAuthClient()).not.toBeInstanceOf(JWT);
  });

  it('__resetVertexAuthForTests drops the memo', () => {
    setEnv({ ...BASE, ...WIF });
    const a = getVertexAuthClient();
    __resetVertexAuthForTests();
    expect(getVertexAuthClient()).not.toBe(a);
  });
});

describe('not configured', () => {
  it('throws VertexAuthError(not_configured) naming the missing variables, not their values', () => {
    setEnv({ GCP_PROJECT_ID: 'my-proj', GCP_SERVICE_ACCOUNT_KEY: 'SECRET-MATERIAL' });
    const err = (() => { try { getVertexAuthClient(); } catch (e) { return e; } return null; })() as VertexAuthError;
    expect(err).toBeInstanceOf(VertexAuthError);
    expect(err.code).toBe('not_configured');
    expect(err.message).toContain('GCP_VEO_BUCKET');
    expect(err.message).toContain('GCP_SERVICE_ACCOUNT_KEY (malformed)');
    expect(err.message).not.toContain('SECRET');
    expect(fromJSON).not.toHaveBeenCalled();
  });

  it('getVertexAccessToken rejects the same way', async () => {
    await expect(getVertexAccessToken()).rejects.toMatchObject({ code: 'not_configured' });
  });
});

// ── tokens ────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('getVertexAccessToken', () => {
  const clientWith = (impl: () => Promise<unknown>) => {
    const client = { getAccessToken: jest.fn(impl) };
    fromJSON.mockReturnValueOnce(client);
    return client;
  };
  beforeEach(() => setEnv({ ...BASE, ...WIF }));

  it('returns the bearer token from the auth client', async () => {
    const client = clientWith(async () => ({ token: 'ya29.access-token' }));
    await expect(getVertexAccessToken()).resolves.toBe('ya29.access-token');
    expect(client.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty token as no_token', async () => {
    clientWith(async () => ({ token: null }));
    await expect(getVertexAccessToken()).rejects.toMatchObject({ code: 'no_token' });
  });

  it('passes a VertexAuthError from the subject-token supplier through unchanged', async () => {
    const inner = new VertexAuthError('oidc_unavailable', 'Vercel OIDC token unavailable');
    clientWith(async () => { throw inner; });
    await expect(getVertexAccessToken()).rejects.toBe(inner);
  });

  it('sanitises an STS failure: keeps status + OAuth error, drops the subject token in the request config', async () => {
    clientWith(async () => {
      throw Object.assign(new Error('request failed'), {
        config: { data: 'subject_token=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ2ZXJjZWwifQ.c2ln' },
        response: { status: 400, data: { error: 'invalid_grant', error_description: 'The audience in ID Token does not match the expected audience.' } },
      });
    });
    const err = (await getVertexAccessToken().catch((e: unknown) => e)) as VertexAuthError;
    expect(err).toBeInstanceOf(VertexAuthError);
    expect(err.code).toBe('token_failed');
    expect(err.status).toBe(400);
    expect(err.message).toContain('HTTP 400');
    expect(err.message).toContain('invalid_grant');
    expect(err.message).toContain('audience');
    expect(err.message).not.toMatch(/eyJ|subject_token/);
  });

  it('sanitises an IAM impersonation 403 into status + reason', async () => {
    clientWith(async () => {
      throw Object.assign(new Error('x'), {
        response: { status: 403, data: { error: { code: 403, status: 'PERMISSION_DENIED', message: "Permission 'iam.serviceAccounts.getAccessToken' denied" } } },
      });
    });
    await expect(getVertexAccessToken()).rejects.toMatchObject({
      code: 'token_failed',
      status: 403,
      message: expect.stringContaining('PERMISSION_DENIED'),
    });
  });

  it('redacts token-shaped text from a plain error message', async () => {
    clientWith(async () => { throw new Error('boom ya29.a0AfH6SMBsecret and -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'); });
    const err = (await getVertexAccessToken().catch((e: unknown) => e)) as VertexAuthError;
    expect(err.message).toContain('boom');
    expect(err.message).not.toMatch(/ya29\.a0|PRIVATE KEY|abc/);
    expect(err.status).toBeUndefined();
  });
});

describe('redactSecrets', () => {
  it('strips JWTs, access tokens, PEM keys, URL queries and long base64 runs', () => {
    const text = [
      'jwt eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig',
      'tok ya29.a0Af-secret',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----',
      'url https://storage.googleapis.com/b/o.mp4?X-Goog-Signature=deadbeef&X-Goog-Credential=x',
      `b64 ${'A'.repeat(200)}`,
    ].join(' ');
    const out = redactSecrets(text, 1000);
    expect(out).not.toMatch(/eyJzdWIi|ya29\.a0|MIIE|deadbeef|AAAAAAAAAA/);
    expect(out).toContain('https://storage.googleapis.com/b/o.mp4?[redacted]');
  });

  it('truncates to the requested length', () => {
    expect(redactSecrets('x '.repeat(500), 50).length).toBeLessThanOrEqual(50);
  });
});

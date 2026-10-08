/** @jest-environment node */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { plan, runCheck, redact, claimsOf } = require('./preview-auth-check.cjs');

const jwtOf = (claims: object) =>
  `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.c2lnbmF0dXJlLW5ldmVyLXByaW50ZWQ`;
const OIDC = jwtOf({
  sub: 'owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview',
  environment: 'preview',
});
const ACCESS = 'ya29.access-token-never-printed';

const ENV = {
  VERCEL_ENV: 'preview',
  VEO_TRANSPORT: 'vertex',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-oidc',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_VEO_BUCKET: 'gs://myavatar-veo-outputs',
  VERCEL_OIDC_TOKEN: OIDC,
};

type Outcome = { token?: unknown; bucket?: number; sign?: unknown };

function fakes(outcome: Outcome = {}) {
  const seen: { config?: Record<string, unknown>; subject?: string; auth?: string; url?: string } = {};
  const lib = {
    ExternalAccountClient: {
      fromJSON(config: Record<string, unknown>) {
        seen.config = config;
        return {
          async getAccessToken() {
            seen.subject = await (config.subject_token_supplier as { getSubjectToken: () => Promise<string> }).getSubjectToken();
            if (outcome.token) throw outcome.token;
            return { token: ACCESS };
          },
        };
      },
    },
    GoogleAuth: class {
      async sign() {
        if (outcome.sign) throw outcome.sign;
        return 'signature-never-printed';
      }
    },
  };
  const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
    seen.url = url;
    seen.auth = init.headers.Authorization;
    const status = outcome.bucket ?? 200;
    return { ok: status === 200, status, text: async () => `{"error":{"message":"denied ${ACCESS}"}}` };
  };
  return { lib, fetchImpl, seen };
}

const neverLeaks = (line: string) => {
  expect(line).not.toContain(OIDC);
  expect(line).not.toContain('c2lnbmF0dXJl');
  expect(line).not.toContain(ACCESS);
  expect(line).not.toContain('signature-never-printed');
};

describe('preview-auth-check plan', () => {
  it('skips everything that is not a Vercel Preview build on the Vertex transport', () => {
    expect(plan({ ...ENV, VERCEL_ENV: 'production' })).toEqual({ skip: 'not a Vercel Preview build' });
    expect(plan({})).toEqual({ skip: 'not a Vercel Preview build' });
    expect(plan({ ...ENV, VEO_TRANSPORT: 'gemini' })).toEqual({ skip: 'VEO_TRANSPORT is not vertex' });
    expect(plan({ ...ENV, VERCEL_OIDC_TOKEN: '' })).toEqual({ skip: 'VERCEL_OIDC_TOKEN is not set in this build' });
  });

  it('refuses values that would be interpolated into a URL unchecked', () => {
    const p = plan({ ...ENV, GCP_SERVICE_ACCOUNT_EMAIL: 'sa@x.iam.gserviceaccount.com/../evil', GCP_VEO_BUCKET: 'gs://Bad_Bucket' });
    expect(p.skip).toBe('missing or invalid GCP_SERVICE_ACCOUNT_EMAIL,GCP_VEO_BUCKET');
  });

  it('builds the STS audience and impersonation URL the app uses', () => {
    const p = plan(ENV);
    expect(p.audience).toBe('//iam.googleapis.com/projects/467145118875/locations/global/workloadIdentityPools/vercel/providers/vercel-oidc');
    expect(p.impersonationUrl).toBe(
      'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com:generateAccessToken',
    );
    expect(p.bucket).toBe('myavatar-veo-outputs');
  });
});

describe('preview-auth-check runCheck', () => {
  it('reports token, bucket and sign ok with the token claims, and passes the build token to STS', async () => {
    const { lib, fetchImpl, seen } = fakes();
    const line = await runCheck(ENV, lib, fetchImpl);
    expect(line).toBe(
      '[gcp-auth-check] env=preview sub=owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview ok=true mode:wif token:ok bucket:ok sign:ok',
    );
    expect(seen.subject).toBe(OIDC);
    expect(seen.config?.token_url).toBe('https://sts.googleapis.com/v1/token');
    expect(seen.config?.scopes).toEqual(['https://www.googleapis.com/auth/cloud-platform']);
    expect(seen.url).toBe('https://storage.googleapis.com/storage/v1/b/myavatar-veo-outputs/o?maxResults=1&fields=kind');
    expect(seen.auth).toBe(`Bearer ${ACCESS}`);
    neverLeaks(line);
  });

  it('stops at a refused STS exchange and prints the redacted reason', async () => {
    const stsError = {
      response: { status: 400, data: { error: 'invalid_grant', error_description: `The audience in ID Token ${OIDC} does not match` } },
    };
    const { lib, fetchImpl, seen } = fakes({ token: stsError });
    const line = await runCheck(ENV, lib, fetchImpl);
    expect(line).toContain('ok=false mode:wif token:failed HTTP 400: invalid_grant: The audience in ID Token [jwt] does not match');
    expect(line).not.toContain('bucket:');
    expect(seen.url).toBeUndefined();
    neverLeaks(line);
  });

  it('reports a bucket or sign failure without hiding the other step', async () => {
    const signError = { response: { status: 403, data: { error: { status: 'PERMISSION_DENIED', message: 'iam.serviceAccounts.signBlob denied' } } } };
    const { lib, fetchImpl } = fakes({ bucket: 403, sign: signError });
    const line = await runCheck(ENV, lib, fetchImpl);
    expect(line).toContain('ok=false mode:wif token:ok bucket:failed HTTP 403');
    expect(line).toContain('sign:failed HTTP 403: PERMISSION_DENIED: iam.serviceAccounts.signBlob denied');
    neverLeaks(line);
  });

  it('prints a skip line instead of calling Google outside Preview', async () => {
    const { lib, fetchImpl, seen } = fakes();
    expect(await runCheck({ ...ENV, VERCEL_ENV: 'production' }, lib, fetchImpl)).toBe('[gcp-auth-check] skipped: not a Vercel Preview build');
    expect(seen.config).toBeUndefined();
  });
});

describe('preview-auth-check helpers', () => {
  it('reads only non-secret claims and survives a malformed token', () => {
    expect(claimsOf(OIDC)).toEqual({
      sub: 'owner:kintsurashviligaga-ops-projects:project:avatar-g-frontend-v3:environment:preview',
      environment: 'preview',
    });
    expect(claimsOf('not-a-jwt')).toEqual({ sub: '?', environment: '?' });
  });

  it('redacts JWTs, access tokens, PEM blocks and signed-URL credentials', () => {
    expect(redact(`a ${OIDC} b ${ACCESS} c`)).toBe('a [jwt] b [token] c');
    expect(redact('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----')).toBe('[pem]');
    expect(redact('https://x/y?X-Goog-Signature=abc&X-Goog-Credential=def')).toBe('https://x/y?X-Goog-Signature=[redacted]&X-Goog-Credential=[redacted]');
  });
});

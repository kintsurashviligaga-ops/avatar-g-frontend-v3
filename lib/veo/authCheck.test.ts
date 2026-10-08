/** @jest-environment node */
/**
 * checkVertexAuth — the keyless chain check behind the admin provider probe: token (STS + impersonation), one bucket
 * listing, one IAM signBlob. No network: vertexAuth's token/sign/config functions are mocked, fetch is scripted.
 * The token must never appear in what the check returns.
 */
jest.mock('server-only', () => ({}));

const mockVertexConfig = jest.fn();
const mockGetToken = jest.fn();
const mockSign = jest.fn();
jest.mock('./vertexAuth', () => {
  const actual = jest.requireActual('./vertexAuth');
  return {
    ...actual,
    vertexConfig: () => mockVertexConfig(),
    getVertexAccessToken: () => mockGetToken(),
    getVertexGoogleAuth: () => ({ sign: (d: string) => mockSign(d) }),
  };
});

import { checkVertexAuth } from './authCheck';
import { VertexAuthError } from './vertexAuth';

const TOKEN = 'ya29.a0-secret-token-value';
const config = {
  projectId: 'gen-lang-client-0671348730',
  location: 'us-central1',
  bucket: 'gs://myavatar-veo-outputs/veo',
  auth: { mode: 'wif', projectNumber: '467145118875', serviceAccountEmail: 'sa@p.iam.gserviceaccount.com', poolId: 'vercel', providerId: 'vercel-oidc' },
};

function response(status: number, body = ''): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  mockVertexConfig.mockReset().mockReturnValue(config);
  mockGetToken.mockReset().mockResolvedValue(TOKEN);
  mockSign.mockReset().mockResolvedValue('c2lnbmF0dXJl');
});

describe('checkVertexAuth', () => {
  it('reports every step ok and lists the bucket with the impersonated token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, '{"kind":"storage#objects"}'));
    const result = await checkVertexAuth(fetchImpl);
    expect(result).toEqual({ ok: true, steps: ['mode:wif', 'token:ok', 'bucket:ok', 'sign:ok'] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://storage.googleapis.com/storage/v1/b/myavatar-veo-outputs/o?maxResults=1&fields=kind');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(mockSign).toHaveBeenCalledTimes(1);
  });

  it('stops at config when Vertex is not configured', async () => {
    mockVertexConfig.mockReturnValue(null);
    const fetchImpl = jest.fn();
    expect(await checkVertexAuth(fetchImpl)).toEqual({ ok: false, steps: ['config:missing'] });
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops after a failed token exchange and names the error code', async () => {
    mockGetToken.mockRejectedValue(
      new VertexAuthError('token_failed', 'Vertex access token request failed (HTTP 400: invalid_grant: audience mismatch)', 400),
    );
    const fetchImpl = jest.fn();
    const result = await checkVertexAuth(fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.steps[1]).toMatch(/^token:failed token_failed: .*invalid_grant/);
    expect(result.steps).toHaveLength(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('reports a bucket permission failure and still checks signing', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(403, 'sa does not have storage.objects.list access'));
    const result = await checkVertexAuth(fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.steps).toEqual(['mode:wif', 'token:ok', 'bucket:failed HTTP 403 sa does not have storage.objects.list access', 'sign:ok']);
  });

  it('reports a signBlob failure', async () => {
    mockSign.mockRejectedValue(new Error('Permission iam.serviceAccounts.signBlob denied'));
    const fetchImpl = jest.fn().mockResolvedValue(response(200));
    const result = await checkVertexAuth(fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.steps[3]).toBe('sign:failed Permission iam.serviceAccounts.signBlob denied');
  });

  it('never returns the token, even when an error echoes it', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(401, `invalid credentials ${TOKEN}`));
    mockSign.mockRejectedValue(new Error(`signing with ${TOKEN} failed`));
    const result = await checkVertexAuth(fetchImpl);
    expect(JSON.stringify(result)).not.toContain('secret-token-value');
  });
});

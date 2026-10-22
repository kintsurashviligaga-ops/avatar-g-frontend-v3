/** @jest-environment node */
/**
 * runProviderHealthAudit({ live: true }) against a scripted global fetch — no network. Gemini runs on Vertex AI only
 * (MASTER TASK v3.1), so its row reports Vertex readiness: the policy, the variable names and a minted Workload
 * Identity token. It calls no model and bills nothing, and an AI Studio key, set or not, is never sent anywhere.
 * A probe's thrown message can never carry its key into `detail` (served by /api/app/health). Probes run side by side
 * under a deadline, so one hung vendor can no longer time the whole audit out.
 */
jest.mock('server-only', () => ({}));
jest.mock('../chat/ltxKey', () => ({ resolveLtxApiKey: () => null }));
jest.mock('../chat/mediaKeys', () => ({ resolveUdioApiKey: () => null }));
const mockToken = jest.fn(async (_requireVeo?: boolean) => 'ya29.test-token');
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: (requireVeo?: boolean) => mockToken(requireVeo),
}));

import { runProviderHealthAudit } from './provider-health';
import { VertexAuthError } from '../veo/vertexAuth';

const AI_STUDIO_KEY = 'AQ.test-health-key-0123456789abcdef';
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV_VARS = [
  'OPENAI_API_KEY', 'WORLDLABS_API_KEY', 'HEYGEN_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_TRANSPORT',
  ...Object.keys(VERTEX_ENV),
] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  for (const k of ENV_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, VERTEX_ENV);
  process.env.GEMINI_API_KEY = AI_STUDIO_KEY; // present on purpose: it must change nothing
  mockToken.mockReset().mockResolvedValue('ya29.test-token');
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of ENV_VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const gemini = async (opts: { deadlineMs?: number; live?: boolean } = {}) =>
  (await runProviderHealthAudit({ live: true, ...opts })).providers.find((p) => p.provider === 'gemini');

test('Gemini on Vertex AI: healthy once the token is minted — no model call, no request at all, the key never sent', async () => {
  const entry = await gemini();
  expect(entry).toMatchObject({ configured: true, status: 'healthy', envKey: 'GCP_PROJECT_ID' });
  expect(entry?.detail).toBe('vertex · location:global · mode:wif · token:ok');
  expect(mockToken).toHaveBeenCalledWith(false); // the Gemini chain: no Veo bucket needed
  expect(fetchMock).not.toHaveBeenCalled();
  expect(JSON.stringify(entry)).not.toContain(AI_STUDIO_KEY);
});

test('a token the chain cannot mint is unhealthy, with the reason redacted', async () => {
  mockToken.mockRejectedValue(new VertexAuthError('token_failed', 'Vertex access token request failed (HTTP 400: invalid_grant)', 400));
  const entry = await gemini();
  expect(entry).toMatchObject({ configured: true, status: 'unhealthy' });
  expect(entry?.detail).toContain('token:failed token_failed: Vertex access token request failed (HTTP 400: invalid_grant)');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('Vertex not configured: an AI Studio key does not make Gemini configured, and the row names the missing variable', async () => {
  delete process.env.GCP_PROJECT_ID;
  const entry = await gemini();
  expect(entry).toMatchObject({ configured: false, status: 'missing_key' });
  expect(entry?.detail).toContain('GCP_PROJECT_ID');
  expect(mockToken).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('GEMINI_TRANSPORT=gemini_api is refused, not probed', async () => {
  process.env.GEMINI_TRANSPORT = 'gemini_api';
  const entry = await gemini();
  expect(entry).toMatchObject({ configured: false, status: 'missing_key', detail: 'refused · GEMINI_TRANSPORT must be vertex or unset' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('the routing row for text follows Vertex readiness, not the key', async () => {
  const configured = (await runProviderHealthAudit({ live: false })).routing.find((r) => r.category === 'text');
  expect(configured).toMatchObject({ provider: 'gemini', envKey: 'GCP_PROJECT_ID', configured: true });
  delete process.env.GCP_PROJECT_ID;
  const missing = (await runProviderHealthAudit({ live: false })).routing.find((r) => r.category === 'text');
  expect(missing).toMatchObject({ configured: false });
});

test('a thrown message that echoes a provider key never reaches `detail`', async () => {
  const OPENAI = 'sk-test-openai-0123456789abcdef';
  process.env.OPENAI_API_KEY = OPENAI;
  fetchMock.mockRejectedValueOnce(new TypeError(`Headers.append: "Bearer ${OPENAI}" is an invalid header value.`));

  const entry = (await runProviderHealthAudit({ live: true })).providers.find((p) => p.provider === 'openai');
  expect(entry?.status).toBe('unhealthy');
  expect(entry?.detail).not.toContain(OPENAI);
  expect(entry?.detail).toContain('[redacted]');
});

test('a provider that never answers gets a "no answer" verdict at the deadline instead of hanging the audit', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-openai';
  fetchMock.mockImplementation(() => new Promise(() => { /* never settles */ }));
  const started = Date.now();
  const report = await runProviderHealthAudit({ live: true, deadlineMs: 40 });
  expect(Date.now() - started).toBeLessThan(2_000);
  const by = Object.fromEntries(report.providers.map((p) => [p.provider, p]));
  expect(by.openai).toMatchObject({ status: 'unhealthy', detail: 'No answer within 40 ms' });
  expect(by.gemini).toMatchObject({ status: 'healthy' }); // the hung vendor did not take the others down with it
  expect(report.providers.map((p) => p.provider)).toEqual(['openai', 'udio', 'worldlabs', 'heygen', 'ltx', 'anthropic', 'gemini']);
});

test('without ?live nothing is fetched at all', async () => {
  const report = await runProviderHealthAudit({ live: false });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockToken).not.toHaveBeenCalled();
  expect(report.providers.find((p) => p.provider === 'gemini')).toMatchObject({ status: 'configured' });
});

/** @jest-environment node */
/**
 * GET /api/admin/google-transport — the free proof that the selected Google transport reaches Google's models.
 * Pinned: 404 for a non-admin; on vertex it asks countTokens (never generateContent) of aiplatform with the bearer
 * token; it reports missing variable NAMES; Google's error text comes back redacted; no credential in the body.
 * Only the token mint is mocked (vertexAuth's env reading is real); fetch is a spy.
 */
jest.mock('server-only', () => ({}));
let mockAdmin = true;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('../../../../lib/admin/guard', () => ({ assertAdminAccess: () => (mockAdmin ? { ok: true } : { ok: false, reason: 'x' }) }));
jest.mock('../../../../lib/veo/vertexAuth', () => ({
  ...jest.requireActual('../../../../lib/veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const WIF = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = ['GEMINI_TRANSPORT', 'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GCP_GEMINI_LOCATION', 'GCP_SERVICE_ACCOUNT_KEY', ...Object.keys(WIF)];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;
const req = () => new NextRequest('https://myavatar.ge/api/admin/google-transport');

beforeEach(() => {
  mockAdmin = true;
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ totalTokens: 1 }), { status: 200 }));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

it('is a 404 for anyone but an admin, and calls nothing', async () => {
  mockAdmin = false;
  const res = await GET(req());
  expect(res.status).toBe(404);
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('vertex: countTokens on the global endpoint with the bearer token — nothing generated', async () => {
  process.env.GEMINI_TRANSPORT = 'vertex';
  process.env.GEMINI_API_KEY = 'gemini-key';
  Object.assign(process.env, WIF);
  const res = await GET(req());
  const body = await res.json();
  expect(body).toMatchObject({ transport: 'vertex', configured: true, ok: true, location: 'global' });
  expect(body.steps).toHaveLength(2);
  for (const [url, init] of fetchSpy.mock.calls as Array<[string, RequestInit & { headers: Record<string, string> }]>) {
    expect(url).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/gen-lang-client-0671348730\/locations\/global\/publishers\/google\/models\/[\w.-]+:countTokens$/);
    expect(init.headers.Authorization).toBe('Bearer vertex-token');
    expect(init.headers['x-goog-api-key']).toBeUndefined();
  }
  expect(JSON.stringify(body)).not.toMatch(/vertex-token|gemini-key/);
});

it('vertex without Workload Identity: configured false with the missing names, no call', async () => {
  process.env.GEMINI_TRANSPORT = 'vertex';
  process.env.GEMINI_API_KEY = 'gemini-key';
  const body = await (await GET(req())).json();
  expect(body).toMatchObject({ transport: 'vertex', configured: false, ok: false });
  expect(body.missing).toContain('GCP_PROJECT_ID');
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('a Google refusal is reported with its status and redacted text', async () => {
  process.env.GEMINI_TRANSPORT = 'vertex';
  Object.assign(process.env, WIF);
  fetchSpy.mockImplementation(async () => new Response('{"error":{"status":"PERMISSION_DENIED","message":"denied ya29.secret-token"}}', { status: 403 }));
  const body = await (await GET(req())).json();
  expect(body.ok).toBe(false);
  expect(body.steps[0]).toMatchObject({ ok: false, status: 403 });
  expect(body.steps[0].error).toContain('PERMISSION_DENIED');
  expect(JSON.stringify(body)).not.toContain('ya29.secret-token');
});

it('unset: the Gemini API with the key in a header', async () => {
  process.env.GEMINI_API_KEY = 'gemini-key';
  const body = await (await GET(req())).json();
  expect(body).toMatchObject({ transport: 'gemini_api', ok: true });
  const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
  expect(url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[\w.-]+:countTokens$/);
  expect(init.headers['x-goog-api-key']).toBe('gemini-key');
});

it('an unknown GEMINI_TRANSPORT is reported, not guessed', async () => {
  process.env.GEMINI_TRANSPORT = 'openai';
  process.env.GEMINI_API_KEY = 'gemini-key';
  const body = await (await GET(req())).json();
  expect(body).toMatchObject({ transport: 'invalid', ok: false });
  expect(fetchSpy).not.toHaveBeenCalled();
});

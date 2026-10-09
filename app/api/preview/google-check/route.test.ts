/** @jest-environment node */
/**
 * GET /api/preview/google-check — the free Google transport proof on a Preview, without signing in.
 * Pinned: 404 and no call outside a Vercel Preview; on vertex it asks countTokens (never generateContent) of aiplatform
 * with the bearer token; the open answer carries statuses and Google's status enum but never Google's error text, a key
 * or a token; one run per cache window per instance.
 * Only the token mint is mocked (vertexAuth's env reading is real); fetch is a spy; nothing reaches the network.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/veo/vertexAuth', () => ({
  ...jest.requireActual('../../../../lib/veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

type Route = typeof import('./route');

const WIF = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};
const ENV = ['VERCEL_ENV', 'GEMINI_TRANSPORT', 'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GCP_GEMINI_LOCATION', 'GCP_SERVICE_ACCOUNT_KEY', ...Object.keys(WIF)];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;

/** A fresh module per test, so the per-instance cache starts empty. */
function load(): Route {
  let mod!: Route;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolated re-import of the route under test
    mod = require('./route');
  });
  return mod;
}

beforeEach(() => {
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

it.each([undefined, 'production', 'development'])('is a 404 outside a Preview (VERCEL_ENV=%s) and calls nothing', async (env) => {
  if (env) process.env.VERCEL_ENV = env;
  process.env.GEMINI_TRANSPORT = 'vertex';
  Object.assign(process.env, WIF);
  const res = await load().GET();
  expect(res.status).toBe(404);
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('Preview + vertex: countTokens on aiplatform with the bearer token, and the catalog check — nothing generated', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.GEMINI_TRANSPORT = 'vertex';
  process.env.GEMINI_API_KEY = 'AIzaTestKey1234567890123456789012345';
  Object.assign(process.env, WIF);
  const res = await load().GET();
  const body = await res.json();
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(body).toMatchObject({ transport: 'vertex', configured: true, ok: true, location: 'global' });
  expect(body.steps).toHaveLength(2);
  expect(body.catalog).toMatchObject({ ok: true, method: 'countTokens', missing: [] });
  expect(body.catalog.present.length).toBeGreaterThan(0);
  expect(fetchSpy).toHaveBeenCalled();
  for (const [url, init] of fetchSpy.mock.calls as Array<[string, RequestInit & { headers: Record<string, string> }]>) {
    expect(url).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/gen-lang-client-0671348730\/locations\/[\w-]+\/publishers\/google\/models\/[\w.-]+:countTokens$/);
    expect(init.headers.Authorization).toBe('Bearer vertex-token');
    expect(init.headers['x-goog-api-key']).toBeUndefined();
  }
  expect(JSON.stringify(body)).not.toMatch(/vertex-token|AIzaTest/);
});

it('a Google refusal shows its status and enum, never its text', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.GEMINI_TRANSPORT = 'vertex';
  Object.assign(process.env, WIF);
  fetchSpy.mockImplementation(
    async () => new Response('{"error":{"status":"PERMISSION_DENIED","message":"denied for myavatar-veo@ ya29.secret-token"}}', { status: 403 }),
  );
  const body = await (await load().GET()).json();
  expect(body.ok).toBe(false);
  expect(body.steps[0]).toEqual({ model: expect.any(String), ok: false, status: 403, reason: 'PERMISSION_DENIED' });
  expect(body.catalog.errors[0]).toEqual({ id: expect.any(String), status: 403 });
  const text = JSON.stringify(body);
  expect(text).not.toContain('ya29');
  expect(text).not.toContain('denied for');
});

it('vertex without Workload Identity: the missing variable names, no call', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.GEMINI_TRANSPORT = 'vertex';
  process.env.GEMINI_API_KEY = 'AIzaTestKey1234567890123456789012345';
  const body = await (await load().GET()).json();
  expect(body).toMatchObject({ transport: 'vertex', configured: false, ok: false, catalog: { ok: false } });
  expect(body.missing).toContain('GCP_PROJECT_ID');
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('runs once per cache window per instance', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.GEMINI_TRANSPORT = 'vertex';
  Object.assign(process.env, WIF);
  const route = load();
  const first = await (await route.GET()).json();
  const calls = fetchSpy.mock.calls.length;
  const second = await (await route.GET()).json();
  expect(fetchSpy.mock.calls.length).toBe(calls);
  expect(second.checkedAt).toBe(first.checkedAt);
});

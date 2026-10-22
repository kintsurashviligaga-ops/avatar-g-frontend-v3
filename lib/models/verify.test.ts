/** @jest-environment node */
/**
 * lib/models/verify — runtime verification of the ModelCatalog (Section D2).
 *
 * Pinned (MASTER TASK v3.1, Vertex only): it asks Vertex countTokens (never generateContent) per text / image / music
 * entry and switches off only on a 404; it never reads the Developer API's model list, whatever key is set; a failed
 * check changes nothing; presence never stamps verifiedAt; results are cached per transport.
 * Only the token mint is mocked; fetch is a spy; nothing reaches the network.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import { MODEL_CATALOG } from './catalog';
import { __resetModelCatalogCache, applyCatalogCheck, checkModelCatalog, verifiedModelCatalog } from './verify';

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


beforeEach(() => {
  __resetModelCatalogCache();
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  fetchSpy = jest.spyOn(global, 'fetch');
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('the Developer API model list is never read', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'AIzaTestKey1234567890123456789012345';
  });

  it('a key alone (Vertex unconfigured): ok:false, no request, nothing switched off', async () => {
    const check = await checkModelCatalog();
    expect(check).toMatchObject({ ok: false, transport: 'vertex', method: 'none', missing: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(applyCatalogCheck(MODEL_CATALOG, check)).toBe(MODEL_CATALOG);
  });

  it('GEMINI_TRANSPORT=gemini_api, even with Vertex configured: ok:false, no request', async () => {
    process.env.GEMINI_TRANSPORT = 'gemini_api';
    Object.assign(process.env, WIF);
    const check = await checkModelCatalog();
    expect(check).toMatchObject({ ok: false, transport: 'invalid', method: 'none', missing: [] });
    expect(JSON.stringify(check)).not.toContain('AIzaTestKey');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('vertex (countTokens)', () => {
  beforeEach(() => {
    process.env.GEMINI_TRANSPORT = 'vertex';
    Object.assign(process.env, WIF);
  });

  it('asks countTokens of text / image / music entries only; 404 switches off, 429 reports and switches nothing', async () => {
    fetchSpy.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/models/gemini-3.7-flash:')) return new Response('{"error":{"code":404}}', { status: 404 });
      if (url.includes('/models/gemini-3.6-flash:')) return new Response('quota', { status: 429 });
      return new Response('{"totalTokens":1}', { status: 200 });
    });
    const check = await checkModelCatalog();

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => /^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/gen-lang-client-0671348730\/locations\/global\/publishers\/google\/models\/[a-z0-9.-]+:countTokens$/.test(u))).toBe(true);
    for (const id of ['veo-3.1-generate-001', 'imagen-4.0-generate-001', 'gemini-embedding-001', 'gemini-2.5-flash-native-audio-latest', 'deep-research-preview-04-2026']) {
      expect(urls.some((u) => u.includes(`/models/${id}:`))).toBe(false);
      expect(check.unchecked).toContain(id);
    }
    expect(check).toMatchObject({ ok: true, transport: 'vertex', method: 'countTokens', missing: ['gemini-3.7-flash'] });
    expect(check.present).toEqual(expect.arrayContaining(['gemini-3.8-flash', 'gemini-3.1-flash-image', 'lyria-3-clip-preview']));
    expect(check.errors).toEqual([expect.objectContaining({ id: 'gemini-3.6-flash', status: 429 })]);
    expect(check.unchecked).toContain('gemini-3.6-flash');
  });

  it('caches per transport; a failed check is not cached', async () => {
    fetchSpy.mockImplementation(async () => new Response('{"totalTokens":1}', { status: 200 }));
    await verifiedModelCatalog();
    const perCheck = fetchSpy.mock.calls.length;
    expect(perCheck).toBeGreaterThan(0);
    await verifiedModelCatalog();
    expect(fetchSpy).toHaveBeenCalledTimes(perCheck);
    await verifiedModelCatalog({ force: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2 * perCheck);

    __resetModelCatalogCache();
    fetchSpy.mockClear();
    const project = process.env.GCP_PROJECT_ID;
    delete process.env.GCP_PROJECT_ID;
    expect((await verifiedModelCatalog()).check.ok).toBe(false);
    process.env.GCP_PROJECT_ID = project;
    expect((await verifiedModelCatalog()).check.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(perCheck);
  });

  it('unconfigured Vertex: ok:false, no request, nothing switched off, the API key is not used instead', async () => {
    delete process.env.GCP_PROJECT_ID;
    process.env.GEMINI_API_KEY = 'AIzaTestKey1234567890123456789012345';
    const check = await checkModelCatalog();
    expect(check).toMatchObject({ ok: false, transport: 'vertex', method: 'none', missing: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

it('an unknown GEMINI_TRANSPORT fails closed', async () => {
  process.env.GEMINI_TRANSPORT = 'bogus';
  const check = await checkModelCatalog();
  expect(check).toMatchObject({ ok: false, transport: 'invalid' });
  expect(fetchSpy).not.toHaveBeenCalled();
});

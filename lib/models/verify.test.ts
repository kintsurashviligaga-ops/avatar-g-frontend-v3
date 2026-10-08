/** @jest-environment node */
/**
 * lib/models/verify — runtime verification of the ModelCatalog (Section D2).
 *
 * Pinned: on the Gemini API it reads the key's model list (key in the header, never the URL; paged), switches off an
 * enabled id the runtime lacks, puts runtime ids it does not know in the review queue and never adds them; on Vertex it
 * asks countTokens (never generateContent) per text / image / music entry and switches off only on a 404; a failed check
 * changes nothing; presence never stamps verifiedAt; results are cached per transport.
 * Only the token mint is mocked; fetch is a spy; nothing reaches the network.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import type { ModelCatalog } from '@/lib/contracts/modelCatalog';
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

const listing = (ids: string[], nextPageToken?: string) =>
  new Response(JSON.stringify({ models: ids.map((id) => ({ name: `models/${id}` })), ...(nextPageToken ? { nextPageToken } : {}) }), { status: 200 });
const catalogIds = (pred: (e: ModelCatalog['entries'][number]) => boolean) => MODEL_CATALOG.entries.filter(pred).map((e) => e.id);

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

describe('gemini_api (models.list)', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'AIzaTestKey1234567890123456789012345';
  });

  it('pages the list with the key in a header, switches off what is missing, and queues what is unknown', async () => {
    const everything = catalogIds((e) => e.transport !== 'vertex' && e.family !== 'specialty');
    const withoutImagen = everything.filter((id) => id !== 'imagen-4.0-generate-001');
    fetchSpy
      .mockResolvedValueOnce(listing(withoutImagen.slice(0, 5), 'p2'))
      .mockResolvedValueOnce(listing([...withoutImagen.slice(5), 'gemini-9.9-flash', 'aqa']));
    const check = await checkModelCatalog();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url1, init1] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url1).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
    expect(url1).not.toContain('AIza');
    expect(init1.headers['x-goog-api-key']).toBe('AIzaTestKey1234567890123456789012345');
    expect(init1.redirect).toBe('manual');
    expect(String(fetchSpy.mock.calls[1]![0])).toContain('pageToken=p2');

    expect(check).toMatchObject({ ok: true, transport: 'gemini_api', method: 'models.list', missing: ['imagen-4.0-generate-001'] });
    expect(check.reviewQueue).toEqual(['aqa', 'gemini-9.9-flash']);
    expect(check.unchecked).toEqual(expect.arrayContaining(['veo-3.1-fast-generate-001', 'deep-research-preview-04-2026']));

    const applied = applyCatalogCheck(MODEL_CATALOG, check);
    expect(applied.entries.find((e) => e.id === 'imagen-4.0-generate-001')?.enabled).toBe(false);
    expect(applied.entries.some((e) => e.id === 'gemini-9.9-flash')).toBe(false); // never auto-added
    // Presence does not stamp verifiedAt: Imagen-free listing leaves every other entry exactly as it was.
    const untouched = applied.entries.filter((e) => e.id !== 'imagen-4.0-generate-001');
    expect(untouched).toEqual(MODEL_CATALOG.entries.filter((e) => e.id !== 'imagen-4.0-generate-001'));
    expect(MODEL_CATALOG.entries.find((e) => e.id === 'imagen-4.0-generate-001')?.enabled).toBe(true); // input untouched
  });

  it('a failed list changes nothing, says ok:false and redacts the key', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('bad key AIzaTestKey1234567890123456789012345', { status: 403 }));
    const check = await checkModelCatalog();
    expect(check).toMatchObject({ ok: false, missing: [], method: 'models.list' });
    expect(JSON.stringify(check)).not.toContain('AIzaTestKey');
    expect(applyCatalogCheck(MODEL_CATALOG, check)).toBe(MODEL_CATALOG);
  });

  it('caches per transport; a failed check is not cached', async () => {
    fetchSpy.mockImplementation(async () => listing(catalogIds((e) => e.transport !== 'vertex')));
    await verifiedModelCatalog();
    await verifiedModelCatalog();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await verifiedModelCatalog({ force: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    __resetModelCatalogCache();
    fetchSpy.mockReset();
    fetchSpy.mockImplementation(async () => new Response('down', { status: 503 }));
    await verifiedModelCatalog();
    await verifiedModelCatalog();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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

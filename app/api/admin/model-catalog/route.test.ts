/** @jest-environment node */
/**
 * GET /api/admin/model-catalog — 404 for a non-admin; for an admin, the runtime check, what a selector may show, and the
 * build-time validation. No credential in the body. fetch and the Vertex token are stubs; nothing reaches the network.
 * v3.1: the check runs on Vertex AI (free countTokens per model); the Developer API's model list is never read.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/veo/vertexAuth', () => ({
  ...jest.requireActual('../../../../lib/veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));
let mockAdmin = true;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('../../../../lib/admin/guard', () => ({ assertAdminAccess: () => (mockAdmin ? { ok: true } : { ok: false, reason: 'x' }) }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { MODEL_CATALOG } from '../../../../lib/models/catalog';
import { __resetModelCatalogCache } from '../../../../lib/models/verify';

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;
const req = (q = '') => new NextRequest(`https://myavatar.ge/api/admin/model-catalog${q}`);

beforeEach(() => {
  mockAdmin = true;
  __resetModelCatalogCache();
  delete process.env.GEMINI_TRANSPORT;
  delete process.env.GEMINI_API_KEYS;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GCP_GEMINI_LOCATION;
  delete process.env.GCP_VEO_LOCATION;
  Object.assign(process.env, {
    GCP_PROJECT_ID: 'gen-lang-client-0671348730',
    GCP_PROJECT_NUMBER: '467145118875',
    GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
    GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
  });
  // A leftover AI Studio key changes nothing and never reaches the body.
  process.env.GEMINI_API_KEY = 'AIzaTestKey1234567890123456789012345';
  // Vertex answers countTokens for every model but gemini-3.5-flash, which it no longer serves.
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) =>
    String(url).includes('/models/gemini-3.5-flash:')
      ? new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 })
      : new Response(JSON.stringify({ totalTokens: 1 }), { status: 200 }),
  );
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

test('a non-admin gets 404 and nothing is checked', async () => {
  mockAdmin = false;
  const res = await GET(req());
  expect(res.status).toBe(404);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('an admin gets the check, the selectable list without the missing model, and a clean validation', async () => {
  const res = await GET(req('?fresh=1'));
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    version: string;
    validation: string[];
    check: { ok: boolean; missing: string[] };
    selectable: Array<{ id: string }>;
    disabled: string[];
  };
  expect(body.version).toBe(MODEL_CATALOG.version);
  expect(body.validation).toEqual([]);
  expect(body.check).toMatchObject({ ok: true, transport: 'vertex', method: 'countTokens', missing: ['gemini-3.5-flash'] });
  expect(fetchSpy).toHaveBeenCalled();
  for (const [url] of fetchSpy.mock.calls) expect(String(url)).toMatch(/^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/gen-lang-client-0671348730\/.+:countTokens$/);
  expect(body.selectable.map((e) => e.id)).not.toContain('gemini-3.5-flash');
  expect(body.selectable.map((e) => e.id)).toContain('gemini-3.8-flash');
  expect(body.disabled).toEqual(expect.arrayContaining(['gemini-3.5-flash', 'lyria-3-pro-preview']));
  expect(JSON.stringify(body)).not.toContain('AIzaTestKey');
});

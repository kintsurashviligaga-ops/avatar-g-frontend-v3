/** @jest-environment node */
/**
 * GET /api/admin/model-catalog — 404 for a non-admin; for an admin, the runtime check, what a selector may show, and the
 * build-time validation. No key in the body. fetch is a spy; nothing reaches the network.
 */
jest.mock('server-only', () => ({}));
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
  process.env.GEMINI_API_KEY = 'AIzaTestKey1234567890123456789012345';
  const listed = MODEL_CATALOG.entries.filter((e) => e.transport !== 'vertex' && e.id !== 'gemini-3.5-flash').map((e) => ({ name: `models/${e.id}` }));
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ models: listed }), { status: 200 }));
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
  expect(body.check).toMatchObject({ ok: true, missing: ['gemini-3.5-flash'] });
  expect(body.selectable.map((e) => e.id)).not.toContain('gemini-3.5-flash');
  expect(body.selectable.map((e) => e.id)).toContain('gemini-3.8-flash');
  expect(body.disabled).toEqual(expect.arrayContaining(['gemini-3.5-flash', 'lyria-3-pro-preview']));
  expect(JSON.stringify(body)).not.toContain('AIzaTestKey');
});

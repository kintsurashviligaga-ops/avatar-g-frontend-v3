/** @jest-environment node */
/**
 * GET /api/admin/whatsapp/meta-check — 404 for a non-admin with no Graph call; "not configured" without a token or
 * number; otherwise the read-only report, with no credential in the body. fetch is a spy (no network).
 */
jest.mock('server-only', () => ({}));
let mockAdmin = true;
jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('../../../../../lib/admin/guard', () => ({ assertAdminAccess: () => (mockAdmin ? { ok: true } : { ok: false, reason: 'x' }) }));

import { NextRequest } from 'next/server';
import { GET } from './route';

const ENV = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_TOKEN', 'WHATSAPP_API_TOKEN', 'META_WHATSAPP_TOKEN', 'WHATSAPP_CLOUD_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_PHONE_ID', 'META_WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_WABA_ID', 'WHATSAPP_APP_ID', 'META_APP_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_GRAPH_VERSION'];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;
const req = () => new NextRequest('https://myavatar.ge/api/admin/whatsapp/meta-check');

beforeEach(() => {
  mockAdmin = true;
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 }));
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
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1111';
  expect((await GET(req())).status).toBe(404);
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('says not configured without a token or number, and calls nothing', async () => {
  const res = await GET(req());
  expect(await res.json()).toEqual({ error: 'whatsapp_not_configured' });
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('returns the read-only report: GETs only, no credential in the body', async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'EAAG-secret-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1111';
  process.env.WHATSAPP_APP_ID = '3333';
  process.env.WHATSAPP_APP_SECRET = 'the-app-secret';
  const res = await GET(req());
  const body = await res.json();
  expect(body).toMatchObject({ callingReady: 'unknown', configured: { token: true, phoneNumberId: true, appId: true, appSecret: true, wabaId: false } });
  for (const [, init] of fetchSpy.mock.calls as Array<[string, RequestInit | undefined]>) expect(init?.method ?? 'GET').toBe('GET');
  expect(JSON.stringify(body)).not.toMatch(/EAAG-secret-token|the-app-secret/);
});

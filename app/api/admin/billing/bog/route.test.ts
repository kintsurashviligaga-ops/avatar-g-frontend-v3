/** @jest-environment node */
jest.mock('server-only', () => ({}));
const isAdmin = jest.fn();
jest.mock('../../../../../lib/auth/adminGuard', () => ({ isAdmin: () => isAdmin() }));
jest.mock('../../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
const bogReadiness = jest.fn(async () => ({ configured: true }));
const probeBogOAuth = jest.fn(async (): Promise<{ verdict: string }> => ({ verdict: 'ok' }));
const MERCHANT = { verdict: 'ok', brandKa: 'მაიავატარი', brandEn: 'MyAvatar.ge', orderCreatedAt: '2026-10-13T09:08:08Z' };
const bogMerchantSeen = jest.fn(async () => MERCHANT);
jest.mock('../../../../../lib/billing/bogDiagnostics', () => ({
  bogReadiness: () => bogReadiness(),
  probeBogOAuth: () => probeBogOAuth(),
  bogMerchantSeen: () => bogMerchantSeen(),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const post = (body: unknown) => new NextRequest('http://x/api/admin/billing/bog', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => jest.clearAllMocks());

test('non-admin → 403 and nothing is read or probed', async () => {
  isAdmin.mockResolvedValue(false);
  expect((await GET()).status).toBe(403);
  expect((await POST(post({ action: 'oauth' }))).status).toBe(403);
  expect(bogReadiness).not.toHaveBeenCalled();
  expect(probeBogOAuth).not.toHaveBeenCalled();
});

test('admin GET → readiness, not cached', async () => {
  isAdmin.mockResolvedValue(true);
  const res = await GET();
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({ ok: true, bog: { configured: true } });
});

test('admin POST oauth → one probe, then the merchant name BOG reports; any other action → 400', async () => {
  isAdmin.mockResolvedValue(true);
  expect(await (await POST(post({ action: 'oauth' }))).json()).toEqual({ ok: true, probe: { verdict: 'ok' }, merchant: MERCHANT });
  expect((await POST(post({ action: 'charge' }))).status).toBe(400);
  expect(probeBogOAuth).toHaveBeenCalledTimes(1);
  expect(bogMerchantSeen).toHaveBeenCalledTimes(1);
});

test('BOG refuses the pair → no receipt is read', async () => {
  isAdmin.mockResolvedValue(true);
  probeBogOAuth.mockResolvedValueOnce({ verdict: 'credentials_refused' });
  expect(await (await POST(post({ action: 'oauth' }))).json()).toEqual({ ok: true, probe: { verdict: 'credentials_refused' }, merchant: null });
  expect(bogMerchantSeen).not.toHaveBeenCalled();
});

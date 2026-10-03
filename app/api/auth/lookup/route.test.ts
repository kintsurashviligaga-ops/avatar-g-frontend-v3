/** @jest-environment node */
// „Does this address have an account?" — the sign-in sheet's log-in / sign-up split (2026-10-03).

jest.mock('server-only', () => ({}));
const mockRpc = jest.fn();
jest.mock('../../../../lib/supabase/server', () => ({
  isSupabaseConfiguredServer: () => true,
  createServiceRoleClient: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}));
const mockIp = jest.fn(async (..._a: unknown[]): Promise<Response | null> => null);
const mockByKey = jest.fn(async (..._a: unknown[]): Promise<Response | null> => null);
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => mockIp(...a),
  checkRateLimitByKey: (...a: unknown[]) => mockByKey(...a),
  RATE_LIMITS: { AUTH_IP: { keyPrefix: 'rl:authip' }, AUTH_LOOKUP: { keyPrefix: 'rl:auth:lookup' } },
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const ask = (identifier: unknown) =>
  POST(new NextRequest('https://myavatar.ge/api/auth/lookup', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier }),
  }));

beforeEach(() => {
  mockRpc.mockReset();
  mockIp.mockReset().mockResolvedValue(null);
  mockByKey.mockReset().mockResolvedValue(null);
});

it('answers the status and nothing else', async () => {
  mockRpc.mockResolvedValueOnce({ data: { exists: true, confirmed: true, password: true }, error: null });
  const res = await ask(' Member@Example.com ');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'password' });
  expect(mockRpc).toHaveBeenCalledWith('auth_account_status', { p_email: 'member@example.com', p_phone: null });
  expect(res.headers.get('cache-control')).toBe('no-store');
});

it('a Georgian mobile number is looked up in E.164', async () => {
  mockRpc.mockResolvedValueOnce({ data: { exists: false, confirmed: false, password: null }, error: null });
  expect(await (await ask('599 12 34 56')).json()).toEqual({ status: 'none' });
  expect(mockRpc).toHaveBeenCalledWith('auth_account_status', { p_email: null, p_phone: '+995599123456' });
});

it('not applied yet → unknown (the sheet offers every way in)', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
  expect(await (await ask('a@example.com')).json()).toEqual({ status: 'unknown' });
});

it('rejects garbage before spending any budget or touching the database', async () => {
  const res = await ask('not an address');
  expect(res.status).toBe(400);
  expect(mockByKey).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

it('is bounded per IP and per address (hashed — no plain address in the limiter)', async () => {
  mockRpc.mockResolvedValue({ data: { exists: false, confirmed: false, password: null }, error: null });
  await ask('victim@example.com');
  const [key, cap] = mockByKey.mock.calls[0] as [string, { keyPrefix: string }];
  expect(key).toMatch(/^[0-9a-f]{32}$/);
  expect(cap.keyPrefix).toBe('rl:auth:lookup');
  mockIp.mockResolvedValueOnce(new Response('{}', { status: 429 }) as never);
  const res = await ask('victim@example.com');
  expect(res.status).toBe(429);
});

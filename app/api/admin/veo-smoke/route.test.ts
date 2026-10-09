/** @jest-environment node */
/**
 * The paid Veo smoke route answers only an admin, and starts a render only on POST with the confirm word.
 *
 * ⚠️ `assertAdminAccess` is async on main (PR #45). PR #43 read `.ok` off the bare promise, which is undefined, so the
 * route answered 404 even to the owner. Pinned: the gate is awaited, a non-admin gets 404 and no render, an admin
 * without the confirm word gets the price and no render.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: async () => ({ user: { id: 'u1' } }) }));
let admin = false;
jest.mock('../../../../lib/admin/guard', () => ({
  assertAdminAccess: async () => (admin ? { ok: true } : { ok: false, reason: 'Admin access required' }),
}));
const submitVeoSmoke = jest.fn(async () => ({ ok: true, operation: 'op-1' }));
const pollVeoSmoke = jest.fn();
jest.mock('../../../../lib/veo/smoke', () => ({
  VEO_SMOKE_CONFIRM: 'paid-test',
  veoSmokeReady: () => true,
  veoSmokeQuote: () => ({ usd: 0.4 }),
  submitVeoSmoke: () => submitVeoSmoke(),
  pollVeoSmoke: (op: string) => pollVeoSmoke(op),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const post = (body: unknown) =>
  POST(new NextRequest('https://myavatar.ge/api/admin/veo-smoke', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  admin = false;
  submitVeoSmoke.mockClear();
  pollVeoSmoke.mockClear();
});

test('a non-admin gets 404 and nothing is rendered', async () => {
  expect((await post({ confirm: 'paid-test' })).status).toBe(404);
  expect((await GET(new NextRequest('https://myavatar.ge/api/admin/veo-smoke?op=x'))).status).toBe(404);
  expect(submitVeoSmoke).not.toHaveBeenCalled();
  expect(pollVeoSmoke).not.toHaveBeenCalled();
});

test('an admin without the confirm word gets the quote and nothing is rendered', async () => {
  admin = true;
  const res = await post({});
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: 'confirm_required', confirm: 'paid-test' });
  expect(submitVeoSmoke).not.toHaveBeenCalled();
});

test('an admin with the confirm word submits exactly one render', async () => {
  admin = true;
  const res = await post({ confirm: 'paid-test' });
  expect(res.status).toBe(200);
  expect(submitVeoSmoke).toHaveBeenCalledTimes(1);
});

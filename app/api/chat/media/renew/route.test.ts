/** @jest-environment node */
jest.mock('server-only', () => ({}));
const gate = { response: null as Response | null, auth: { userId: 'u1' } as { userId: string } | null };
jest.mock('../../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => gate) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { READ: {} }, checkRateLimitByKey: jest.fn(async () => null) }));
jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: null })), createServiceRoleClient: jest.fn() }));
const renew = jest.fn(async () => ({ a: 'https://p.supabase.co/new' }));
jest.mock('../../../../../lib/chat/mediaRenew', () => ({
  chatMediaRenewOn: () => process.env.CHAT_MEDIA_RENEW === 'true',
  renewChatMedia: (...a: unknown[]) => renew(...(a as [])),
}));

import { POST } from './route';

const req = (body: unknown) => new Request('https://myavatar.ge/api/chat/media/renew', { method: 'POST', body: JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0];

afterEach(() => { delete process.env.CHAT_MEDIA_RENEW; gate.auth = { userId: 'u1' }; renew.mockClear(); });

test('off by default: 404 disabled, nothing signed', async () => {
  const res = await POST(req({ urls: ['a'] }));
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'disabled' });
  expect(renew).not.toHaveBeenCalled();
});

test('on: a guest is refused', async () => {
  process.env.CHAT_MEDIA_RENEW = 'true';
  gate.auth = null;
  expect((await POST(req({ urls: ['a'] }))).status).toBe(401);
  expect(renew).not.toHaveBeenCalled();
});

test('on: a bad body is 400; a good one renews for the signed-in user', async () => {
  process.env.CHAT_MEDIA_RENEW = 'true';
  expect((await POST(req({ urls: 'a' }))).status).toBe(400);
  const res = await POST(req({ urls: ['a'] }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ renewed: { a: 'https://p.supabase.co/new' } });
  expect(renew).toHaveBeenCalledWith(['a'], 'u1');
});

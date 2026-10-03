/** @jest-environment node */
// POST /api/voice/web-read — signed-in only, bounded per user, and only lib/web/readPage's answers go out.

jest.mock('server-only', () => ({}));
const mockRequireUser = jest.fn();
jest.mock('../../../../lib/supabase/server', () => ({ requireUser: () => mockRequireUser() }));
const mockLimit = jest.fn(async (..._a: unknown[]): Promise<Response | null> => null);
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => mockLimit(...a),
  RATE_LIMITS: { WEB_READ: { keyPrefix: 'rl:webread' } },
}));
const mockRead = jest.fn();
jest.mock('../../../../lib/web/readPage', () => ({ readWebPage: (...a: unknown[]) => mockRead(...a) }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const call = (body: unknown) => POST(new NextRequest('https://myavatar.ge/api/voice/web-read', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => {
  mockRequireUser.mockReset().mockResolvedValue({ id: 'u-1' });
  mockLimit.mockReset().mockResolvedValue(null);
  mockRead.mockReset();
});

it('a guest gets 401 and nothing is fetched', async () => {
  mockRequireUser.mockRejectedValueOnce(new Error('UNAUTHENTICATED'));
  const res = await call({ url: 'https://example.ge' });
  expect(res.status).toBe(401);
  expect(mockRead).not.toHaveBeenCalled();
});

it('is bounded per USER', async () => {
  mockLimit.mockResolvedValueOnce(new Response('{}', { status: 429 }));
  const res = await call({ url: 'https://example.ge' });
  expect(res.status).toBe(429);
  expect(mockLimit.mock.calls[0]![2]).toBe('u-1');
  expect(mockRead).not.toHaveBeenCalled();
});

it('returns the page', async () => {
  mockRead.mockResolvedValueOnce({ ok: true, page: { url: 'https://example.ge/', title: 'T', description: '', text: 'x', links: [], truncated: false } });
  const res = await call({ url: 'https://example.ge' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, page: { url: 'https://example.ge/', title: 'T', description: '', text: 'x', links: [], truncated: false } });
  expect(res.headers.get('cache-control')).toBe('no-store');
});

it('a refused address is a 400, a failed site a 502', async () => {
  mockRead.mockResolvedValueOnce({ ok: false, error: 'blocked_host' });
  expect((await call({ url: 'https://rebind.example.com' })).status).toBe(400);
  mockRead.mockResolvedValueOnce({ ok: false, error: 'http_error', status: 503 });
  const res = await call({ url: 'https://down.example.com' });
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ ok: false, error: 'http_error', status: 503 });
  expect((await call({})).status).toBe(400);
});

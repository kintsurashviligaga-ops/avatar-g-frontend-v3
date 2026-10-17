/** @jest-environment node */
/**
 * POST /api/upload/resign — a montage draft's media signed again after a reload. Only what the caller may read comes
 * back: their own upload path, or one of our URLs callerMedia lets them read. Anything else answers null, never echoed.
 */
let mockUser: { id: string } | null = { id: 'u1' };
const mockAsked: Array<{ ref: unknown; userId: unknown; ttl: unknown }> = [];
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: async () => ({ user: mockUser }) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { READ: {} } }));
// The real ownership rule is pinned in lib/security/callerMedia's own tests; here only the route's use of its answer.
jest.mock('../../../../lib/security/callerMedia', () => ({
  resolveCallerMedia: async (ref: unknown, userId: unknown, ttl: unknown) => {
    mockAsked.push({ ref, userId, ttl });
    const s = String(ref);
    if (s.startsWith(`${userId}/`)) return { ok: true, url: `https://p.supabase.co/storage/v1/object/sign/uploads/${s}?token=new`, own: true };
    if (s.startsWith('https://p.supabase.co/storage/v1/object/sign/library/u1/')) return { ok: true, url: `${s}?token=new`, own: true };
    if (s === 'boom') throw new Error('storage down');
    if (s.startsWith('https://elsewhere.test/')) return { ok: true, url: s, own: false };
    return { ok: false, reason: 'not_owner' };
  },
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const req = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/upload/resign', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  mockUser = { id: 'u1' };
  mockAsked.length = 0;
});

test('signed out → 401, nothing signed', async () => {
  mockUser = null;
  expect((await POST(req({ refs: ['u1/a.mp4'] }))).status).toBe(401);
  expect(mockAsked).toEqual([]);
});

test.each([
  [{}],
  [{ refs: [] }],
  [{ refs: 'u1/a.mp4' }],
  [{ refs: ['u1/a.mp4', 7] }],
  [{ refs: Array.from({ length: 14 }, (_, i) => `u1/${i}.mp4`) }],
])('a bad body %j → 400, nothing signed', async (body) => {
  expect((await POST(req(body))).status).toBe(400);
  expect(mockAsked).toEqual([]);
});

test('own uploads and readable Library items sign for the session; everything else is null, in order', async () => {
  const refs = [
    'u1/1-a.mp4',
    'u2/1-theirs.mp4',
    'https://p.supabase.co/storage/v1/object/sign/library/u1/clip.mp4',
    'https://elsewhere.test/clip.mp4',
    'boom',
  ];
  const res = await POST(req({ refs }));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({
    urls: [
      'https://p.supabase.co/storage/v1/object/sign/uploads/u1/1-a.mp4?token=new',
      null,
      'https://p.supabase.co/storage/v1/object/sign/library/u1/clip.mp4?token=new',
      null,
      null,
    ],
  });
  // Every ref is decided for this caller, with a TTL long enough for an editing session.
  expect(mockAsked.map((a) => a.userId)).toEqual(['u1', 'u1', 'u1', 'u1', 'u1']);
  expect(new Set(mockAsked.map((a) => a.ttl))).toEqual(new Set([6 * 3600]));
});

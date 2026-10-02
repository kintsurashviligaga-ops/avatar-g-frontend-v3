/** @jest-environment node */
/**
 * POST /api/avatars/save — the row's owner is the VERIFIED SESSION USER, never the body.
 *
 * ⚠️ IDOR: it inserted through the service-role client with whatever `owner_id` the caller sent, signed in or not, so
 * anyone could write avatar rows (arbitrary image URLs, data: URLs included) into ANY account. Pinned: a guest writes
 * nothing, a body naming someone else is refused, and a signed-in save is owned by the session user.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { WRITE: { maxRequests: 20, windowMs: 60_000 } },
  checkRateLimit: jest.fn(async () => null),
}));
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000001' }));
const inserted: Array<Record<string, unknown>> = [];
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
    }),
  })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/avatars/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const VICTIM = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  jest.clearAllMocks();
  inserted.length = 0;
  mockUser = null;
});

test('a guest is refused and nothing is written', async () => {
  const res = await POST(post({ owner_id: VICTIM, preview_image_url: 'data:image/png;base64,AAAA', name: 'x' }));
  expect(res.status).toBe(401);
  expect(inserted).toHaveLength(0);
});

test("a signed-in caller cannot write into someone else's account", async () => {
  mockUser = { id: 'attacker-1' };
  const res = await POST(post({ owner_id: VICTIM, name: 'mine now' }));
  expect(res.status).toBe(403);
  expect(inserted).toHaveLength(0);
});

test('a signed-in save is owned by the session user (the body need not name an owner)', async () => {
  mockUser = { id: 'user-1' };
  const res = await POST(post({ preview_image_url: 'https://x.supabase.co/a.png', name: 'Me' }));
  expect(res.status).toBe(201);
  expect(inserted).toHaveLength(1);
  expect(inserted[0]).toMatchObject({ owner_id: 'user-1', name: 'Me' });
});

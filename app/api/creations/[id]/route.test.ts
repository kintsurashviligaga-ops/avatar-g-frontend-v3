/** @jest-environment node */
/**
 * GET /api/creations/:id — the owner can open their own private creation (the select used to omit user_id, so the
 * owner check was false for everyone and owners got 403), strangers still cannot, and user_id is never returned.
 */
let mockUser: { id: string } | null = null;
let mockRow: Record<string, unknown> | null = null;
let mockSelect = '';
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: async () => mockUser }));
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = (s: string) => { mockSelect = s; return chain; };
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: mockRow, error: null });
      return chain;
    },
  }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const OWNER = '11111111-1111-4111-8111-111111111111';
const req = () => new NextRequest('https://myavatar.ge/api/creations/c1');
const get = async () => {
  const res = await GET(req(), { params: { id: 'c1' } });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  mockUser = null;
  mockRow = { id: 'c1', user_id: OWNER, kind: 'video', title: 'Mine', url: 'https://x/v.mp4', is_public: false };
});

test('the owner opens their own PRIVATE creation (was 403)', async () => {
  mockUser = { id: OWNER };
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.json.creation).toMatchObject({ id: 'c1', title: 'Mine', is_public: false });
  expect(mockSelect).toContain('user_id');
});

test('another signed-in user and an anonymous visitor are still refused a private creation', async () => {
  mockUser = { id: '99999999-9999-4999-8999-999999999999' };
  expect((await get()).status).toBe(403);
  mockUser = null;
  expect((await get()).status).toBe(403);
});

test('a public creation is readable by anyone — without its owner id', async () => {
  mockRow = { ...mockRow!, is_public: true };
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.json.creation).not.toHaveProperty('user_id');
});

test('the owner’s response does not carry user_id either', async () => {
  mockUser = { id: OWNER };
  expect((await get()).json.creation).not.toHaveProperty('user_id');
});

test('unknown id → 404', async () => {
  mockRow = null;
  expect((await get()).status).toBe(404);
});

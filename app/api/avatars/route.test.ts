/** @jest-environment node */
/**
 * GET /api/avatars — only the session's own rows.
 *
 * ⚠️ `?owner_id=<uuid>` used to stand in for a missing session and the query runs on the service role, so anyone could
 * list another user's avatars, voice id (a clone) included. Pinned: without a valid Bearer session the answer is
 * empty and the table is never read; with one, the filter is the session user, whatever `owner_id` says.
 */
const queried: Array<{ column: string; value: unknown }> = [];
let sessionUser: { id: string } | null = null;
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => (sessionUser ? { data: { user: sessionUser }, error: null } : { data: { user: null }, error: new Error('bad jwt') })),
    },
    from: () => {
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          queried.push({ column, value });
          return q;
        },
        order: () => q,
        range: async () => ({ data: [{ id: 'a1' }], error: null, count: 1 }),
      };
      return q;
    },
  })),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const VICTIM = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const get = (qs: string, token?: string) =>
  GET(new NextRequest(`https://myavatar.ge/api/avatars${qs}`, token ? { headers: { authorization: `Bearer ${token}` } } : {}));

const ENV = { ...process.env };
beforeEach(() => {
  queried.length = 0;
  sessionUser = null;
  process.env = { ...ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role' };
});
afterEach(() => {
  process.env = { ...ENV };
});

test("no session + ?owner_id=<someone> → empty, and nobody's rows are read", async () => {
  const res = await get(`?owner_id=${VICTIM}`);
  expect(res.status).toBe(200);
  expect(JSON.stringify(await res.json())).toContain('"avatars":[]');
  expect(queried).toEqual([]);
});

test('an invalid Bearer token is no session either', async () => {
  const res = await get(`?owner_id=${VICTIM}`, 'forged');
  expect(JSON.stringify(await res.json())).toContain('"avatars":[]');
  expect(queried).toEqual([]);
});

test('a session reads its own rows, whatever owner_id says', async () => {
  sessionUser = { id: ME };
  const res = await get(`?owner_id=${VICTIM}`, 'good');
  expect(res.status).toBe(200);
  expect(queried).toEqual([{ column: 'owner_id', value: ME }]);
});

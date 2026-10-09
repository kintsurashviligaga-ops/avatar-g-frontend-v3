/** @jest-environment node */
/**
 * GET /api/avatars/latest reads the session user's rows by `user_id`, the column `avatars` actually has (Production and
 * every migration in this repo); `owner_id` exists nowhere, so the old filter always came back null.
 */
const queried: Array<{ column: string; value: unknown }> = [];
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: () => {
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          queried.push({ column, value });
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: { id: 'a1', image_url: 'https://example.com/a.png' }, error: null }),
      };
      return q;
    },
  })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { READ: {} } }));
let sessionUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: sessionUser })) }));

import { NextRequest } from 'next/server';
import { GET } from './route';

const ME = '22222222-2222-4222-8222-222222222222';
const get = (qs = '') => GET(new NextRequest(`https://myavatar.ge/api/avatars/latest${qs}`));

beforeEach(() => {
  queried.length = 0;
  sessionUser = null;
});

test('a session reads its own latest avatar by user_id', async () => {
  sessionUser = { id: ME };
  const res = await get();
  expect(res.status).toBe(200);
  expect(queried).toEqual([{ column: 'user_id', value: ME }]);
  expect(JSON.stringify(await res.json())).toContain('https://example.com/a.png');
});

test('no session reads nothing', async () => {
  const res = await get(`?owner_id=${ME}`);
  expect(JSON.stringify(await res.json())).toContain('"avatar":null');
  expect(queried).toEqual([]);
});

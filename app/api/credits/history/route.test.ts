/** @jest-environment node */
/**
 * /api/credits/history reads the caller's rows of the authoritative credit ledger; the client-writable
 * POST /api/credits/record (which trusted a browser-supplied creditsDelta) is gone, and nothing calls it.
 */
import fs from 'fs';
import path from 'path';

let mockUser: { id: string } | null = null;
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
const mockQueries: Array<{ table: string; select?: string; eq: Array<[string, unknown]>; limit?: number }> = [];

const mockSupabase = {
  from: (table: string) => {
    const q: { table: string; select?: string; eq: Array<[string, unknown]>; limit?: number } = { table, eq: [] };
    mockQueries.push(q);
    const chain: Record<string, unknown> = {};
    chain.select = (s: string) => { q.select = s; return chain; };
    chain.eq = (c: string, v: unknown) => { q.eq.push([c, v]); return chain; };
    chain.order = () => chain;
    chain.limit = (n: number) => { q.limit = n; return Promise.resolve(mockResult); };
    return chain;
  },
};
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ supabase: mockSupabase, user: mockUser }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { HISTORY_ACTIONS } from '../../../../lib/billing/creditHistory';

const req = (qs = '') => new NextRequest(`https://myavatar.ge/api/credits/history${qs}`);

beforeEach(() => {
  mockUser = { id: 'u1' };
  mockResult = { data: [], error: null };
  mockQueries.length = 0;
});

test('reads the signed-in user’s own credit_ledger rows and maps them for the UI', async () => {
  mockResult = {
    data: [
      { delta: -10, reason: 'commit', metadata: { ref: 'image:p1' }, created_at: '2026-10-08T12:00:00Z' },
      { delta: 100, reason: 'purchase', metadata: { ref: 'stripe:cs_1' }, created_at: '2026-10-07T12:00:00Z' },
    ],
    error: null,
  };
  const res = await GET(req('?limit=5'));
  expect(await res.json()).toEqual({
    items: [
      { action: 'image', creditsDelta: -10, createdAt: '2026-10-08T12:00:00Z' },
      { action: 'topup', creditsDelta: 100, createdAt: '2026-10-07T12:00:00Z' },
    ],
  });
  expect(mockQueries).toEqual([{ table: 'credit_ledger', select: 'delta, reason, metadata, created_at', eq: [['user_id', 'u1']], limit: 5 }]);
});

test('defaults to 10 rows and caps at 50', async () => {
  await GET(req());
  await GET(req('?limit=500'));
  expect(mockQueries.map((q) => q.limit)).toEqual([10, 50]);
});

test('anonymous or a ledger error → empty list (fail-open)', async () => {
  mockUser = null;
  expect(await (await GET(req())).json()).toEqual({ items: [] });
  expect(mockQueries).toHaveLength(0);
  mockUser = { id: 'u1' };
  mockResult = { data: null, error: { message: 'boom' } };
  expect(await (await GET(req())).json()).toEqual({ items: [] });
});

test('POST /api/credits/record no longer exists and no client code calls it', () => {
  const root = path.join(__dirname, '..', '..', '..', '..');
  expect(fs.existsSync(path.join(root, 'app', 'api', 'credits', 'record', 'route.ts'))).toBe(false);
  for (const f of ['components/studio/OmniStudio.tsx', 'components/settings/SettingsView.tsx']) {
    expect(fs.readFileSync(path.join(root, f), 'utf8')).not.toMatch(/fetch\(\s*['"`]\/api\/credits\/record/);
  }
});

test('the Settings history has a label for every action the ledger mapping can produce', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'components', 'settings', 'SettingsView.tsx'), 'utf8');
  const table = src.slice(src.indexOf('const ACTION_LABEL'), src.indexOf('function CreditHistorySection'));
  for (const a of HISTORY_ACTIONS) expect(table).toMatch(new RegExp(`\\n\\s*${a}: \\{ emoji:`));
});

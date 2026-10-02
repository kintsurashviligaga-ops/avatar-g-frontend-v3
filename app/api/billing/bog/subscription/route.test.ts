/** @jest-environment node */
/**
 * /api/billing/bog/subscription — show the live plan; cancelling stops renewal and deletes the saved card at BOG.
 */
jest.mock('server-only', () => ({}));

let mockUserId: string | null = 'user-1';
jest.mock('../../../../../lib/supabase/auth', () => ({
  requireAuthenticatedUser: jest.fn(async () => {
    if (!mockUserId) throw new Error('UNAUTHENTICATED');
    return { id: mockUserId };
  }),
}));
import { fakeSupabase, type FakeCall } from '../../../../../lib/billing/__testing__/fakeSupabase';
let mockRows: unknown[] = [];
let mockLog: FakeCall[] = [];
jest.mock('../../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => {
    const f = fakeSupabase(() => ({ data: mockRows }));
    mockLog = f.log;
    return f.client;
  },
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { WRITE: {} } }));
const mockDelete = jest.fn(async () => true);
jest.mock('../../../../../lib/billing/bogClient', () => ({
  bogConfig: () => ({}),
  deleteSavedCard: (...a: unknown[]) => (mockDelete as (...x: unknown[]) => Promise<boolean>)(...a),
}));

import { NextRequest } from 'next/server';
import { DELETE, GET } from './route';

const req = (method: string) => new NextRequest('https://myavatar.ge/api/billing/bog/subscription', { method });

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 'user-1';
  mockRows = [];
});

test('401 for a guest', async () => {
  mockUserId = null;
  expect((await GET(req('GET'))).status).toBe(401);
  expect((await DELETE(req('DELETE'))).status).toBe(401);
});

test('GET: no live plan → null; otherwise the HIGHEST live tier, with whether it renews', async () => {
  expect(await (await GET(req('GET'))).json()).toEqual({ plan: null });
  mockRows = [
    { tier: 'starter', status: 'active', current_period_end: '2026-10-20T00:00:00Z', cancel_at_period_end: true, bog_parent_order_id: 'p1', card_mask: null, amount_gel: '54.00' },
    { tier: 'business', status: 'active', current_period_end: '2026-11-02T00:00:00Z', cancel_at_period_end: false, bog_parent_order_id: 'p2', card_mask: '548888xxxxxx9893', amount_gel: '216.00' },
  ];
  expect(await (await GET(req('GET'))).json()).toEqual({
    plan: { tier: 'business', status: 'active', currentPeriodEnd: '2026-11-02T00:00:00Z', autoRenew: true, cardMask: '548888xxxxxx9893', amountGel: 216 },
  });
  const q = mockLog[mockLog.length - 1];
  expect(q.filters).toEqual(expect.arrayContaining([['eq', 'user_id', 'user-1'], ['eq', 'provider', 'bog']]));
});

test('DELETE: stops renewal for the caller’s own live plans and deletes their saved cards at BOG', async () => {
  mockRows = [{ bog_parent_order_id: 'p2' }, { bog_parent_order_id: null }];
  const res = await DELETE(req('DELETE'));
  expect(await res.json()).toEqual({ canceled: 2 });
  const upd = mockLog.find((c) => c.op === 'update');
  expect(upd?.args[0]).toMatchObject({ cancel_at_period_end: true });
  expect(upd?.filters).toEqual(expect.arrayContaining([['eq', 'user_id', 'user-1'], ['eq', 'cancel_at_period_end', false]]));
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'p2');
});

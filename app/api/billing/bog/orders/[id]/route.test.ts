/** @jest-environment node */
/**
 * GET /api/billing/bog/orders/[id] — owner-only, and a pending order is reconciled with BOG on the spot.
 */
jest.mock('server-only', () => ({}));

let mockUserId: string | null = 'user-1';
jest.mock('../../../../../../lib/supabase/auth', () => ({
  requireAuthenticatedUser: jest.fn(async () => {
    if (!mockUserId) throw new Error('UNAUTHENTICATED');
    return { id: mockUserId };
  }),
}));
import { fakeSupabase } from '../../../../../../lib/billing/__testing__/fakeSupabase';
let mockSub: unknown = null;
jest.mock('../../../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => fakeSupabase((c) => (c.table === 'subscriptions' ? { data: mockSub } : {})).client,
}));
jest.mock('../../../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null) }));
let mockConfigured = true;
jest.mock('../../../../../../lib/billing/bogClient', () => ({ bogConfig: () => (mockConfigured ? {} : null) }));
const mockLoad = jest.fn();
const mockReconcile = jest.fn();
jest.mock('../../../../../../lib/billing/bogSettlement', () => ({
  ...jest.requireActual('../../../../../../lib/billing/bogSettlement'),
  loadBogOrder: (...a: unknown[]) => mockLoad(...a),
  reconcileBogOrder: (...a: unknown[]) => mockReconcile(...a),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const ID = 'myavatar-topup-0123456789abcdef';
const get = (id: string) => GET(new NextRequest(`https://myavatar.ge/api/billing/bog/orders/${id}`), { params: { id } });
const row = (o: Record<string, unknown> = {}) => ({
  shop_order_id: ID, bog_order_id: 'bog-1', user_id: 'user-1', amount_gel: 20, status: 'pending', kind: 'topup',
  tier: null, credits: 200, subscription_id: null, card_saved: false, period_end: null, ...o,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 'user-1';
  mockConfigured = true;
  mockSub = null;
});

test('401 for a guest; 404 for a malformed id or someone else’s order', async () => {
  mockUserId = null;
  expect((await get(ID)).status).toBe(401);
  mockUserId = 'user-1';
  expect((await get("1' or '1'='1")).status).toBe(404);
  expect(mockLoad).not.toHaveBeenCalled();
  mockLoad.mockResolvedValueOnce(row({ user_id: 'someone-else' }));
  expect((await get(ID)).status).toBe(404);
});

test('a pending order is reconciled with BOG and re-read — the customer sees the credits land', async () => {
  mockLoad.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: 'completed' }));
  mockReconcile.mockResolvedValueOnce({ status: 'completed' });
  const res = await get(ID);
  expect(await res.json()).toEqual({ orderId: ID, kind: 'topup', status: 'completed', credits: 200, tier: null, periodEnd: null, autoRenew: null });
  expect(mockReconcile).toHaveBeenCalledTimes(1);
});

test('still processing at BOG → pending; BOG not configured → no reconcile attempt', async () => {
  mockLoad.mockResolvedValueOnce(row());
  mockReconcile.mockResolvedValueOnce({ status: 'pending' });
  expect((await (await get(ID)).json()).status).toBe('pending');
  mockConfigured = false;
  mockLoad.mockResolvedValueOnce(row());
  await get(ID);
  expect(mockReconcile).toHaveBeenCalledTimes(1);
});

test('statuses are translated for the customer: expired/rejected → failed, amount_mismatch → review', async () => {
  mockLoad.mockResolvedValueOnce(row({ status: 'expired' }));
  expect((await (await get(ID)).json()).status).toBe('failed');
  mockLoad.mockResolvedValueOnce(row({ status: 'amount_mismatch' }));
  expect((await (await get(ID)).json()).status).toBe('review');
});

test('a paid plan reports its tier, period end and whether it renews', async () => {
  mockLoad.mockResolvedValueOnce(row({ shop_order_id: 'myavatar-plan-0123456789abcdef', kind: 'subscription', status: 'completed', tier: 'creator', credits: 525, subscription_id: 'sub-1', period_end: '2026-11-02T10:00:00Z' }));
  mockSub = { cancel_at_period_end: false, bog_parent_order_id: 'bog-1' };
  const body = await (await get('myavatar-plan-0123456789abcdef')).json();
  expect(body).toMatchObject({ kind: 'subscription', status: 'completed', credits: 525, tier: 'creator', periodEnd: '2026-11-02T10:00:00Z', autoRenew: true });
});

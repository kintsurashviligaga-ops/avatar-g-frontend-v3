/** @jest-environment node */
/**
 * /api/cron/drain-renders — the unpolled-job settle leg runs on every authorised tick (it is verdict-based, so it
 * cannot kill a live render), while the age-based reap leg stays behind RENDER_DRAINER_ENABLED and never touches a
 * `_settle` row. Before this, an avatar / motion / 3D job whose browser stopped polling was never refunded at all.
 */
jest.mock('server-only', () => ({}));

type Row = { id: string; status: string; updated_at: string; user_id: string; params: Record<string, unknown> };
let reapRows: Row[] = [];
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const b = {
        select: () => b, eq: () => b, lt: () => b, order: () => b,
        limit: async () => ({ data: reapRows, error: null }),
      };
      return b;
    },
  }),
}));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ failJob: jest.fn(async () => undefined) }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 20 })) }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/observability/reliability', () => ({ opsMarker: jest.fn() }));

const settleDeps = {
  listStale: jest.fn(async () => [] as unknown[]),
  poll: jest.fn(),
  deliver: jest.fn(),
  refund: jest.fn(),
  fail: jest.fn(),
  now: () => Date.now(),
};
jest.mock('../../../../lib/orchestrator/unpolledSettleRuntime', () => ({ createSettleDeps: jest.fn(() => settleDeps) }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { failJob } from '../../../../lib/orchestrator/jobs';
import { refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { settleParams } from '../../../../lib/orchestrator/unpolledSettle';

const ENV = { ...process.env };
const tick = () => new NextRequest('https://myavatar.ge/api/cron/drain-renders', { headers: { authorization: 'Bearer cron-secret' } });
const STALE = new Date(Date.now() - 2 * 60 * 60_000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, CRON_SECRET: 'cron-secret' };
  delete process.env.RENDER_DRAINER_ENABLED;
  delete process.env.UNPOLLED_SETTLE;
  reapRows = [];
});
afterAll(() => { process.env = ENV; });

test('unauthorised → 403, nothing runs', async () => {
  const res = await GET(new NextRequest('https://myavatar.ge/api/cron/drain-renders'));
  expect(res.status).toBe(403);
  expect(settleDeps.listStale).not.toHaveBeenCalled();
});

test('the settle leg runs even while the reap leg is INERT (RENDER_DRAINER_ENABLED unset)', async () => {
  const j = await (await GET(tick())).json();
  expect(settleDeps.listStale).toHaveBeenCalledTimes(1);
  expect(j).toMatchObject({ ok: true, enabled: false, settle: { examined: 0 } });
});

test('UNPOLLED_SETTLE=0 switches the settle leg off', async () => {
  process.env.UNPOLLED_SETTLE = '0';
  const j = await (await GET(tick())).json();
  expect(settleDeps.listStale).not.toHaveBeenCalled();
  expect(j.settle).toBeNull();
});

test('with the reaper ON, a stale `_settle` row is neither failed nor refunded by it — the settle leg owns it', async () => {
  process.env.RENDER_DRAINER_ENABLED = '1';
  reapRows = [
    { id: 'lipsync:heygen:v1', status: 'processing', updated_at: STALE, user_id: 'user-1', params: settleParams({ kind: 'lipsync', job: 'heygen:v1', ref: 'avatar:lipsync:x:user-1', credits: 20 }) },
    { id: 'img_1', status: 'processing', updated_at: STALE, user_id: 'user-1', params: { _reserve: { ref: 'image:img_1:fp', credits: 2 } } },
  ];
  const j = await (await GET(tick())).json();
  expect(failJob).toHaveBeenCalledTimes(1);
  expect(failJob).toHaveBeenCalledWith('img_1', expect.any(String));
  expect(refundDebitByRef).toHaveBeenCalledTimes(1);
  expect(refundDebitByRef).toHaveBeenCalledWith('user-1', 'image:img_1:fp', 2);
  expect(j).toMatchObject({ enabled: true, drained: 1 });
});

test('with the reaper ON, a queued job with a lease is left to its own sweep (it retries or refunds it itself)', async () => {
  process.env.RENDER_DRAINER_ENABLED = '1';
  const _exec = { kind: 'agent-montage', v: 3, attempt: 1, maxAttempts: 2, owner: 'w-1', leaseUntil: 0 };
  reapRows = [
    { id: 'montage-1', status: 'processing', updated_at: STALE, user_id: 'user-1', params: { _exec, _reserve: { ref: 'agent-montage:montage-1', credits: 5 } } },
    { id: 'img_1', status: 'processing', updated_at: STALE, user_id: 'user-1', params: { _reserve: { ref: 'image:img_1:fp', credits: 2 } } },
  ];
  await GET(tick());
  expect(failJob).toHaveBeenCalledTimes(1);
  expect(failJob).toHaveBeenCalledWith('img_1', expect.any(String));
  expect(refundDebitByRef).toHaveBeenCalledTimes(1);
});

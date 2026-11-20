/** @jest-environment node */
/**
 * The live wiring of the unpolled-job settle sweep (3D only since v5.1 M-14; 3D itself retired, so the verdict comes from our
 * hosted copy alone and nothing reaches Replicate): a delivery writes the SAME row id the status route writes, and a refund goes through refundDebitByRef (`${ref}:refund`,
 * idempotent with the poll routes). Providers, storage, the job table and the ledger are mocked — no network.
 */
jest.mock('server-only', () => ({}));

const queries: Array<Record<string, unknown>> = [];
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = { table };
      const b = {
        select: (cols: string) => { q.select = cols; return b; },
        in: (col: string, vals: unknown[]) => { q.in = [col, vals]; return b; },
        lt: (col: string, v: unknown) => { q.lt = [col, v]; return b; },
        not: (col: string, op: string, v: unknown) => { q.not = [col, op, v]; return b; },
        order: (col: string, o: unknown) => { q.order = [col, o]; return b; },
        limit: async (n: number) => { q.limit = n; queries.push(q); return { data: [{ id: 'r1' }], error: null }; },
      };
      return b;
    },
  }),
}));
jest.mock('./storage-adapter', () => ({
  uploadBufferAndSign: jest.fn(async (_b: string, path: string) => `https://x.supabase.co/sign/${path}`),
  storageObjectExists: jest.fn(async () => null),
  createSignedAssetUrl: jest.fn(async (_b: string, path: string) => `https://x.supabase.co/resigned/${path}`),
}));
jest.mock('./jobs', () => ({
  completeJob: jest.fn(async () => undefined),
  failJob: jest.fn(async () => undefined),
}));
jest.mock('./ledger', () => ({ refundDebitByRef: jest.fn() }));

import { createSettleDeps } from './unpolledSettleRuntime';
import type { SettleRecord, SettleRow } from './unpolledSettle';
import { storageObjectExists } from './storage-adapter';
import { completeJob } from './jobs';
import { refundDebitByRef } from './ledger';

const deps = createSettleDeps()!;
const rec = (kind: SettleRecord['kind'], job: string): SettleRecord => ({ v: 1, kind, job, ref: `${kind}:ref`, credits: 20 });
const row = (id: string): SettleRow => ({ id, user_id: 'user-1', status: 'processing', created_at: new Date().toISOString(), params: {} });
const realFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  queries.length = 0;
  global.fetch = jest.fn(async () => new Response(new Uint8Array(4096), { status: 200 })) as unknown as typeof fetch;
});
afterAll(() => { global.fetch = realFetch; });

test('lists only live rows that carry `_settle`, older than the cutoff, oldest first, bounded', async () => {
  await deps.listStale('2026-10-02T11:30:00.000Z', 7);
  expect(queries[0]).toMatchObject({
    table: 'generation_jobs',
    in: ['status', ['pending', 'processing']],
    lt: ['created_at', '2026-10-02T11:30:00.000Z'],
    not: ['params->_settle', 'is', null],
    order: ['created_at', { ascending: true }],
    limit: 7,
  });
});

describe('poll — our hosted copy decides (3D retired, no provider call)', () => {
  test('model3d: hosted copy → delivered; confirmed absent → failed (refund); unknown → wait', async () => {
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(true);
    expect(await deps.poll(rec('model3d', 'pred1'))).toEqual({ state: 'succeeded', url: '' });
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(false);
    expect(await deps.poll(rec('model3d', 'pred1'))).toMatchObject({ state: 'failed' });
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(null);
    expect(await deps.poll(rec('model3d', 'pred1'))).toEqual({ state: 'processing' }); // never refund on a guess
  });

  test('model3d: a malformed prediction id is never looked up', async () => {
    expect(await deps.poll(rec('model3d', '../../etc'))).toEqual({ state: 'processing' });
    expect(storageObjectExists).not.toHaveBeenCalled();
  });

  test('nothing reaches the network', async () => {
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(false);
    await deps.poll(rec('model3d', 'pred1'));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('deliver — the same row the client route would have written', () => {
  test('model3d: no hosted copy is NOT a delivery', async () => {
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(false);
    expect(await deps.deliver(row('job-1'), rec('model3d', 'pred1'), 'https://replicate.delivery/m.glb')).toBe(false);
    expect(completeJob).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('model3d: an existing hosted copy is handed over', async () => {
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(true);
    expect(await deps.deliver(row('job-1'), rec('model3d', 'pred1'), '')).toBe(true);
    expect(completeJob).toHaveBeenCalledWith('job-1', expect.objectContaining({ result: expect.objectContaining({ predictionId: 'pred1' }) }));
  });
});

test('refund — what the ledger shows under the ref, capped by the record; reported in three outcomes', async () => {
  (refundDebitByRef as jest.Mock).mockResolvedValueOnce({ ok: true, refunded: 20 });
  expect(await deps.refund('user-1', rec('model3d', 'j'))).toBe('refunded');
  expect(refundDebitByRef).toHaveBeenCalledWith('user-1', 'model3d:ref', 20);
  (refundDebitByRef as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'skipped', refunded: 0 });
  expect(await deps.refund('user-1', rec('model3d', 'j'))).toBe('nothing');
  (refundDebitByRef as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'error', refunded: 0 });
  expect(await deps.refund('user-1', rec('model3d', 'j'))).toBe('error');
});

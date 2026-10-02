/** @jest-environment node */
/**
 * The live wiring of the unpolled-job settle sweep: each kind is read through the SAME poller its client route uses,
 * a delivery writes the SAME row id that route writes, and a refund goes through refundDebitByRef (`${ref}:refund`,
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
jest.mock('../ai/lipsync', () => ({ lipsyncFetch: jest.fn() }));
jest.mock('../ai/klingClient', () => ({ klingPoll: jest.fn() }));
jest.mock('../services/model3d/replicate3dClient', () => ({ pollReconstruction: jest.fn(), fetchGlbBuffer: jest.fn(async () => Buffer.from('glb')) }));
jest.mock('../services/model3d/model3dPlan', () => ({ isTerminal: (s: string) => s === 'succeeded' || s === 'failed' }));
jest.mock('./storage-adapter', () => ({
  uploadBufferAndSign: jest.fn(async (_b: string, path: string) => `https://x.supabase.co/sign/${path}`),
  storageObjectExists: jest.fn(async () => null),
  createSignedAssetUrl: jest.fn(async (_b: string, path: string) => `https://x.supabase.co/resigned/${path}`),
}));
jest.mock('./jobs', () => ({
  completeJob: jest.fn(async () => undefined),
  failJob: jest.fn(async () => undefined),
  recordCompletedAsset: jest.fn(async () => true),
  recordCompletedFilm: jest.fn(async () => true),
}));
jest.mock('./ledger', () => ({ refundDebitByRef: jest.fn() }));

import { createSettleDeps } from './unpolledSettleRuntime';
import type { SettleRecord, SettleRow } from './unpolledSettle';
import { lipsyncFetch } from '../ai/lipsync';
import { klingPoll } from '../ai/klingClient';
import { pollReconstruction, fetchGlbBuffer } from '../services/model3d/replicate3dClient';
import { storageObjectExists, uploadBufferAndSign } from './storage-adapter';
import { completeJob, recordCompletedAsset, recordCompletedFilm } from './jobs';
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

describe('poll — the client route’s own reading of each provider', () => {
  test.each([
    [{ status: 'succeeded', url: 'https://cdn/x.mp4', error: null }, { state: 'succeeded', url: 'https://cdn/x.mp4' }],
    [{ status: 'succeeded', url: null, error: null }, { state: 'failed', reason: 'finished without a usable video file' }],
    [{ status: 'failed', url: null, error: 'boom' }, { state: 'failed', reason: 'boom' }],
    [{ status: 'canceled', url: null, error: null }, { state: 'failed', reason: 'render failed' }],
    [{ status: 'processing', url: null, error: null }, { state: 'processing' }],
  ])('lipsync / presenter: %j → %j', async (raw, verdict) => {
    (lipsyncFetch as jest.Mock).mockResolvedValue(raw);
    expect(await deps.poll(rec('presenter', 'heygen:v1'))).toEqual(verdict);
    expect(lipsyncFetch).toHaveBeenCalledWith('heygen:v1');
  });

  test('motion: Kling’s verdict', async () => {
    (klingPoll as jest.Mock).mockResolvedValueOnce({ status: 'failed', url: null, error: 'nsfw' });
    expect(await deps.poll(rec('motion', 'p1'))).toEqual({ state: 'failed', reason: 'nsfw' });
    (klingPoll as jest.Mock).mockResolvedValueOnce({ status: 'processing', url: null });
    expect(await deps.poll(rec('motion', 'p1'))).toEqual({ state: 'processing' });
  });

  test('model3d: failed / mesh / no mesh decided like /status (data_removed, then our hosted copy)', async () => {
    (pollReconstruction as jest.Mock).mockResolvedValueOnce({ status: 'failed', glbUrl: null, error: 'oom' });
    expect(await deps.poll(rec('model3d', 'pred1'))).toEqual({ state: 'failed', reason: 'oom' });
    (pollReconstruction as jest.Mock).mockResolvedValueOnce({ status: 'succeeded', glbUrl: 'https://replicate.delivery/m.glb' });
    expect(await deps.poll(rec('model3d', 'pred1'))).toEqual({ state: 'succeeded', url: 'https://replicate.delivery/m.glb' });
    (pollReconstruction as jest.Mock).mockResolvedValueOnce({ status: 'succeeded', glbUrl: null, dataRemoved: false });
    expect(await deps.poll(rec('model3d', 'pred1'))).toMatchObject({ state: 'failed' });
    (pollReconstruction as jest.Mock).mockResolvedValueOnce({ status: 'succeeded', glbUrl: null, dataRemoved: true });
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(true);
    expect(await deps.poll(rec('model3d', 'pred1'))).toEqual({ state: 'succeeded', url: '' }); // delivered earlier
    (pollReconstruction as jest.Mock).mockResolvedValueOnce({ status: 'succeeded', glbUrl: null, dataRemoved: true });
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(null);
    expect(await deps.poll(rec('model3d', 'pred1'))).toEqual({ state: 'processing' }); // never refund on a guess
  });

  test('model3d: a malformed prediction id is never sent anywhere', async () => {
    expect(await deps.poll(rec('model3d', '../../etc'))).toEqual({ state: 'processing' });
    expect(pollReconstruction).not.toHaveBeenCalled();
  });
});

describe('deliver — the same row the client route would have written', () => {
  test('lipsync: re-hosted, then filed under the row’s own id', async () => {
    expect(await deps.deliver(row('lipsync:heygen:v1'), rec('lipsync', 'heygen:v1'), 'https://cdn/x.mp4')).toBe(true);
    expect(recordCompletedFilm).toHaveBeenCalledWith(expect.objectContaining({ id: 'lipsync:heygen:v1', userId: 'user-1', subtype: 'lipsync', url: expect.stringContaining('supabase.co') }));
  });

  test('motion: re-hosted into the motion bucket and filed as the motion asset', async () => {
    expect(await deps.deliver(row('motion:p1'), rec('motion', 'p1'), 'https://cdn/m.mp4')).toBe(true);
    expect(uploadBufferAndSign).toHaveBeenCalledWith('renders', expect.stringMatching(/^motion-control\/user-1\//), expect.any(Buffer), 'video/mp4', 604_800);
    expect(recordCompletedAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 'motion:p1', subtype: 'motion' }));
  });

  test('a download that fails is NOT a delivery (retried next tick)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(new Response('', { status: 502 }));
    expect(await deps.deliver(row('presenter:v1'), rec('presenter', 'heygen:v1'), 'https://cdn/x.mp4')).toBe(false);
    expect(recordCompletedFilm).not.toHaveBeenCalled();
  });

  test('model3d: an existing hosted copy is handed over without downloading again', async () => {
    (storageObjectExists as jest.Mock).mockResolvedValueOnce(true);
    expect(await deps.deliver(row('job-1'), rec('model3d', 'pred1'), '')).toBe(true);
    expect(fetchGlbBuffer).not.toHaveBeenCalled();
    expect(completeJob).toHaveBeenCalledWith('job-1', expect.objectContaining({ result: expect.objectContaining({ predictionId: 'pred1' }) }));
  });
});

test('refund — what the ledger shows under the ref, capped by the record; reported in three outcomes', async () => {
  (refundDebitByRef as jest.Mock).mockResolvedValueOnce({ ok: true, refunded: 20 });
  expect(await deps.refund('user-1', rec('lipsync', 'j'))).toBe('refunded');
  expect(refundDebitByRef).toHaveBeenCalledWith('user-1', 'lipsync:ref', 20);
  (refundDebitByRef as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'skipped', refunded: 0 });
  expect(await deps.refund('user-1', rec('lipsync', 'j'))).toBe('nothing');
  (refundDebitByRef as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'error', refunded: 0 });
  expect(await deps.refund('user-1', rec('lipsync', 'j'))).toBe('error');
});

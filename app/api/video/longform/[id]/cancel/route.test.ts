/** @jest-environment node */
/**
 * POST /api/video/longform/[id]/cancel with an in-memory database. Rules under test: 404 while the flag is off
 * (before auth); 401 without a session; malformed / missing / someone else's id → the same 404; a finished job → 409;
 * a `directing` job is canceled on the spot (nothing was ever charged); an active job only gets cancel_requested —
 * its status is NEVER written here (a tick may hold its lease and would resurrect it) — and the tick refunds.
 */
jest.mock('server-only', () => ({}));
const mockAuth = jest.fn();
const mockSvc = jest.fn();
jest.mock('../../../../../../lib/supabase/server', () => ({
  authedClientFromRequest: (...a: unknown[]) => mockAuth(...a),
  createServiceRoleClient: (...a: unknown[]) => mockSvc(...a),
}));
jest.mock('../../../../../../lib/api/rate-limit', () => ({ checkRateLimit: async () => null, RATE_LIMITS: { WRITE: {} } }));
jest.mock('../../../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { jobFromRow } from '@/lib/video/longform/rows';
import { FakeDb } from '@/lib/video/longform/testing/fakeDb';

const ID = '11111111-2222-4333-8444-555555555555';
const env = process.env as Record<string, string | undefined>;
let saved: string | undefined;
let db: FakeDb;

const cancel = (id: string) => POST(new NextRequest(`https://myavatar.ge/api/video/longform/${id}/cancel`, { method: 'POST' }), { params: { id } });
const seed = (status: string, o: Record<string, unknown> = {}) => {
  db = new FakeDb({ longform_jobs: [{ id: ID, user_id: 'u1', status, cancel_requested: false, error_code: null, completed_at: null, ...o }] });
};
const statusWrites = () => db.ops.filter((o) => o.op === 'update' && Object.prototype.hasOwnProperty.call(o.payload as object, 'status'));

beforeEach(() => {
  saved = env.LONGFORM_VIDEO_ENABLED;
  env.LONGFORM_VIDEO_ENABLED = '1';
  seed('rendering');
  mockAuth.mockReset().mockResolvedValue({ supabase: {}, user: { id: 'u1' } });
  mockSvc.mockReset().mockImplementation(() => db);
});
afterEach(() => {
  if (saved === undefined) delete env.LONGFORM_VIDEO_ENABLED;
  else env.LONGFORM_VIDEO_ENABLED = saved;
});

test('404 while the flag is off — before auth; 401 without a session', async () => {
  delete env.LONGFORM_VIDEO_ENABLED;
  expect((await cancel(ID)).status).toBe(404);
  expect(mockAuth).not.toHaveBeenCalled();
  env.LONGFORM_VIDEO_ENABLED = 'true';
  mockAuth.mockResolvedValueOnce({ supabase: {}, user: null });
  expect((await cancel(ID)).status).toBe(401);
  expect(db.ops).toEqual([]);
});

test('malformed, missing and someone else\'s job: the same 404, nothing written', async () => {
  expect((await cancel('not-a-uuid')).status).toBe(404);
  expect((await cancel('99999999-2222-4333-8444-555555555555')).status).toBe(404);
  mockAuth.mockResolvedValueOnce({ supabase: {}, user: { id: 'u2' } });
  expect((await cancel(ID)).status).toBe(404);
  expect(db.ops.filter((o) => o.op !== 'select')).toEqual([]);
  expect(db.rows('longform_jobs')[0]).toMatchObject({ status: 'rendering', cancel_requested: false });
});

test('an active job: 202 + cancel_requested — the status is left to the tick (no lease race, the refunds run there)', async () => {
  for (const status of ['planned', 'rendering', 'stitching']) {
    seed(status);
    const res = await cancel(ID);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: ID, status, cancelRequested: true });
    expect(db.rows('longform_jobs')[0]).toMatchObject({ status, cancel_requested: true });
    expect(statusWrites()).toEqual([]);
  }
});

test('a directing job (never queued, never charged) is canceled on the spot', async () => {
  seed('directing');
  const res = await cancel(ID);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: ID, status: 'canceled' });
  const job = jobFromRow(db.rows('longform_jobs')[0]!);
  expect(job).toMatchObject({ status: 'canceled', errorCode: 'canceled_by_user', cancelRequested: true });
  expect(db.rows('longform_jobs')[0]!.completed_at).toEqual(expect.any(String));
  expect(statusWrites()[0]!.filters).toEqual([['eq', 'id', ID], ['eq', 'user_id', 'u1'], ['eq', 'status', 'directing']]);
});

test('a finished job: 409, untouched', async () => {
  for (const status of ['done', 'failed', 'canceled']) {
    seed(status);
    const res = await cancel(ID);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_finished', status });
    expect(db.ops.filter((o) => o.op !== 'select')).toEqual([]);
  }
});

test('a database error is a 503', async () => {
  db.failNext('longform_jobs', 'select');
  expect((await cancel(ID)).status).toBe(503);
  db.failNext('longform_jobs', 'update');
  expect((await cancel(ID)).status).toBe(503);
  expect(db.rows('longform_jobs')[0]!.cancel_requested).toBe(false);
});

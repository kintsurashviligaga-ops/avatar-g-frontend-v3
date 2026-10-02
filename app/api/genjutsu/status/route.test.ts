/** @jest-environment node */
/**
 * GET /api/genjutsu/status — a job is shown only to its payer; a scene is never held open forever; a refund is by ref
 * (what the ledger shows, once) and `refunded: true` only when it landed; a finished clip is filed once.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/genjutsu/veoScene', () => ({ pollScene: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 25 })) }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({
  failJob: jest.fn(async () => undefined),
  jobSnapshot: jest.fn(async () => null),
  recordCompletedFilm: jest.fn(async () => true),
}));
jest.mock('../../../../lib/studio/runtime', () => ({ getStudioRuntime: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { pollScene } from '../../../../lib/genjutsu/veoScene';
import { composeVeoJobId, genjutsuChargeRef, genjutsuJobId, signGenjutsuCharge, withGenjutsuCharge } from '../../../../lib/genjutsu/chargeToken';
import { GENJUTSU_HARD_CAP_MS } from '../../../../lib/genjutsu/serverCommon';
import { refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { failJob, jobSnapshot, recordCompletedFilm } from '../../../../lib/orchestrator/jobs';
import { reportError } from '../../../../lib/observability/report-error';
import { getStudioRuntime } from '../../../../lib/studio/runtime';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OP = 'models/veo-3.1-fast-generate-preview/operations/abc123';

/** A real, authentic polled id for `payer`, created `ageMs` ago. */
function polledId(payer = UID, ageMs = 60_000, aspect: '16:9' | '9:16' = '16:9') {
  const ref = genjutsuChargeRef(payer, UUID);
  const jobId = composeVeoJobId(OP, aspect, Date.now() - ageMs);
  return { ref, id: withGenjutsuCharge(jobId, signGenjutsuCharge({ u: payer, r: ref, j: jobId })!) };
}
const get = (id: string) => GET(new NextRequest(`https://myavatar.ge/api/genjutsu/status?id=${encodeURIComponent(id)}`));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-genjutsu-secret' };
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (refundDebitByRef as jest.Mock).mockResolvedValue({ ok: true, refunded: 25 });
  (jobSnapshot as jest.Mock).mockResolvedValue(null);
});
afterAll(() => { process.env = ENV; });

// ─── who may poll what ──────────────────────────────────────────────────────────────────────────────────────────

test('no session → 401; a missing or oversized id → 400', async () => {
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: null });
  expect((await get(polledId().id)).status).toBe(401);
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  expect((await get('')).status).toBe(400);
  expect((await get('x'.repeat(2000))).status).toBe(400);
  expect(pollScene).not.toHaveBeenCalled();
});

test('a bare operation name, a forged token, another payer\'s token and a malformed id are all 404 — never polled, never refunded', async () => {
  const mine = polledId();
  const forged = mine.id.slice(0, -4) + 'AAAA';
  const theirs = polledId(OTHER);
  for (const id of [OP, `${OP}::16:9::1~gj1.e30.x`, forged, theirs.id, withGenjutsuCharge('not-a-job-id', signGenjutsuCharge({ u: UID, r: mine.ref, j: 'not-a-job-id' })!)]) {
    expect((await get(id)).status).toBe(404);
  }
  expect(pollScene).not.toHaveBeenCalled();
  expect(refundDebitByRef).not.toHaveBeenCalled();
});

// ─── a Veo scene ────────────────────────────────────────────────────────────────────────────────────────────────

test('still rendering → done:false, the operation polled on the NATIVE aspect it was created with', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'processing' });
  const res = await get(polledId(UID, 60_000, '9:16').id);
  expect(await res.json()).toEqual({ success: true, done: false, state: 'processing' });
  expect(pollScene).toHaveBeenCalledWith(OP, '9:16', UID);
});

test('a finished clip that could not be delivered YET stays "delivering" and is retried by the next poll', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'delivering' });
  expect(await (await get(polledId().id)).json()).toEqual({ success: true, done: false, state: 'delivering' });
  expect(refundDebitByRef).not.toHaveBeenCalled();
});

test('ready → the clip is filed in the Library under the reservation\'s own row id, ONCE', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/clip.mp4' });
  const res = await get(polledId().id);
  expect(await res.json()).toEqual({ success: true, done: true, state: 'ready', videoUrl: 'https://signed.example/clip.mp4' });
  expect(recordCompletedFilm).toHaveBeenCalledTimes(1);
  expect((recordCompletedFilm as jest.Mock).mock.calls[0]![0]).toMatchObject({ id: genjutsuJobId(UUID), userId: UID, url: 'https://signed.example/clip.mp4', subtype: 'vfx', orientation: 'landscape' });
  expect(refundDebitByRef).not.toHaveBeenCalled();

  // A re-poll of a finished job re-signs the same object and does NOT re-file it (no second completion notification).
  (jobSnapshot as jest.Mock).mockResolvedValue({ userId: UID, status: 'completed', result: null });
  (recordCompletedFilm as jest.Mock).mockClear();
  expect((await (await get(polledId().id)).json()).done).toBe(true);
  expect(recordCompletedFilm).not.toHaveBeenCalled();
});

test('a vertical scene is filed as vertical', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/clip.mp4' });
  await get(polledId(UID, 60_000, '9:16').id);
  expect((recordCompletedFilm as jest.Mock).mock.calls[0]![0].orientation).toBe('vertical');
});

test('Google\'s safety filter → refunded BY REF, the row closed, a code the studio translates', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'failed', reason: 'filtered' });
  const { id, ref } = polledId();
  const j = await (await get(id)).json();
  expect(j).toEqual({ success: true, done: true, state: 'failed', error: 'content_rejected', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, ref);
  expect(failJob).toHaveBeenCalledWith(genjutsuJobId(UUID), expect.stringContaining('filtered'));
});

test('a failed generation → refunded as generation_failed; the provider\'s words never reach the client', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'failed', reason: 'generation_failed' });
  const j = await (await get(polledId().id)).json();
  expect(j).toMatchObject({ done: true, state: 'failed', error: 'generation_failed', refunded: true });
  expect(JSON.stringify(j)).not.toMatch(/veo|google|vertex|gemini/i);
});

test('a refund that does not land is reported and never claimed', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'failed', reason: 'generation_failed' });
  (refundDebitByRef as jest.Mock).mockResolvedValue({ ok: false, reason: 'error', refunded: 0 });
  const j = await (await get(polledId().id)).json();
  expect(j.refunded).toBe(false);
  expect(reportError).toHaveBeenCalled();
});

test('a scene is never held open forever: past the cap it is refunded and closed', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'processing' });
  const { id, ref } = polledId(UID, GENJUTSU_HARD_CAP_MS + 5_000);
  const j = await (await get(id)).json();
  expect(j).toMatchObject({ done: true, state: 'failed', error: 'provider_unavailable', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, ref);
  expect(failJob).toHaveBeenCalled();
  // …and just inside the cap it is still working.
  (refundDebitByRef as jest.Mock).mockClear();
  expect((await (await get(polledId(UID, GENJUTSU_HARD_CAP_MS - 60_000).id)).json()).done).toBe(false);
  expect(refundDebitByRef).not.toHaveBeenCalled();
});

test('a delivered clip past the cap is still delivered, not refunded (the cap only closes jobs with nothing to show)', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/late.mp4' });
  const j = await (await get(polledId(UID, GENJUTSU_HARD_CAP_MS + 60_000).id)).json();
  expect(j.state).toBe('ready');
  expect(refundDebitByRef).not.toHaveBeenCalled();
});

// ─── a Higgsfield job (the studio saga owns its refunds) ────────────────────────────────────────────────────────

const HF = `hf:${UUID}`;
const job = (over: Record<string, unknown> = {}) => ({ id: UUID, user_id: UID, status: 'in_progress', error_code: null, refund_state: null, output_urls: [], ...over });
function runtime(j: unknown, extra: Record<string, unknown> = {}) {
  const store = { getForUser: jest.fn(async () => j) };
  const saga = { finalize: jest.fn(async (x: unknown) => ({ ...(x as object), status: 'completed', output_urls: [{ bucket: 'renders', path: 'a.mp4' }] })) };
  (getStudioRuntime as jest.Mock).mockReturnValue({ store, saga, signOutputs: jest.fn(async () => ['https://signed.example/hf.mp4']), ...extra });
  return { store, saga };
}

test('hf: the job is read through the saga store scoped to the CALLER — someone else\'s job is a 404', async () => {
  const { store } = runtime(null);
  expect((await get(HF)).status).toBe(404);
  expect(store.getForUser).toHaveBeenCalledWith(UUID, UID);
  expect((await get('hf:not-a-uuid')).status).toBe(404);
});

test('hf: queued and in-progress are "still working"; the saga, not this route, drives the provider', async () => {
  runtime(job({ status: 'queued' }));
  expect(await (await get(HF)).json()).toEqual({ success: true, done: false, state: 'queued' });
  runtime(job({ status: 'in_progress' }));
  expect(await (await get(HF)).json()).toEqual({ success: true, done: false, state: 'processing' });
});

test('hf: a finalizing job is finished on read and its signed clip returned', async () => {
  const { saga } = runtime(job({ status: 'finalizing' }));
  expect(await (await get(HF)).json()).toEqual({ success: true, done: true, state: 'ready', videoUrl: 'https://signed.example/hf.mp4' });
  expect(saga.finalize).toHaveBeenCalledTimes(1);
});

test('hf: failures carry the saga\'s own code and whether the credits came back', async () => {
  runtime(job({ status: 'failed', error_code: 'generation_failed', refund_state: 'done' }));
  expect(await (await get(HF)).json()).toEqual({ success: true, done: true, state: 'failed', error: 'generation_failed', refunded: true });
  runtime(job({ status: 'nsfw', refund_state: 'pending' }));
  expect(await (await get(HF)).json()).toMatchObject({ error: 'content_rejected', refunded: false });
});

test('hf: without a studio runtime the answer is 503, not a crash', async () => {
  (getStudioRuntime as jest.Mock).mockReturnValue(null);
  expect((await get(HF)).status).toBe(503);
});

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
jest.mock('../../../../lib/avatar/voicedClip', () => ({ deliverVoicedAvatar: jest.fn() }));
jest.mock('../../../../lib/video/voicedClip', () => ({ deliverVoicedClip: jest.fn() }));
jest.mock('../../../../lib/video/omniClip', () => ({
  pollOmniClip: jest.fn(), OMNI_USD_PER_SEC: { '720p': 0.10136, '1080p': 0.15204 }, OMNI_INPUT_VIDEO_USD_PER_SEC: 0.008739,
}));

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
import { deliverVoicedAvatar } from '../../../../lib/avatar/voicedClip';
import { deliverVoicedClip } from '../../../../lib/video/voicedClip';
import { pollOmniClip } from '../../../../lib/video/omniClip';
import { composeOmniJobId } from '../../../../lib/genjutsu/chargeToken';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OP = 'models/veo-3.1-fast-generate-preview/operations/abc123';

/** A real, authentic polled id for `payer`, created `ageMs` ago. */
function polledId(payer = UID, ageMs = 60_000, aspect: '16:9' | '9:16' = '16:9', voiced = false, clipSec?: 4 | 6 | 8) {
  const ref = genjutsuChargeRef(payer, UUID);
  const jobId = composeVeoJobId(OP, aspect, Date.now() - ageMs, voiced, clipSec);
  return { ref, id: withGenjutsuCharge(jobId, signGenjutsuCharge({ u: payer, r: ref, j: jobId })!) };
}
/** A 10 s Gemini Omni Flash clip's polled id: the operation is the interaction id. */
const INTERACTION = 'v1_ChBqT21uaVByb2JlMDAx';
function omniPolledId(payer = UID, ageMs = 60_000, aspect: '16:9' | '9:16' = '9:16', edit?: { op: 'edit' | 'extend'; seconds: 4 | 6 | 8 | 10 }) {
  const ref = genjutsuChargeRef(payer, UUID);
  const jobId = composeOmniJobId(INTERACTION, aspect, Date.now() - ageMs, edit);
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

test('still rendering → done:false; a job id that still carries its native aspect polls the same operation', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'processing' });
  const res = await get(polledId(UID, 60_000, '9:16').id);
  expect(await res.json()).toEqual({ success: true, done: false, state: 'processing' });
  // The id format is unchanged (historical ids keep working); Vertex stamps no mark, so nothing is cropped at that size.
  expect(pollScene).toHaveBeenCalledWith(OP, UID);
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

// ─── a talking avatar with its line (GG 2026-10-17 07:54Z), read by Google Cloud TTS since v3.1 withdrew ElevenLabs ──

test('voiced avatar: the clip is shown WITH its line — the voiced file, filed in the Library as an avatar', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/silent.mp4' });
  (deliverVoicedAvatar as jest.Mock).mockResolvedValue('https://signed.example/voiced.mp4');
  const j = await (await get(polledId(UID, 60_000, '9:16', true).id)).json();
  expect(j).toEqual({ success: true, done: true, state: 'ready', videoUrl: 'https://signed.example/voiced.mp4' });
  expect(deliverVoicedAvatar).toHaveBeenCalledWith('https://signed.example/silent.mp4', UUID);
  expect((recordCompletedFilm as jest.Mock).mock.calls[0]![0]).toMatchObject({ id: genjutsuJobId(UUID), url: 'https://signed.example/voiced.mp4', subtype: 'avatar', prompt: 'Avatar', orientation: 'vertical' });
  // The stored result names the voice that read the line: Google Cloud TTS, never a withdrawn vendor.
  expect((recordCompletedFilm as jest.Mock).mock.calls[0]![0].result).toMatchObject({ op: 'avatar', voice: 'google-cloud-tts' });
});

test('voiced avatar: a clip whose line is not on it yet is never shown silent — "delivering", then refunded at the cap', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/silent.mp4' });
  (deliverVoicedAvatar as jest.Mock).mockResolvedValue(null);
  expect(await (await get(polledId(UID, 60_000, '9:16', true).id)).json()).toEqual({ success: true, done: false, state: 'delivering' });
  expect(recordCompletedFilm).not.toHaveBeenCalled();
  expect(refundDebitByRef).not.toHaveBeenCalled();
  const { id, ref } = polledId(UID, GENJUTSU_HARD_CAP_MS + 5_000, '9:16', true);
  expect(await (await get(id)).json()).toMatchObject({ done: true, state: 'failed', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, ref);
});

test('an unvoiced scene never goes through the voice leg', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/clip.mp4' });
  await get(polledId().id);
  expect(deliverVoicedAvatar).not.toHaveBeenCalled();
});

// ─── the video service's direct clip (GG 2026-10-25: one clip like Gemini's Veo) ────────────────────────────────

test('direct clip: filed in the Library under the user\'s own prompt as a video, with its length', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/clip.mp4' });
  (jobSnapshot as jest.Mock).mockResolvedValue({ userId: UID, status: 'processing', result: null, params: { prompt: 'ზღვის პირას მზის ჩასვლა' } });
  const j = await (await get(polledId(UID, 60_000, '9:16', false, 6).id)).json();
  expect(j).toEqual({ success: true, done: true, state: 'ready', videoUrl: 'https://signed.example/clip.mp4' });
  expect(deliverVoicedClip).not.toHaveBeenCalled();
  expect((recordCompletedFilm as jest.Mock).mock.calls[0]![0]).toMatchObject({
    id: genjutsuJobId(UUID), url: 'https://signed.example/clip.mp4', prompt: 'ზღვის პირას მზის ჩასვლა', subtype: 'video', orientation: 'vertical',
    result: { kind: 'video', op: 'clip', seconds: 6 },
  });
});

test('direct clip with a Georgian line: shown only WITH the line, at the clip\'s own length; "delivering" until then', async () => {
  (pollScene as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/veo.mp4' });
  (deliverVoicedClip as jest.Mock).mockResolvedValue(null);
  expect(await (await get(polledId(UID, 60_000, '16:9', true, 4).id)).json()).toEqual({ success: true, done: false, state: 'delivering' });
  expect(deliverVoicedClip).toHaveBeenCalledWith('https://signed.example/veo.mp4', UUID, 4);
  expect(deliverVoicedAvatar).not.toHaveBeenCalled();
  expect(recordCompletedFilm).not.toHaveBeenCalled();

  (deliverVoicedClip as jest.Mock).mockResolvedValue('https://signed.example/voiced.mp4');
  const j = await (await get(polledId(UID, 60_000, '16:9', true, 4).id)).json();
  expect(j.videoUrl).toBe('https://signed.example/voiced.mp4');
  expect((recordCompletedFilm as jest.Mock).mock.calls[0]![0]).toMatchObject({ subtype: 'video', prompt: 'Video', result: { op: 'clip', seconds: 4, voice: 'google-cloud-tts' } });
});

// ─── the 10 s clip on Gemini Omni Flash (GG card 2026-10-25 16:51Z) ──────────────────────────────────────────────

test('a 10 s clip is polled on Omni at the clip\'s own path, never on Veo; filed with its resolution, usage and list cost', async () => {
  (pollOmniClip as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/omni.mp4', usage: { total_output_tokens: 86_880 } });
  (jobSnapshot as jest.Mock).mockResolvedValue({ userId: UID, status: 'processing', result: null, params: { prompt: 'ქალი იღიმება', resolution: '1080p', engine: 'omni' } });
  const j = await (await get(omniPolledId().id)).json();
  expect(j).toEqual({ success: true, done: true, state: 'ready', videoUrl: 'https://signed.example/omni.mp4' });
  expect(pollOmniClip).toHaveBeenCalledWith(INTERACTION, `video-clip/${UUID}/omni.mp4`);
  expect(pollScene).not.toHaveBeenCalled();
  expect(deliverVoicedClip).not.toHaveBeenCalled();
  expect((recordCompletedFilm as jest.Mock).mock.calls[0]![0]).toMatchObject({
    id: genjutsuJobId(UUID), prompt: 'ქალი იღიმება', subtype: 'video', orientation: 'vertical', costUsd: 1.5204,
    result: { kind: 'video', op: 'clip', seconds: 10, engine: 'gemini-omni-flash', resolution: '1080p', usage: { total_output_tokens: 86_880 } },
  });
  expect((recordCompletedFilm as jest.Mock).mock.calls[0]![0].result).not.toHaveProperty('voice');
});

test('an Omni clip that fails is refunded by ref and closed under its engine; a slow one is still refunded at the cap', async () => {
  (pollOmniClip as jest.Mock).mockResolvedValue({ state: 'failed', reason: 'filtered' });
  const j = await (await get(omniPolledId().id)).json();
  expect(j).toEqual({ success: true, done: true, state: 'failed', error: 'content_rejected', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, genjutsuChargeRef(UID, UUID));
  expect(failJob).toHaveBeenCalledWith(genjutsuJobId(UUID), 'omni filtered');

  (pollOmniClip as jest.Mock).mockResolvedValue({ state: 'processing' });
  expect(await (await get(omniPolledId(UID, 60_000).id)).json()).toEqual({ success: true, done: false, state: 'processing' });
  expect(await (await get(omniPolledId(UID, GENJUTSU_HARD_CAP_MS + 1_000).id)).json())
    .toEqual({ success: true, done: true, state: 'failed', error: 'provider_unavailable', refunded: true });
  expect(pollScene).not.toHaveBeenCalled();
});

test('an uploaded video, edited: polled at the same hosted path; filed as the edit with its billed seconds and input cost', async () => {
  (pollOmniClip as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/edited.mp4', usage: { total_output_tokens: 28_960 } });
  (jobSnapshot as jest.Mock).mockResolvedValue({
    userId: UID, status: 'processing', result: null,
    params: { prompt: 'გააღამე', resolution: '720p', engine: 'omni', op: 'omni-edit', seconds: 6, inputSec: 5.04, outputSec: 5 },
  });
  const j = await (await get(omniPolledId(UID, 60_000, '9:16', { op: 'edit', seconds: 6 }).id)).json();
  expect(j).toEqual({ success: true, done: true, state: 'ready', videoUrl: 'https://signed.example/edited.mp4' });
  expect(pollOmniClip).toHaveBeenCalledWith(INTERACTION, `video-clip/${UUID}/omni.mp4`);
  const filed = (recordCompletedFilm as jest.Mock).mock.calls[0]![0];
  expect(filed).toMatchObject({
    prompt: 'გააღამე', subtype: 'video', orientation: 'vertical',
    result: { kind: 'video', op: 'omni-edit', seconds: 5, billedSeconds: 6, inputSeconds: 5.04, engine: 'gemini-omni-flash', resolution: '720p' },
  });
  // The rendered seconds at Omni's list rate, and the input video's own tokens.
  expect(filed.costUsd).toBeCloseTo(5 * 0.10136 + 5.04 * 0.008739, 4);
});

test('an uploaded video, extended: filed as the extend, the result the video and the new seconds together', async () => {
  (pollOmniClip as jest.Mock).mockResolvedValue({ state: 'ready', url: 'https://signed.example/extended.mp4' });
  (jobSnapshot as jest.Mock).mockResolvedValue({
    userId: UID, status: 'processing', result: null,
    params: { prompt: 'ის კარს აღებს', resolution: '1080p', engine: 'omni', op: 'omni-extend', seconds: 8, inputSec: 4, outputSec: 12 },
  });
  await get(omniPolledId(UID, 60_000, '16:9', { op: 'extend', seconds: 8 }).id);
  const filed = (recordCompletedFilm as jest.Mock).mock.calls[0]![0];
  expect(filed).toMatchObject({ orientation: 'landscape', result: { op: 'omni-extend', seconds: 12, billedSeconds: 8, inputSeconds: 4, resolution: '1080p' } });
  // Only the new seconds are rendered and billed; the input's tokens are.
  expect(filed.costUsd).toBeCloseTo(8 * 0.15204 + 4 * 0.008739, 4);
});

test('a failed edit is refunded by ref like the clip', async () => {
  (pollOmniClip as jest.Mock).mockResolvedValue({ state: 'failed', reason: 'filtered' });
  const j = await (await get(omniPolledId(UID, 60_000, '9:16', { op: 'extend', seconds: 4 }).id)).json();
  expect(j).toMatchObject({ state: 'failed', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, genjutsuChargeRef(UID, UUID));
});

test('an Omni id is shown only to its payer', async () => {
  expect((await get(omniPolledId(OTHER).id)).status).toBe(404);
  expect(pollOmniClip).not.toHaveBeenCalled();
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

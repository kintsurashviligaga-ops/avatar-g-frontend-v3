/** @jest-environment node */
/**
 * POST /api/video/omni-edit — an uploaded video edited or extended by Gemini Omni Flash (GG 2026-10-25 16:58Z; card 17:04Z).
 * Every provider and the ledger mocked: no network, no spend. The video is the caller's own upload, measured and re-encoded
 * before it is priced; a video Omni cannot take costs nothing; an edit is billed at its own length on the grid, an extend at
 * the new seconds; the card's price is checked before the charge, and a failed submit is refunded by its ref.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: {} }));
jest.mock('../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/genjutsu/serverCommon', () => ({
  ...jest.requireActual('../../../../lib/genjutsu/serverCommon'),
  claimDailySlot: jest.fn(async () => true),
  releaseDailySlot: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  ...jest.requireActual('../../../../lib/orchestrator/idempotency'),
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn(async () => true), failJob: jest.fn(async () => undefined) }));
jest.mock('../../../../lib/server/serviceSwitches', () => ({ serviceOffResponse: jest.fn(async () => null) }));
jest.mock('../../../../lib/security/callerMedia', () => ({ resolveCallerMedia: jest.fn() }));
jest.mock('../../../../lib/video/omniEditInput', () => ({ prepareOmniEditInput: jest.fn() }));
jest.mock('../../../../lib/video/omniClip', () => ({ submitOmniEdit: jest.fn() }));

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { checkRateLimitByKey } from '../../../../lib/api/rate-limit';
import { genjutsuChargeForPolledId, parseVeoJobId } from '../../../../lib/genjutsu/chargeToken';
import { claimDailySlot, releaseDailySlot } from '../../../../lib/genjutsu/serverCommon';
import { claimIdempotencyKey } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { createJob, failJob } from '../../../../lib/orchestrator/jobs';
import { serviceOffResponse } from '../../../../lib/server/serviceSwitches';
import { resolveCallerMedia } from '../../../../lib/security/callerMedia';
import { prepareOmniEditInput } from '../../../../lib/video/omniEditInput';
import { submitOmniEdit } from '../../../../lib/video/omniClip';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const PATH = `omni-uploads/${UID}/clip.mp4`;
const ID = 'v1_ChBqT21uaVByb2JlMDAx';
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/video/omni-edit', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const READY = { ok: true, base64: 'TVA0', mimeType: 'video/mp4', seconds: 5.04, width: 720, height: 1280, bytes: 3_000_000 };
const EDIT = { op: 'edit', prompt: 'გააღამე', video: PATH };
const EXTEND = { op: 'extend', prompt: 'ის კარს აღებს და გადის', video: PATH, seconds: 8 };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-genjutsu-secret' };
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (resolveCallerMedia as jest.Mock).mockResolvedValue({ ok: true, url: 'https://own/signed/clip.mp4', own: true });
  (prepareOmniEditInput as jest.Mock).mockResolvedValue(READY);
  (hasSufficientBalance as jest.Mock).mockResolvedValue(true);
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (submitOmniEdit as jest.Mock).mockResolvedValue({ ok: true, id: ID });
});
afterAll(() => { process.env = ENV; });

test('signed out → 401; the service switch refuses; nothing read or charged', async () => {
  (authedClientFromRequest as jest.Mock).mockResolvedValueOnce({ user: null });
  expect((await POST(post(EDIT))).status).toBe(401);
  (serviceOffResponse as jest.Mock).mockResolvedValueOnce(NextResponse.json({ success: false, error: 'service_off' }, { status: 503 }));
  expect((await POST(post(EDIT))).status).toBe(503);
  expect(resolveCallerMedia).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a bad body is refused free, before the rate limit and before the video is read', async () => {
  for (const body of [{}, { ...EDIT, op: 'remix' }, { ...EDIT, prompt: ' ' }, { ...EDIT, video: '' }, { ...EXTEND, seconds: 5 }, { ...EDIT, resolution: '4k' }]) {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
  }
  expect(checkRateLimitByKey).not.toHaveBeenCalled();
  expect(resolveCallerMedia).not.toHaveBeenCalled();
});

test('the video must be the caller\'s own upload: another account\'s → 403, outside our storage → 400, nothing fetched', async () => {
  (resolveCallerMedia as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'not_owner' });
  expect((await POST(post(EDIT))).status).toBe(403);
  (resolveCallerMedia as jest.Mock).mockResolvedValueOnce({ ok: true, url: 'https://elsewhere.example/x.mp4', own: false });
  const outside = await POST(post({ ...EDIT, video: 'https://elsewhere.example/x.mp4' }));
  expect(outside.status).toBe(400);
  expect((await outside.json()).issues).toEqual([{ path: 'video', code: 'not_own_storage' }]);
  (resolveCallerMedia as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'unavailable' });
  expect((await POST(post(EDIT))).status).toBe(503);
  expect(resolveCallerMedia).toHaveBeenCalledWith(PATH, UID, 600);
  expect(prepareOmniEditInput).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a video Omni cannot take costs nothing: over 10 s, too short to edit, unreadable, too large', async () => {
  (prepareOmniEditInput as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'too_long', seconds: 14.37 });
  const long = await POST(post(EDIT));
  expect(long.status).toBe(422);
  expect(await long.json()).toMatchObject({ error: 'video_too_long', seconds: 14.4, maxSeconds: 10, refunded: false });

  (prepareOmniEditInput as jest.Mock).mockResolvedValueOnce({ ...READY, seconds: 2.2 });
  const short = await POST(post(EDIT));
  expect(short.status).toBe(422);
  expect(await short.json()).toMatchObject({ error: 'video_too_short', seconds: 2.2, minSeconds: 3 });
  // The same 2.2 s is long enough to extend.
  (prepareOmniEditInput as jest.Mock).mockResolvedValueOnce({ ...READY, seconds: 2.2 });
  expect((await POST(post(EXTEND))).status).toBe(202);

  (prepareOmniEditInput as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'unreadable' });
  expect(await (await POST(post(EDIT))).json()).toMatchObject({ error: 'video_unreadable' });
  (prepareOmniEditInput as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'too_large', seconds: 9 });
  expect(await (await POST(post(EDIT))).json()).toMatchObject({ error: 'video_too_large' });
  (prepareOmniEditInput as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'unavailable' });
  expect((await POST(post(EDIT))).status).toBe(503);
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect(claimDailySlot).toHaveBeenCalledTimes(1);
});

test('an edit of a 5 s portrait video: billed as 6 s at 720p (✦48), its own length asked for, the frame kept', async () => {
  const res = await POST(post({ ...EDIT, expectedCredits: 48 }));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j).toMatchObject({ success: true, op: 'edit', credits: 48, seconds: 6, outputSeconds: 5, inputSeconds: 5, resolution: '720p', aspect: '9:16', engine: 'Gemini Omni Flash' });
  expect(j.taskId).toMatch(/^genjutsu:[0-9a-f-]{36}$/);

  const order = [(createJob as jest.Mock).mock.invocationCallOrder[0]!, (deductCredits as jest.Mock).mock.invocationCallOrder[0]!, (submitOmniEdit as jest.Mock).mock.invocationCallOrder[0]!];
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect((createJob as jest.Mock).mock.calls[0][0].params).toMatchObject({
    subtype: 'video', op: 'omni-edit', engine: 'omni', prompt: 'გააღამე', aspect: '9:16', seconds: 6, inputSec: 5.04, outputSec: 5,
    resolution: '720p', _reserve: { credits: 48 },
  });
  expect(deductCredits).toHaveBeenCalledWith(UID, 48, expect.stringMatching(/^genjutsu:reserve:/));
  expect(submitOmniEdit).toHaveBeenCalledWith({
    op: 'edit', prompt: 'გააღამე', video: { base64: 'TVA0', mimeType: 'video/mp4' }, inputSec: 5.04, seconds: 5, resolution: '720p', userId: UID,
  });

  const { jobId, charge } = genjutsuChargeForPolledId(j.jobId);
  expect(charge?.u).toBe(UID);
  expect(parseVeoJobId(jobId)).toMatchObject({ engine: 'omni', omniOp: 'edit', operation: ID, clipSec: 6, aspect: '9:16' });
});

test('an extend by 10 s at 1080p: billed for the new seconds only (✦108); the result is the video and the new part', async () => {
  (prepareOmniEditInput as jest.Mock).mockResolvedValueOnce({ ...READY, seconds: 7.9, width: 1280, height: 720 });
  const j = await (await POST(post({ ...EXTEND, seconds: 10, resolution: '1080p' }))).json();
  expect(j).toMatchObject({ op: 'extend', credits: 108, seconds: 10, outputSeconds: 17.9, inputSeconds: 7.9, resolution: '1080p', aspect: '16:9' });
  expect((submitOmniEdit as jest.Mock).mock.calls[0][0]).toMatchObject({ op: 'extend', seconds: 10, inputSec: 7.9, resolution: '1080p' });
  expect(parseVeoJobId(genjutsuChargeForPolledId(j.jobId).jobId)).toMatchObject({ omniOp: 'extend', clipSec: 10, aspect: '16:9' });
});

test('a stale price on the card is refused before any charge, with the server\'s price; so is a balance that cannot pay', async () => {
  const stale = await POST(post({ ...EDIT, expectedCredits: 34 }));
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ error: 'price_changed', credits: 48, seconds: 6, inputSeconds: 5 });
  (hasSufficientBalance as jest.Mock).mockResolvedValueOnce(false);
  const poor = await POST(post(EDIT));
  expect(poor.status).toBe(402);
  // The least it can cost is checked before the video is even fetched.
  expect(prepareOmniEditInput).toHaveBeenCalledTimes(1);
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a double tap is one edit: the second identical start is refused 409', async () => {
  (claimIdempotencyKey as jest.Mock).mockResolvedValueOnce(false);
  expect((await POST(post(EDIT))).status).toBe(409);
  expect(resolveCallerMedia).not.toHaveBeenCalled();
});

test('the reservation is never taken when the ledger refuses it, and nothing is submitted', async () => {
  (deductCredits as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'insufficient' });
  expect((await POST(post(EDIT))).status).toBe(402);
  expect(failJob).toHaveBeenCalled();
  expect(releaseDailySlot).toHaveBeenCalled();
  expect(submitOmniEdit).not.toHaveBeenCalled();
});

test('Omni refuses the submit → refunded BY REF, the row closed, the slot given back', async () => {
  (submitOmniEdit as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'safety', retryable: false });
  const res = await POST(post(EDIT));
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: 'content_rejected', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, expect.stringMatching(/^genjutsu:reserve:/), 48);
  expect(failJob).toHaveBeenCalledWith(expect.any(String), 'omni edit safety');
  expect(releaseDailySlot).toHaveBeenCalled();

  (submitOmniEdit as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'unavailable', retryable: true });
  const busy = await POST(post(EXTEND));
  expect(busy.status).toBe(503);
  expect(await busy.json()).toMatchObject({ error: 'provider_unavailable', refunded: true });
});

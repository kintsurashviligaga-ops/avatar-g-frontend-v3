/** @jest-environment node */
/**
 * POST /api/video/clip — the video service's one clip, like Gemini's Veo (GG 2026-10-25 16:10Z). Every provider and the
 * ledger mocked: no network, no spend. The user's prompt is read, never rewritten; one photo is the first frame, two or
 * three are references; 4, 6, 8 or 10 s and nothing longer. A Georgian line at any length is Gemini Omni Flash, which
 * says it itself, each person in their own voice, with no narrator (GG 2026-10-26 10:44Z: three people in one TTS
 * voice; card 10:55Z): never Cloud TTS laid over Veo. 10 s is Omni too. The price is the composer's quote (the price
 * book's Omni rows by length and resolution) and is refunded on a failed submit.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: {} }));
jest.mock('../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/genjutsu/veoScene', () => ({ submitScene: jest.fn() }));
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
jest.mock('../../../../lib/video/clipSpeech', () => ({ readClipPrompt: jest.fn() }));
jest.mock('../../../../lib/server/serviceSwitches', () => ({ serviceOffResponse: jest.fn(async () => null) }));
jest.mock('../../../../lib/video/omniClip', () => ({ submitOmniClip: jest.fn() }));
jest.mock('../../../../lib/veo/engine', () => ({ veoModelProblem: jest.fn(() => null) }));

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { checkRateLimitByKey } from '../../../../lib/api/rate-limit';
import { submitScene } from '../../../../lib/genjutsu/veoScene';
import { genjutsuChargeForPolledId, parseVeoJobId } from '../../../../lib/genjutsu/chargeToken';
import { claimIdempotencyKey } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { createJob, failJob } from '../../../../lib/orchestrator/jobs';
import { readClipPrompt } from '../../../../lib/video/clipSpeech';
import { serviceOffResponse } from '../../../../lib/server/serviceSwitches';
import { quoteCredits } from '../../../../lib/credits/quote';
import { DIRECT_CLIP_BODY_MAX_BYTES, DIRECT_CLIP_PHOTO_MAX_BYTES } from '../../../../lib/video/directClip';
import { omniClipCredits } from '../../../../lib/credits/priceBook';
import { submitOmniClip } from '../../../../lib/video/omniClip';
import { veoModelProblem } from '../../../../lib/veo/engine';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const JPEG = `data:image/jpeg;base64,${Buffer.from('a photo of a woman').toString('base64')}`;
const PNG = `data:image/png;base64,${Buffer.from('a product photo').toString('base64')}`;
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/video/clip', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const EN = { english: 'A red fox runs through fresh snow at dawn, slow motion.', lines: [], speakers: [], speaker: null, silent: true };
const KA_LINE = 'გამარჯობა, მეგობრებო!';
const KA = {
  english: 'An old man on a balcony in Tbilisi raises a glass and says [LINE 1]', lines: [KA_LINE],
  speakers: [{ who: 'the old man', voice: 'male' as const }], speaker: 'male' as const, silent: false,
};
/** GG's three lines, verbatim (2026-10-26 10:31Z), as the reader returns them: three people at a podcast table. */
const GG_LINES = ['აგენტ ჯი გესმენია? ხმოვანი ბრძანებებით მართავ და ქართულადაც ესაუბრები!', 'ანუ ქართულად ვეუბნები, რა გააკეთოს?', 'ეს უკვე საინტერესოა!'];
const GG_SPEAKERS = [{ who: 'the man', voice: 'male' as const }, { who: 'the host', voice: 'male' as const }, { who: 'the woman', voice: 'female' as const }];
const GG = (n: number) => ({
  english: ['The man says [LINE 1]', 'The host replies [LINE 2]', 'The woman says [LINE 3]'].slice(3 - n).map((t, i) => t.replace(/\d/, String(i + 1))).join(' '),
  lines: GG_LINES.slice(3 - n), speakers: GG_SPEAKERS.slice(3 - n), speaker: GG_SPEAKERS[3 - n]!.voice, silent: false,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-genjutsu-secret' };
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (submitScene as jest.Mock).mockResolvedValue({ ok: true, operation: 'projects/p/operations/op1', aspect: '9:16', model: 'veo', transport: 'vertex', adjustments: [] });
  (readClipPrompt as jest.Mock).mockResolvedValue(EN);
  (hasSufficientBalance as jest.Mock).mockResolvedValue(true);
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (submitOmniClip as jest.Mock).mockResolvedValue({ ok: true, id: 'v1_ChBqT21uaVByb2JlMDAx' });
});
afterAll(() => { process.env = ENV; });

test('signed out → 401, nothing read, charged or submitted', async () => {
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: null });
  expect((await POST(post({ prompt: 'a fox' }))).status).toBe(401);
  expect(readClipPrompt).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('the admin service switch refuses before anything is charged', async () => {
  (serviceOffResponse as jest.Mock).mockResolvedValueOnce(NextResponse.json({ success: false, error: 'service_off' }, { status: 503 }));
  expect((await POST(post({ prompt: 'a fox' }))).status).toBe(503);
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a bad body is refused free, before the rate limit: no prompt, 9 s, 24 s, a 4k clip, four photos, Lite with references', async () => {
  for (const body of [{}, { prompt: '  ' }, { prompt: 'a fox', seconds: 9 }, { prompt: 'a fox', seconds: 24 }, { prompt: 'a fox', seconds: 10, resolution: '4k' }, { prompt: 'a fox', photos: [JPEG, JPEG, JPEG, JPEG] },
    { prompt: 'a fox', tier: 'lite', photos: [JPEG, PNG] }, { prompt: 'a fox', photos: ['https://elsewhere/x.jpg'] }, { prompt: 'a fox', aspect: '1:1' }]) {
    expect((await POST(post(body))).status).toBe(400);
  }
  expect(checkRateLimitByKey).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
});

test('text only, defaults: ONE 8 s Fast clip at the composer\'s own price; row with _reserve, then the charge, then one submit', async () => {
  const res = await POST(post({ prompt: 'მელია თოვლში მირბის განთიადისას' }));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j).toMatchObject({ success: true, op: 'clip', seconds: 8, resolution: '1080p', engine: 'Veo' });
  // The Renders tray's row for it, which the chat's card claims (the row the job was filed under).
  expect(j.taskId).toMatch(/^genjutsu:[0-9a-f-]{36}$/);
  expect(j.taskId).toBe((createJob as jest.Mock).mock.calls[0][0].id);
  expect(j.credits).toBe(quoteCredits({ tool: 'video', seconds: 8, quality: 'fast' }));
  const order = [(createJob as jest.Mock).mock.invocationCallOrder[0]!, (deductCredits as jest.Mock).mock.invocationCallOrder[0]!, (submitScene as jest.Mock).mock.invocationCallOrder[0]!];
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect((createJob as jest.Mock).mock.calls[0][0].params).toMatchObject({ subtype: 'video', op: 'clip', seconds: 8, prompt: 'მელია თოვლში მირბის განთიადისას', _reserve: { credits: j.credits } });

  const sub = (submitScene as jest.Mock).mock.calls[0][0];
  expect(sub).toMatchObject({ tier: 'fast', durationSec: 8, aspect: '9:16', referenceUrls: [] });
  expect(sub.startImage).toBeUndefined();
  expect(sub.referenceImages).toBeUndefined();
  // The user's scene, translated — and told Veo nobody talks, so it invents no English chatter.
  expect(sub.prompt).toBe(`${EN.english} No dialogue, no voices.`);
  expect(sub.negativePrompt).toContain('subtitles');

  const { jobId, charge } = genjutsuChargeForPolledId(j.jobId);
  expect(charge?.u).toBe(UID);
  expect(parseVeoJobId(jobId)).toMatchObject({ operation: 'projects/p/operations/op1', clipSec: 8, voiced: false });
});

test('one photo is the FIRST FRAME (its own bytes, cropped to fill), at the length chosen — 4 s at 720p, priced for 4 s', async () => {
  const res = await POST(post({ prompt: 'ის იღიმის', photos: [JPEG], seconds: 4, aspect: '16:9' }));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j).toMatchObject({ seconds: 4, resolution: '720p', credits: quoteCredits({ tool: 'video', seconds: 4, quality: 'fast' }) });
  const sub = (submitScene as jest.Mock).mock.calls[0][0];
  expect(sub.startImage).toEqual({ kind: 'bytes', base64: JPEG.split(',')[1], mimeType: 'image/jpeg' });
  expect(sub).toMatchObject({ resizeMode: 'crop', durationSec: 4, aspect: '16:9' });
  expect(sub.prompt).toMatch(/^Start exactly from the first frame/);
});

test('a photo of a real size is read: the body holds three photos at their ceiling, never only 64 KB (GG\'s E2E, 2026-10-25)', async () => {
  // A phone photo as the browser sends it (≤ 1280 px JPEG): a few hundred KB of base64. The route used to read 64 KB of
  // body, so every clip with a photo was refused as „no prompt" before anything else ran.
  const photo = (bytes: number, seed: number) => `data:image/jpeg;base64,${Buffer.alloc(bytes, seed).toString('base64')}`;
  const one = photo(400_000, 7);
  let res = await POST(post({ prompt: 'ის იღიმის', photos: [one] }));
  expect(res.status).toBe(202);
  expect((submitScene as jest.Mock).mock.calls[0][0].startImage).toEqual({ kind: 'bytes', base64: one.split(',')[1], mimeType: 'image/jpeg' });

  const ceiling = [photo(DIRECT_CLIP_PHOTO_MAX_BYTES, 1), photo(DIRECT_CLIP_PHOTO_MAX_BYTES, 2), photo(DIRECT_CLIP_PHOTO_MAX_BYTES, 3)];
  const body = JSON.stringify({ prompt: 'სამივე ერთად სეირნობს', photos: ceiling });
  expect(body.length).toBeLessThan(DIRECT_CLIP_BODY_MAX_BYTES);
  expect(DIRECT_CLIP_BODY_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024); // Vercel's request limit for a function
  res = await POST(post({ prompt: 'სამივე ერთად სეირნობს', photos: ceiling }));
  expect(res.status).toBe(202);
  expect((submitScene as jest.Mock).mock.calls[1][0].referenceImages).toHaveLength(3);

  // A photo over its ceiling is refused free, and so is a body over the cap.
  jest.clearAllMocks();
  for (const photos of [[photo(DIRECT_CLIP_PHOTO_MAX_BYTES + 3, 4)], [photo(1_600_000, 5), photo(1_600_000, 6)]]) {
    expect((await POST(post({ prompt: 'ის იღიმის', photos }))).status).toBe(400);
  }
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('two photos are reference images, and reference mode is 8 s whatever was asked', async () => {
  const res = await POST(post({ prompt: 'ორივე ერთად სეირნობს', photos: [JPEG, PNG], seconds: 4, tier: 'standard' }));
  const j = await res.json();
  expect(j.seconds).toBe(8);
  expect(j.credits).toBe(quoteCredits({ tool: 'video', seconds: 8, quality: 'standard' }));
  const sub = (submitScene as jest.Mock).mock.calls[0][0];
  expect(sub.referenceImages).toEqual([
    { kind: 'bytes', base64: JPEG.split(',')[1], mimeType: 'image/jpeg' },
    { kind: 'bytes', base64: PNG.split(',')[1], mimeType: 'image/png' },
  ]);
  expect(sub.startImage).toBeUndefined();
  expect(sub).toMatchObject({ tier: 'standard', durationSec: 8 });
});

// ─── A Georgian line is Gemini Omni Flash at every length (GG card 2026-10-26 10:55Z) ──────────────────────────────

test('8 s with a Georgian line: Omni says it itself at 1080p for ✦82 — no Cloud TTS, no Veo, no narrator', async () => {
  (readClipPrompt as jest.Mock).mockResolvedValue(KA);
  const res = await POST(post({ prompt: `მოხუცი აივანზე ჭიქას სწევს და ამბობს: „${KA_LINE}“`, speech: 'ka', expectedCredits: 82 }));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j).toMatchObject({ seconds: 8, resolution: '1080p', engine: 'Gemini Omni Flash', credits: 82, speech: 'ka' });
  expect(j.credits).toBe(omniClipCredits('1080p', 8));
  expect(j.voice).toBeUndefined();
  expect(submitScene).not.toHaveBeenCalled();
  const sub = (submitOmniClip as jest.Mock).mock.calls[0][0];
  expect(sub).toMatchObject({ seconds: 8, resolution: '1080p', aspect: '9:16' });
  // The line verbatim, in Georgian letters: Omni speaks Georgian, so nothing is spelled in Latin for its mouth.
  expect(sub.prompt).toContain(`"${KA_LINE}"`);
  expect(sub.prompt).not.toContain('gamarjoba');
  expect(sub.prompt).toContain('The old man (male voice) says the words on screen, once, exactly as written, in natural Georgian, lips in sync. No narrator, no voice-over.');
  expect((createJob as jest.Mock).mock.calls[0][0].params).toMatchObject({ engine: 'omni', seconds: 8, resolution: '1080p', speech: 'ka', _reserve: { credits: 82 } });
  expect(parseVeoJobId(genjutsuChargeForPolledId(j.jobId).jobId)).toMatchObject({ engine: 'omni', clipSec: 8, voiced: false, omniOp: 'clip' });
});

test('each length is priced from the approved Omni rows; a picked 720p stays 720p', async () => {
  (readClipPrompt as jest.Mock).mockResolvedValue(KA);
  for (const [seconds, resolution, credits] of [[4, '1080p', 42], [6, '1080p', 62], [10, '1080p', 102], [6, '720p', 42], [10, '720p', 69]] as const) {
    jest.clearAllMocks();
    (readClipPrompt as jest.Mock).mockResolvedValue(KA);
    const body = { prompt: `მოხუცი ამბობს: „${KA_LINE}“`, seconds, speech: 'ka', expectedCredits: credits, ...(resolution === '720p' ? { resolution } : {}) };
    const j = await (await POST(post(body))).json();
    expect(j).toMatchObject({ seconds, resolution, credits, engine: 'Gemini Omni Flash' });
    expect((submitOmniClip as jest.Mock).mock.calls[0][0]).toMatchObject({ seconds, resolution });
    expect(parseVeoJobId(genjutsuChargeForPolledId(j.jobId).jobId)).toMatchObject({ engine: 'omni', clipSec: seconds });
  }
});

test('a Georgian line the card missed is refused free with the new price, engine and resolution (409), nothing taken', async () => {
  (readClipPrompt as jest.Mock).mockResolvedValue(KA);
  const veo8 = quoteCredits({ tool: 'video', seconds: 8, quality: 'fast' });
  const res = await POST(post({ prompt: 'მოხუცი ამბობს გამარჯობა', expectedCredits: veo8 }));
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ error: 'price_changed', credits: 82, speech: 'ka', engine: 'Gemini Omni Flash', resolution: '1080p', seconds: 8 });
  expect(createJob).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
  expect(submitOmniClip).not.toHaveBeenCalled();
});

test('a speaking clip with two or three photos is refused free: Omni takes one photo, Veo cannot say Georgian', async () => {
  (readClipPrompt as jest.Mock).mockResolvedValue(KA);
  const res = await POST(post({ prompt: 'ორივე ამბობს გამარჯობა', photos: [JPEG, PNG] }));
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: 'speech_one_photo', photos: 2 });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
  expect(submitOmniClip).not.toHaveBeenCalled();
});

test('GG\'s three lines (~11.8 s) do not fit 8 s or 10 s: refused with the estimate and nothing taken; two of them fit 6 s', async () => {
  for (const seconds of [8, 10]) {
    jest.clearAllMocks();
    (readClipPrompt as jest.Mock).mockResolvedValue(GG(3));
    const res = await POST(post({ prompt: 'იგივე პოდკასტი', seconds }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'speech_too_long', seconds: 11.8, maxSeconds: seconds });
    expect(createJob).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(submitOmniClip).not.toHaveBeenCalled();
  }

  jest.clearAllMocks();
  (readClipPrompt as jest.Mock).mockResolvedValue(GG(2));
  const res = await POST(post({ prompt: 'იგივე პოდკასტი', seconds: 6, speech: 'ka', expectedCredits: 62 }));
  expect(res.status).toBe(202);
  const { prompt } = (submitOmniClip as jest.Mock).mock.calls[0][0];
  // Two people, each in their own voice, in the order they speak: never one narrator for both.
  expect(prompt).toContain('The lines are spoken in this order: the host (male voice), then the woman (female voice).');
  expect(prompt).toContain('no two people share a voice. No narrator, no voice-over.');
  expect(prompt).toContain(`"${GG_LINES[1]}"`);
  expect(prompt).toContain(`"${GG_LINES[2]}"`);
});

test('an English line keeps Veo\'s own voice, verbatim — no Omni, no voiced id', async () => {
  (readClipPrompt as jest.Mock).mockResolvedValue({ english: 'A barista smiles and says [LINE 1]', lines: ['Your coffee is ready!'], speakers: [{ who: 'the barista', voice: 'female' }], speaker: 'female', silent: false });
  const j = await (await POST(post({ prompt: 'A barista smiles and says "Your coffee is ready!"' }))).json();
  expect(j).toMatchObject({ engine: 'Veo', seconds: 8 });
  expect(j.speech).toBeUndefined();
  expect(submitOmniClip).not.toHaveBeenCalled();
  expect((submitScene as jest.Mock).mock.calls[0][0].prompt).toBe('A barista smiles and says "Your coffee is ready!" The barista (female voice) says the words on screen, once, exactly as written, lips in sync. No narrator, no voice-over.');
  expect(parseVeoJobId(genjutsuChargeForPolledId(j.jobId).jobId)).toMatchObject({ engine: 'veo', voiced: false });
});

test('a stale price on the card is refused before any charge; so is a balance that cannot pay', async () => {
  expect((await POST(post({ prompt: 'a fox', expectedCredits: 1 }))).status).toBe(409);
  (hasSufficientBalance as jest.Mock).mockResolvedValueOnce(false);
  expect((await POST(post({ prompt: 'a fox' }))).status).toBe(402);
  expect(readClipPrompt).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a Veo tier this deployment cannot render is refused before the slot and the charge; Omni does not ask', async () => {
  (veoModelProblem as jest.Mock).mockImplementation((tier: string) => (tier === 'standard' ? 'model not in this location' : null));
  const res = await POST(post({ prompt: 'a fox in the snow', tier: 'standard' }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: 'tier_unavailable', tier: 'standard', refunded: false });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
  // A Georgian line and 10 s are Omni: the Veo tier on the request does not apply.
  (readClipPrompt as jest.Mock).mockResolvedValue(KA);
  expect((await POST(post({ prompt: `ბიჭი ამბობს: „${KA_LINE}"`, tier: 'standard' }))).status).toBe(202);
  (readClipPrompt as jest.Mock).mockResolvedValue(EN);
  expect((await POST(post({ prompt: 'a fox in the snow', seconds: 10, tier: 'standard' }))).status).toBe(202);
  expect(submitScene).not.toHaveBeenCalled();
  (veoModelProblem as jest.Mock).mockImplementation(() => null);
});

test('a double tap is one clip: the second identical start is refused 409', async () => {
  (claimIdempotencyKey as jest.Mock).mockResolvedValueOnce(false);
  expect((await POST(post({ prompt: 'a fox' }))).status).toBe(409);
  expect(deductCredits).not.toHaveBeenCalled();
});

test('Veo refuses the submit → the reservation is refunded BY REF and the row closed', async () => {
  (submitScene as jest.Mock).mockResolvedValue({ ok: false, reason: 'safety', retryable: false });
  const res = await POST(post({ prompt: 'a fox' }));
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: 'content_rejected', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, expect.stringMatching(/^genjutsu:reserve:/), quoteCredits({ tool: 'video', seconds: 8, quality: 'fast' }));
  expect(failJob).toHaveBeenCalled();
});

test('the reservation is never taken when the ledger refuses it, and no clip is submitted', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'insufficient' });
  expect((await POST(post({ prompt: 'a fox' }))).status).toBe(402);
  expect(submitScene).not.toHaveBeenCalled();
  expect(failJob).toHaveBeenCalled();
});

// ─── 10 s on Gemini Omni Flash (GG card 2026-10-25 16:51Z: 720p ✦69, 1080p ✦102) ─────────────────────────────────

test('10 s, text only: ONE Omni clip at 720p for ✦69, never Veo; the job id names the interaction and the engine', async () => {
  const res = await POST(post({ prompt: 'მელია თოვლში მირბის განთიადისას', seconds: 10 }));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j).toMatchObject({ success: true, op: 'clip', seconds: 10, resolution: '720p', engine: 'Gemini Omni Flash', credits: 69 });
  expect(j.voice).toBeUndefined();
  expect(submitScene).not.toHaveBeenCalled();
  expect(submitOmniClip).toHaveBeenCalledTimes(1);
  const sub = (submitOmniClip as jest.Mock).mock.calls[0][0];
  // Omni takes no negative prompt: on-screen text is ruled out in words.
  expect(sub).toEqual({ prompt: `${EN.english} No dialogue, no voices. No subtitles, captions or on-screen text.`, aspect: '9:16', resolution: '720p', seconds: 10, userId: UID });
  expect((createJob as jest.Mock).mock.calls[0][0].params).toMatchObject({ engine: 'omni', seconds: 10, resolution: '720p', _reserve: { credits: 69 } });
  const order = [(createJob as jest.Mock).mock.invocationCallOrder[0]!, (deductCredits as jest.Mock).mock.invocationCallOrder[0]!, (submitOmniClip as jest.Mock).mock.invocationCallOrder[0]!];
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(parseVeoJobId(genjutsuChargeForPolledId(j.jobId).jobId)).toMatchObject({
    operation: 'v1_ChBqT21uaVByb2JlMDAx', aspect: '9:16', clipSec: 10, engine: 'omni', voiced: false,
  });
});

test('10 s with one photo at 1080p: the photo is Omni\'s first frame, priced ✦102', async () => {
  const res = await POST(post({ prompt: 'ის იღიმის', photos: [JPEG], seconds: 10, resolution: '1080p', aspect: '16:9', expectedCredits: 102 }));
  expect(res.status).toBe(202);
  expect(await res.json()).toMatchObject({ seconds: 10, resolution: '1080p', credits: 102 });
  const sub = (submitOmniClip as jest.Mock).mock.calls[0][0];
  expect(sub.firstFrame).toEqual({ base64: JPEG.split(',')[1], mimeType: 'image/jpeg' });
  expect(sub).toMatchObject({ aspect: '16:9', resolution: '1080p', seconds: 10 });
  expect(sub.prompt).toMatch(/^Start exactly from the first frame/);
});

test('10 s with a Georgian line the card did not flag starts at 1080p (✦102): Omni says it in Georgian, with no narrator and no subtitles', async () => {
  (readClipPrompt as jest.Mock).mockResolvedValue(KA);
  const j = await (await POST(post({ prompt: `მოხუცი აივანზე ჭიქას სწევს და ამბობს: „${KA_LINE}“`, seconds: 10 }))).json();
  expect(j).toMatchObject({ seconds: 10, resolution: '1080p', credits: 102, speech: 'ka' });
  expect(j.voice).toBeUndefined();
  const { prompt } = (submitOmniClip as jest.Mock).mock.calls[0][0];
  expect(prompt).toContain(`"${KA_LINE}"`);
  expect(prompt).not.toContain('gamarjoba');
  expect(prompt).toContain('in natural Georgian');
  expect(prompt).toContain('No narrator, no voice-over.');
  expect(prompt).toMatch(/No subtitles, captions or on-screen text\.$/);
  expect(parseVeoJobId(genjutsuChargeForPolledId(j.jobId).jobId)).toMatchObject({ engine: 'omni', clipSec: 10, voiced: false });
});

test('10 s with two photos is Veo\'s 8 s reference clip, never Omni', async () => {
  const j = await (await POST(post({ prompt: 'ორივე ერთად სეირნობს', photos: [JPEG, PNG], seconds: 10, resolution: '1080p' }))).json();
  expect(j).toMatchObject({ seconds: 8, engine: 'Veo', credits: quoteCredits({ tool: 'video', seconds: 8, quality: 'fast' }) });
  expect(submitOmniClip).not.toHaveBeenCalled();
  expect((submitScene as jest.Mock).mock.calls[0][0]).toMatchObject({ durationSec: 8 });
});

test('Omni refuses the submit → the ✦69 reservation is refunded BY REF and the row closed under its engine', async () => {
  (submitOmniClip as jest.Mock).mockResolvedValue({ ok: false, reason: 'safety', retryable: false });
  const res = await POST(post({ prompt: 'a fox', seconds: 10 }));
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: 'content_rejected', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledWith(UID, expect.stringMatching(/^genjutsu:reserve:/), 69);
  expect(failJob).toHaveBeenCalledWith(expect.any(String), 'omni safety');

  (submitOmniClip as jest.Mock).mockResolvedValue({ ok: false, reason: 'budget', retryable: false });
  const busy = await POST(post({ prompt: 'a fox', seconds: 10 }));
  expect(busy.status).toBe(503);
  expect(await busy.json()).toMatchObject({ error: 'provider_unavailable', refunded: true });
});

/** @jest-environment node */
/**
 * POST /api/avatar/veo — the Veo talking avatar (GG's choice 2026-10-16), every provider and the ledger mocked: no
 * network, no spend. Admin only until AVATAR_VEO_PUBLIC; the photo is the first frame; the price is reserved before the
 * submit and refunded on a failed one.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdminIdentity: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: {} }));
jest.mock('../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/security/callerMedia', () => ({ resolveCallerMedia: jest.fn() }));
jest.mock('../../../../lib/genjutsu/veoScene', () => ({ submitScene: jest.fn() }));
jest.mock('../../../../lib/genjutsu/serverCommon', () => ({
  ...jest.requireActual('../../../../lib/genjutsu/serverCommon'),
  claimDailySlot: jest.fn(async () => true),
  releaseDailySlot: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn(async () => true), failJob: jest.fn(async () => undefined) }));
jest.mock('../../../../lib/chat/filmVoiceover', () => ({ speakAvatarLine: jest.fn() }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ removeStorageObjects: jest.fn(async () => undefined) }));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { isAdminIdentity } from '../../../../lib/auth/adminGuard';
import { resolveCallerMedia } from '../../../../lib/security/callerMedia';
import { submitScene } from '../../../../lib/genjutsu/veoScene';
import { genjutsuChargeForPolledId } from '../../../../lib/genjutsu/chargeToken';
import { deductCredits, refundDebitByRef } from '../../../../lib/orchestrator/ledger';
import { createJob } from '../../../../lib/orchestrator/jobs';
import { avatarVoicePath, veoAvatarCredits } from '../../../../lib/avatar/veoAvatar';
import { speakAvatarLine } from '../../../../lib/chat/filmVoiceover';
import { removeStorageObjects } from '../../../../lib/orchestrator/storage-adapter';
import { parseVeoJobId } from '../../../../lib/genjutsu/chargeToken';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const BODY = { photo: `omni-uploads/${UID}/face.jpg`, speech: 'გამარჯობა, მე ვარ შენი ავატარი', direction: 'იღიმის', aspect: '9:16' };
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/avatar/veo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-genjutsu-secret' };
  delete process.env.AVATAR_VEO_PUBLIC;
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (isAdminIdentity as jest.Mock).mockResolvedValue(true);
  (resolveCallerMedia as jest.Mock).mockResolvedValue({ ok: true, url: 'https://own/signed/face.jpg', own: true });
  (submitScene as jest.Mock).mockResolvedValue({ ok: true, operation: 'projects/p/operations/op1', aspect: '9:16', model: 'veo', transport: 'vertex', adjustments: [] });
  (speakAvatarLine as jest.Mock).mockResolvedValue({ url: 'https://own/signed/voice.mp3', seconds: 3.1 });
});
const EN_BODY = { ...BODY, speech: 'Welcome to MyAvatar.ge', direction: 'smiles' };
afterAll(() => { process.env = ENV; });

test('an ordinary account is refused before anything is read or charged while the owner has not opened it', async () => {
  (isAdminIdentity as jest.Mock).mockResolvedValue(false);
  const res = await POST(post(BODY));
  expect(res.status).toBe(423);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('admin, English words: row with _reserve, then the charge, then ONE Veo submit with the photo as the first frame and the words verbatim', async () => {
  const res = await POST(post(EN_BODY));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j.credits).toBe(veoAvatarCredits());
  const order = [(createJob as jest.Mock).mock.invocationCallOrder[0]!, (deductCredits as jest.Mock).mock.invocationCallOrder[0]!, (submitScene as jest.Mock).mock.invocationCallOrder[0]!];
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect((createJob as jest.Mock).mock.calls[0][0].params._reserve.credits).toBe(veoAvatarCredits());
  const sub = (submitScene as jest.Mock).mock.calls[0][0];
  expect(sub.startImageUrl).toBe('https://own/signed/face.jpg');
  expect(sub.referenceUrls).toEqual([]);
  expect(sub.prompt).toContain('"Welcome to MyAvatar.ge"');
  expect(sub.prompt).toContain('smiles.');
  expect(sub.audio).toBeUndefined(); // Veo's own voice
  expect(sub.resizeMode).toBe('crop'); // the square face fills 9:16, no black bars
  expect(speakAvatarLine).not.toHaveBeenCalled();
  // The status route can authorise the poll and its refund with the token it carries.
  const polled = genjutsuChargeForPolledId(j.jobId);
  expect(polled.charge?.u).toBe(UID);
  expect(parseVeoJobId(polled.jobId)?.voiced).toBe(false);
});

// The 2026-10-17 runs came back letterboxed: the square face was padded into 9:16. A landscape avatar keeps the pad, so
// the head is never cut off.
test('a landscape avatar keeps Veo\'s padding; only 9:16 crops the face to fill the frame', async () => {
  const res = await POST(post({ ...EN_BODY, aspect: '16:9' }));
  expect(res.status).toBe(202);
  const sub = (submitScene as jest.Mock).mock.calls[0][0];
  expect(sub.aspect).toBe('16:9');
  expect(sub.resizeMode).toBeUndefined();
});

// GG's tap 2026-10-17 07:54Z „ElevenLabs ხმა": a Georgian line is heard in ElevenLabs' voice. Tap 10:22Z „Veo ლაპარაკობს":
// Veo says the same line in Latin letters, with its sound on, so its mouth makes the syllables the voice replaces.
test('Georgian words: the ElevenLabs line is made BEFORE the charge, Veo says it in Latin letters with sound, the job id says voiced', async () => {
  const res = await POST(post({ ...BODY, voiceGender: 'male' }));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j.voice).toBe('ElevenLabs');
  const line = (speakAvatarLine as jest.Mock).mock.calls[0][0];
  expect(line.text).toBe('გამარჯობა, მე ვარ შენი ავატარი');
  expect(line.gender).toBe('male');
  const uuid = /^avatar-veo\/([0-9a-f-]{36})\/voice\.mp3$/.exec(line.path)?.[1];
  expect(uuid).toBeTruthy();
  expect(line.path).toBe(avatarVoicePath(uuid!));
  const voiceAt = (speakAvatarLine as jest.Mock).mock.invocationCallOrder[0]!;
  expect(voiceAt).toBeLessThan((deductCredits as jest.Mock).mock.invocationCallOrder[0]!);
  expect(voiceAt).toBeLessThan((createJob as jest.Mock).mock.invocationCallOrder[0]!);
  const sub = (submitScene as jest.Mock).mock.calls[0][0];
  expect(sub.audio).toBeUndefined(); // Veo's own sound on: its lip sync follows its own voice
  expect(sub.prompt).not.toContain('გამარჯობა'); // never the Georgian script, which Veo garbles
  expect(sub.prompt).toContain('"gamarjoba, me var sheni avatari"');
  expect(sub.prompt).toContain('about 3 seconds');
  expect(sub.prompt).toContain('იღიმის.'); // the direction still moves it
  expect((createJob as jest.Mock).mock.calls[0][0].params.voiced).toBe(true);
  expect(parseVeoJobId(genjutsuChargeForPolledId(j.jobId).jobId)?.voiced).toBe(true);
});

test('Georgian words with no voice, or a line longer than the clip: refused, nothing charged, nothing submitted', async () => {
  (speakAvatarLine as jest.Mock).mockResolvedValue(null);
  const none = await POST(post(BODY));
  expect(none.status).toBe(503);
  expect(await none.json()).toMatchObject({ error: 'voice_unavailable', refunded: false });
  // Production 2026-10-17 09:31Z: ElevenLabs' plan refused the cloned voice for good — a code of its own, not "retry".
  (speakAvatarLine as jest.Mock).mockResolvedValue({ off: true });
  const off = await POST(post(BODY));
  expect(off.status).toBe(503);
  expect(await off.json()).toMatchObject({ error: 'voice_off', refunded: false });
  (speakAvatarLine as jest.Mock).mockResolvedValue({ url: 'https://own/signed/voice.mp3', seconds: 11.4 });
  const long = await POST(post(BODY));
  expect(long.status).toBe(422);
  expect(await long.json()).toMatchObject({ error: 'speech_too_long', seconds: 11.4, maxSeconds: 8 });
  expect(removeStorageObjects).toHaveBeenCalledTimes(1);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(createJob).not.toHaveBeenCalled();
  expect(submitScene).not.toHaveBeenCalled();
});

test('GET: open and its price for an admin, closed for an ordinary account and for a visitor', async () => {
  const get = () => GET(new NextRequest('https://myavatar.ge/api/avatar/veo'));
  expect(await (await get()).json()).toMatchObject({ open: true, credits: veoAvatarCredits(), seconds: 8 });
  (isAdminIdentity as jest.Mock).mockResolvedValue(false);
  expect(await (await get()).json()).toMatchObject({ open: false, credits: veoAvatarCredits() });
  process.env.AVATAR_VEO_PUBLIC = '1';
  expect(await (await get()).json()).toMatchObject({ open: true });
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: null });
  expect(await (await get()).json()).toMatchObject({ open: false });
});

test('a photo that is not the caller\'s own storage object is refused before any charge', async () => {
  (resolveCallerMedia as jest.Mock).mockResolvedValue({ ok: false, reason: 'not_owner' });
  expect((await POST(post(BODY))).status).toBe(422);
  (resolveCallerMedia as jest.Mock).mockResolvedValue({ ok: true, url: 'https://elsewhere/x.jpg', own: false });
  expect((await POST(post(BODY))).status).toBe(422);
  expect(deductCredits).not.toHaveBeenCalled();
});

test('a stale price is refused before the charge; a failed submit is refunded and says so', async () => {
  expect((await POST(post({ ...BODY, expectedCredits: 1 }))).status).toBe(409);
  expect(deductCredits).not.toHaveBeenCalled();
  (submitScene as jest.Mock).mockResolvedValue({ ok: false, reason: 'safety', retryable: false });
  const res = await POST(post(BODY));
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: 'content_rejected', refunded: true });
  expect(refundDebitByRef).toHaveBeenCalledTimes(1);
});

test('the owner\'s flag opens it to every signed-in account', async () => {
  process.env.AVATAR_VEO_PUBLIC = '1';
  (isAdminIdentity as jest.Mock).mockResolvedValue(false);
  expect((await POST(post(BODY))).status).toBe(202);
});

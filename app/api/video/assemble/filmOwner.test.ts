/** @jest-environment node */
/**
 * POST /api/video/assemble — a film token is CLIENT-SUPPLIED, so it never lets one account stamp another account's film.
 *
 * ⚠️ DEFECT 47 (found by the final integration review, fixed first on PR #64 and ported here): the route took any
 * `filmTokenId` from the body. A stitch with another user's token flipped their film to 'assembling', stamped this
 * caller's master onto their record (their poll then showed someone else's film) and filed it under their Library id.
 * A token whose status record names another payer is now refused with 403 before any claim, charge or stamp.
 *
 * Driven through the real route with every provider, the ledger, storage and the stores mocked: no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/api/requireAuthForGeneration', () => ({ requireAuthForGeneration: jest.fn(() => ({ response: null })) }));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/orchestrator/saga', () => ({ runSaga: jest.fn() }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  lockTokens: jest.fn(async () => ({ id: 'lock-1' })),
  commitTokenLock: jest.fn(async () => undefined),
  releaseTokenLock: jest.fn(async () => undefined),
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
  hashPayload: jest.fn(async () => 'hash'),
}));
jest.mock('../../../../lib/orchestrator/runpod-adapter', () => ({ readRunPodConfig: jest.fn(() => null), dispatchRunPod: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/chat/filmComposite', () => ({ isAdminUser: jest.fn(async () => false) }));
jest.mock('../../../../lib/billing/wallet-ledger', () => ({ consumeFreeFilm: jest.fn(async () => null), restoreFreeFilm: jest.fn() }));
jest.mock('../../../../lib/billing/entitlements', () => ({ markFreeOutput: jest.fn() }));
// The owner gate is pinned in lib/security/callerMedia.test.ts and callerMedia.test.ts here; every URL passes it.
jest.mock('../../../../lib/security/callerMedia', () => ({ firstUnreadableOwnUrl: jest.fn(async () => -1) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: jest.fn(async (u: string) => u),
  uploadAndSign: jest.fn(async () => 'https://storage.example/el-score.mp3'),
}));
jest.mock('../../../../lib/video/remixOps', () => ({
  muxAudioOntoVideo: jest.fn(async () => 'https://storage.example/scored-master.mp4'),
  fitAspect: jest.fn(),
}));
jest.mock('../../../../lib/video/surgicalOps', () => ({ probeDimensions: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ffmpeg-assembly', () => ({ assembleWithFfmpeg: jest.fn() }));
jest.mock('../../../../lib/pipeline/compositing/word-synced-captions', () => ({}));
jest.mock('../../../../lib/pipeline/compositing/caption-burn', () => ({ overlayCaptionsOnUrl: jest.fn() }));
jest.mock('../../../../lib/elevenlabs/music', () => ({
  composeElevenLabsMusic: jest.fn(),
  hasElevenLabsMusicKey: jest.fn(() => true),
  buildElevenMusicPrompt: jest.fn(() => ({ prompt: 'cinematic instrumental film score', instrumental: true })),
  filmSongSeconds: jest.requireActual('../../../../lib/elevenlabs/music').filmSongSeconds,
}));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => `EN: ${p}`) }));
jest.mock('../../../../lib/orchestrator/masterQa', () => ({}));
jest.mock('../../../../lib/ai/visionQualityGate', () => ({ evaluateRenderQuality: jest.fn(), visionQaEnabled: jest.fn(() => false) }));
jest.mock('../../../../lib/pipeline/compositing/ffmpeg-overlay', () => ({ overlayMasterUrl: jest.fn(), hasOverlayContent: jest.fn(() => false) }));
jest.mock('../../../../lib/pipeline/qaAgent', () => ({ keepLiveClips: jest.fn(async (s: unknown[]) => s) }));
jest.mock('../../../../lib/pipeline/marketing-from-brief', () => ({ deriveMarketingFromBrief: jest.fn() }));
jest.mock('../../../../lib/chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn(), sanitizeSpokenText: jest.fn((t: string) => t) }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedFilm: jest.fn() }));
jest.mock('../../../../lib/pipeline/cost', () => ({ estimateFilmCostUsd: jest.fn(() => 0) }));
jest.mock('../../../../lib/pipeline/checkpoints', () => ({ saveClipCheckpoints: jest.fn() }));
jest.mock('../../../../lib/chat/filmStatusStore', () => ({
  recordFilmAssembling: jest.fn(), recordFilmMaster: jest.fn(async () => undefined), recordFilmFailed: jest.fn(),
  getFilmStatus: jest.fn(), getFilmPaid: jest.fn(), isFilmPaidUpstream: jest.fn(() => false),
  consumeFilmBilling: jest.fn(), restoreFilmBilling: jest.fn(),
  // The real predicate: this file proves the route asks it, lib/chat/filmStatusStore.test.ts pins its cases.
  isFilmOwnedByAnother: (prior: { payerUid?: string | null } | null | undefined, uid: string | null) => !!prior?.payerUid && prior.payerUid !== uid,
}));
jest.mock('../../../../lib/chat/filmBilling', () => ({
  decideFilmWaiver: jest.fn(async () => ({ action: 'bill' })),
  settleFilmWaiver: jest.fn(async () => true),
  FILM_WAIVER_LEASE_SEC: 900,
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { getFilmStatus, recordFilmAssembling, recordFilmMaster, recordFilmFailed } from '../../../../lib/chat/filmStatusStore';
import { decideFilmWaiver } from '../../../../lib/chat/filmBilling';
import { claimIdempotencyKey } from '../../../../lib/orchestrator/idempotency';
import { deductCredits } from '../../../../lib/orchestrator/ledger';
import { recordCompletedFilm } from '../../../../lib/orchestrator/jobs';
import { hasElevenLabsMusicKey } from '../../../../lib/elevenlabs/music';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/assemble', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const TOKEN = 'film_0123456789abcdef';
const FILM = { segments: [{ url: 'https://storage.example/clip-0.mp4', durationSec: 8 }], filmTokenId: TOKEN };
const record = (payerUid: string | null) => ({ tokenId: TOKEN, phase: 'ready', clips: [], audioReady: false, masterUrl: null, payerUid, updatedAt: 1, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (hasElevenLabsMusicKey as jest.Mock).mockReturnValue(false); // no score leg: the test is about who may stamp the film
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("another account's film token is refused (403 film_not_owned) before any claim, charge or stamp", async () => {
  (getFilmStatus as jest.Mock).mockResolvedValue(record('user-other'));
  const res = await POST(post(FILM));
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: 'film_not_owned' });
  expect(getFilmStatus).toHaveBeenCalledWith(TOKEN);
  for (const fn of [decideFilmWaiver, claimIdempotencyKey, deductCredits, recordFilmAssembling, recordFilmMaster, recordFilmFailed, recordCompletedFilm]) {
    expect(fn).not.toHaveBeenCalled();
  }
});

test("the caller's own film token goes through to the stitch", async () => {
  (getFilmStatus as jest.Mock).mockResolvedValue(record('user-1'));
  const res = await POST(post(FILM));
  expect(res.status).not.toBe(403);
  expect(decideFilmWaiver).toHaveBeenCalledWith('user-1', TOKEN, expect.any(String));
  expect(recordFilmAssembling).toHaveBeenCalledWith(TOKEN);
});

test('a token with no payer on record (or the store unreachable) is not refused here', async () => {
  for (const prior of [record(null), null]) {
    jest.clearAllMocks();
    (getFilmStatus as jest.Mock).mockResolvedValue(prior);
    const res = await POST(post(FILM));
    expect(res.status).not.toBe(403);
    expect(recordFilmAssembling).toHaveBeenCalledWith(TOKEN);
  }
});

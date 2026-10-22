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
jest.mock('../../../../lib/video/finalCut', () => ({
  cutMasterToLength: jest.fn(async () => 'https://storage.example/exact-master.mp4'),
  isFinalCutRejected: jest.fn(() => false),
}));
jest.mock('../../../../lib/pipeline/compositing/word-synced-captions', () => ({}));
jest.mock('../../../../lib/pipeline/compositing/caption-burn', () => ({ overlayCaptionsOnUrl: jest.fn() }));
jest.mock('../../../../lib/audio/lyriaBed', () => ({
  lyriaBedReady: jest.fn(() => true),
  lyriaBedPlan: jest.fn(() => ({ model: 'lyria-3-clip-preview', sec: 30 })),
  composeLyriaBed: jest.fn(),
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
import { composeLyriaBed, lyriaBedReady } from '../../../../lib/audio/lyriaBed';
import { firstUnreadableOwnUrl } from '../../../../lib/security/callerMedia';
import { keepLiveClips } from '../../../../lib/pipeline/qaAgent';
import { muxAudioOntoVideo } from '../../../../lib/video/remixOps';
import { assembleWithFfmpeg } from '../../../../lib/orchestrator/ffmpeg-assembly';
import { cutMasterToLength } from '../../../../lib/video/finalCut';

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
  (lyriaBedReady as jest.Mock).mockReturnValue(false); // no score leg: the test is about who may stamp the film
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

test("another account's clip is refused before probing or dropping it", async () => {
  (firstUnreadableOwnUrl as jest.Mock).mockResolvedValueOnce(0);
  const res = await POST(post(FILM));
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: 'media_not_yours' });
  expect(firstUnreadableOwnUrl).toHaveBeenCalledWith(
    expect.arrayContaining([FILM.segments[0].url]), 'user-1',
  );
  for (const fn of [keepLiveClips, decideFilmWaiver, claimIdempotencyKey, deductCredits, recordFilmAssembling, recordFilmMaster]) {
    expect(fn).not.toHaveBeenCalled();
  }
});

test('ownership is checked on the complete bounded input before a probe can drop clips', async () => {
  (getFilmStatus as jest.Mock).mockResolvedValue(record('user-1'));
  const second = 'https://storage.example/clip-1.mp4';
  (keepLiveClips as jest.Mock).mockResolvedValueOnce(FILM.segments);
  await POST(post({ ...FILM, segments: [...FILM.segments, { url: second, durationSec: 8 }] }));
  expect(firstUnreadableOwnUrl).toHaveBeenCalledWith(
    expect.arrayContaining([FILM.segments[0].url, second]), 'user-1',
  );
  expect((firstUnreadableOwnUrl as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    (keepLiveClips as jest.Mock).mock.invocationCallOrder[0],
  );
});

describe('an explicit final duration never authorizes a partial film', () => {
  const second = { url: 'https://storage.example/clip-1.mp4', durationSec: 8 };
  const noRenderOrBilling = () => {
    for (const fn of [decideFilmWaiver, claimIdempotencyKey, deductCredits, recordFilmAssembling,
      recordFilmMaster, recordFilmFailed, recordCompletedFilm, muxAudioOntoVideo, assembleWithFfmpeg, composeLyriaBed, cutMasterToLength]) {
      expect(fn).not.toHaveBeenCalled();
    }
  };

  test('a missing scene refuses before billing, audio generation, rendering or publication', async () => {
    (keepLiveClips as jest.Mock).mockResolvedValueOnce(FILM.segments);
    const res = await POST(post({ ...FILM, segments: [...FILM.segments, second], finalDurationSec: 12 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'contracted_segment_unavailable', expectedSegments: 2, readySegments: 1 });
    noRenderOrBilling();
  });

  test('the tab/follow planned count cannot be replaced with only the landed clips', async () => {
    const res = await POST(post({ ...FILM, expectedSegments: 2, finalDurationSec: 5 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'contracted_segment_unavailable', expectedSegments: 2, readySegments: 1 });
    expect(keepLiveClips).not.toHaveBeenCalled();
    noRenderOrBilling();
  });

  test.each([0, -1, 1.5, 25, '2'])('invalid expected scene count %p refuses before work', async (expectedSegments) => {
    const res = await POST(post({ ...FILM, expectedSegments, finalDurationSec: 5 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'contracted_segments_invalid', reason: 'invalid_expected_count' });
    noRenderOrBilling();
  });

  test.each([
    ['absent list', undefined], ['empty list', []], ['non-array list', {}],
    ['null entry', [null]], ['placeholder', [{ durationSec: 8 }]],
    ['duplicate URL', [...FILM.segments, ...FILM.segments]],
    ['whitespace URL alias', [...FILM.segments, { ...FILM.segments[0], url: FILM.segments[0].url + ' ' }]],
    ['unknown duration', [{ url: second.url }]],
    ['zero duration', [{ ...second, durationSec: 0 }]],
    ['negative duration', [{ ...second, durationSec: -8 }]],
    ['string duration', [{ ...second, durationSec: '8' }]],
    ['duplicate scene identity', [{ ...FILM.segments[0], ordinal: 1 }, { ...second, ordinal: 1 }]],
    ['invalid scene identity', [{ ...second, ordinal: 0 }]],
    ['too many scenes', Array.from({ length: 25 }, (_, i) => ({ url: `https://storage.example/clip-${i}.mp4`, durationSec: 8 }))],
  ])('%s is refused without silently filtering, guessing or truncating the contracted input', async (_label, segments) => {
    const res = await POST(post({ ...FILM, segments, finalDurationSec: 8 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'contracted_segments_invalid' });
    expect(keepLiveClips).not.toHaveBeenCalled();
    noRenderOrBilling();
  });

  test('a complete owned single clip still reaches the exact-cut path', async () => {
    (getFilmStatus as jest.Mock).mockResolvedValue(record('user-1'));
    const res = await POST(post({ ...FILM, finalDurationSec: 5 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: 'https://storage.example/exact-master.mp4' });
    expect(cutMasterToLength).toHaveBeenCalledWith(FILM.segments[0].url, 5);
  });

  test.each([-5, 'invalid', 999])('an invalid final duration %p refuses before a status write or paid work', async (finalDurationSec) => {
    const res = await POST(post({ ...FILM, finalDurationSec }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'final_duration_invalid' });
    noRenderOrBilling();
  });

  test.each([undefined, null])('legacy final duration %p retains the existing salvage path', async (finalDurationSec) => {
    (getFilmStatus as jest.Mock).mockResolvedValue(record('user-1'));
    (keepLiveClips as jest.Mock).mockResolvedValueOnce(FILM.segments);
    const res = await POST(post({ ...FILM, segments: [...FILM.segments, second], finalDurationSec }));
    expect(res.status).toBe(200);
    expect(recordFilmMaster).toHaveBeenCalled();
    expect(cutMasterToLength).not.toHaveBeenCalled();
  });
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

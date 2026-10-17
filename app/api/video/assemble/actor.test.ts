/** @jest-environment node */
/**
 * POST /api/video/assemble — a stitch the SERVER makes for a film whose tab closed (lib/chat/filmFollowWorker) has no
 * cookie: it names the film's owner through lib/video/assembleActor, a mark only server code can set. That request runs as
 * the owner (the film's payer check, the stitch waiver and billing all see that uid) and is not throttled per caller; a
 * request from a browser is read from its session exactly as before, and an actor mark never leaks onto another request.
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
import { actAs } from '../../../../lib/video/assembleActor';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { checkRateLimit } from '../../../../lib/api/rate-limit';
import { getFilmStatus, recordFilmAssembling } from '../../../../lib/chat/filmStatusStore';
import { decideFilmWaiver } from '../../../../lib/chat/filmBilling';
import { hasElevenLabsMusicKey } from '../../../../lib/elevenlabs/music';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/assemble', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const TOKEN = 'f0123456789abcdef';
const FILM = { segments: [{ url: 'https://storage.example/clip-0.mp4', durationSec: 8 }], filmTokenId: TOKEN };
const record = (payerUid: string | null) => ({ tokenId: TOKEN, phase: 'ready', clips: [], audioReady: false, masterUrl: null, payerUid, updatedAt: 1, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (hasElevenLabsMusicKey as jest.Mock).mockReturnValue(false);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("a server-made stitch runs as the film's owner: no cookie read, no per-caller throttle", async () => {
  (getFilmStatus as jest.Mock).mockResolvedValue(record('user-7'));
  const res = await POST(actAs(post(FILM), { uid: 'user-7', budgetMs: 300_000 }));
  expect(res.status).not.toBe(403);
  expect(authedClientFromRequest).not.toHaveBeenCalled();
  expect(checkRateLimit).not.toHaveBeenCalled();
  expect(decideFilmWaiver).toHaveBeenCalledWith('user-7', TOKEN, expect.any(String));
  expect(recordFilmAssembling).toHaveBeenCalledWith(TOKEN);
});

test("the owner it names is still checked against the film's payer", async () => {
  (getFilmStatus as jest.Mock).mockResolvedValue(record('user-other'));
  const res = await POST(actAs(post(FILM), { uid: 'user-7', budgetMs: 300_000 }));
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: 'film_not_owned' });
  expect(decideFilmWaiver).not.toHaveBeenCalled();
});

test('a browser request is read from its session and throttled, as before', async () => {
  (getFilmStatus as jest.Mock).mockResolvedValue(record('user-1'));
  // A server-made request elsewhere does not mark this one.
  actAs(post(FILM), { uid: 'user-7', budgetMs: 300_000 });
  const res = await POST(post(FILM));
  expect(res.status).not.toBe(403);
  expect(authedClientFromRequest).toHaveBeenCalled();
  expect(checkRateLimit).toHaveBeenCalled();
  expect(decideFilmWaiver).toHaveBeenCalledWith('user-1', TOKEN, expect.any(String));
});

/** @jest-environment node */
/**
 * POST /api/video/assemble — each scene clip of a stitched film is graded on its own (audit item 3b, 2026-10-17).
 *
 * With the vision check on (FILM_VISION_QA), the route hands every scene clip to the grader with the scene's OWN number
 * (a film whose scene 2 failed is stitched from scenes 1 and 3, and must report them as 1 and 3, so the redo command
 * names the right scene), and returns the grades as `sceneQa`. With the check off nothing is graded or reported.
 * Driven through the real route with the stitch, the ledger and the stores mocked: no network, no spend.
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
jest.mock('../../../../lib/ai/visionQualityGate', () => ({ evaluateRenderQuality: jest.fn(), evaluateSceneClips: jest.fn(), visionQaEnabled: jest.fn(() => true) }));
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
import { runSaga } from '../../../../lib/orchestrator/saga';
import { evaluateRenderQuality, evaluateSceneClips, visionQaEnabled } from '../../../../lib/ai/visionQualityGate';
import { hasElevenLabsMusicKey } from '../../../../lib/elevenlabs/music';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/assemble', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const MASTER = 'https://storage.example/master.mp4';
// Scene 2 failed upstream: the film is stitched from scenes 1 and 3.
const SEGMENTS = [
  { url: 'https://storage.example/clip-1.mp4', durationSec: 8, ordinal: 1 },
  { url: 'https://storage.example/clip-3.mp4', durationSec: 8, ordinal: 3 },
];
const GRADES = [
  { ordinal: 1, grade: 'A', score: 92, action: 'accept', issues: [] },
  { ordinal: 3, grade: 'F', score: 41, action: 'rerender', issues: ['warp'] },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (hasElevenLabsMusicKey as jest.Mock).mockReturnValue(false);
  (runSaga as jest.Mock).mockImplementation(async (_steps: unknown, { bag }: { bag: Record<string, unknown> }) => {
    bag.tempUrl = MASTER;
    return { ok: true, sagaId: 'saga-1' };
  });
  (visionQaEnabled as jest.Mock).mockReturnValue(true);
  (evaluateRenderQuality as jest.Mock).mockResolvedValue({ ran: true, pass: true, grade: 'B', score: 80, issues: [], action: 'accept' });
  (evaluateSceneClips as jest.Mock).mockResolvedValue(GRADES);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('every scene clip is graded under its own scene number, and the grades come back as sceneQa', async () => {
  const res = await POST(post({ segments: SEGMENTS }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.url).toBe(MASTER);
  expect(json.sceneQa).toEqual(GRADES);
  expect(evaluateSceneClips).toHaveBeenCalledTimes(1);
  const [clips, opts] = (evaluateSceneClips as jest.Mock).mock.calls[0] as [Array<{ url: string; ordinal: number }>, { deadlineMs: number }];
  expect(clips).toEqual([
    { url: 'https://storage.example/clip-1.mp4', ordinal: 1 },
    { url: 'https://storage.example/clip-3.mp4', ordinal: 3 },
  ]);
  expect(opts.deadlineMs).toBe(45_000);
  // The whole master is still graded beside the scenes.
  expect(evaluateRenderQuality).toHaveBeenCalledWith({ videoUrl: MASTER });
});

test('segments without a scene number are numbered by their place in the cut', async () => {
  await POST(post({ segments: SEGMENTS.map(({ url, durationSec }) => ({ url, durationSec })) }));
  const [clips] = (evaluateSceneClips as jest.Mock).mock.calls[0] as [Array<{ ordinal: number }>];
  expect(clips.map((c) => c.ordinal)).toEqual([1, 2]);
});

test('check off: nothing is graded and no sceneQa key is sent', async () => {
  (visionQaEnabled as jest.Mock).mockReturnValue(false);
  const json = await (await POST(post({ segments: SEGMENTS }))).json();
  expect(json.url).toBe(MASTER);
  expect(json).not.toHaveProperty('sceneQa');
  expect(evaluateSceneClips).not.toHaveBeenCalled();
});

test('a grader that throws never breaks the delivered film', async () => {
  (evaluateSceneClips as jest.Mock).mockRejectedValue(new Error('ffmpeg exploded'));
  const res = await POST(post({ segments: SEGMENTS }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.url).toBe(MASTER);
  expect(json).not.toHaveProperty('sceneQa');
});

/** @jest-environment node */
/**
 * ServiceManager's Google-only Veo leg (docs/VEO_ENGINE.md §3–§5), exercised through the public execute() / poll()
 * with the engine, the Gemini file download, storage, the watermark crop, the budget guard and every text model
 * mocked — no network, no spend. What is pinned here, and why each one is money:
 *
 *   · the studio's Veo plan (veo* options) reaches createVeoClip EXACTLY — tier, output format, reference mode (the
 *     uploads become asset references and there is NO first frame), seed lock off (no seed at all), audio off,
 *     prompt enhancement, the native camera move, the clip length and the scene ordinal;
 *   · a Veo miss comes back as a failed leg carrying metadata.veoFailure and NEVER as a clip quietly rendered by
 *     Runway / Kling / LTX (Google-only means Google-only — the fallback engines are the ones that were not billed);
 *   · poll delivers a Vertex 'gcs' clip through a signed URL, re-signs an already-hosted Gemini clip WITHOUT
 *     downloading it again (the film poll re-polls finished clips every tick), and reports a safety refusal;
 *   · the budget guard is handed the seconds Veo will actually render (4 / 6 / 8, rounded UP — `duration: '0.001'`
 *     once booked a whole clip at a fraction of a cent) and the exact $/s of the model that renders them.
 */

// ── Mocks (declared before the module under test is imported; jest hoists jest.mock above the imports) ────────────

jest.mock('server-only', () => ({}));

jest.mock('../veo/engine', () => ({
  createVeoClip: jest.fn(),
  pollVeoClip: jest.fn(),
  deliverableUrl: jest.fn(),
  veoTransport: jest.fn(() => 'gemini'),
  // The real rule (engine.transportOf) — the operation NAME says which transport owns it.
  transportOf: jest.fn((name: string) => (name.startsWith('projects/') ? 'vertex' : name.startsWith('models/') ? 'gemini' : null)),
}));
jest.mock('../veo/geminiTransport', () => ({ downloadGeminiVideo: jest.fn() }));
jest.mock('../veo/deliver', () => ({ hostGcsVideo: jest.fn() }));
jest.mock('../orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(),
  uploadBufferAndSign: jest.fn(),
  createSignedAssetUrl: jest.fn(),
  removeStorageObjects: jest.fn(async () => undefined),
}));
jest.mock('../video/remixOps', () => ({ stripBottomWatermark: jest.fn() }));
jest.mock('../services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    readonly reason: string;
    constructor(reason: string) {
      super(`budget_exceeded:${reason}`);
      this.reason = reason;
    }
  }
  // The guard just runs the call — the opts it RECEIVED are what these tests inspect.
  return { BudgetExceededError, guardedCall: jest.fn(async (_opts: unknown, fn: () => Promise<unknown>) => fn()) };
});
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../video/cinematicPrompt', () => ({ expandCinematicPrompt: jest.fn(async (p: string) => `${p}, cinematic 35mm`) }));
// The engines a Google-only miss must NEVER fall back to — mocked so a regression shows up as a call, not a network hit.
jest.mock('../replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../ai/runway', () => ({
  hasRunwayProvider: jest.fn(() => true),
  runwayModel: jest.fn(() => 'gen4_turbo'),
  createRunwayI2V: jest.fn(),
  pollRunwayTask: jest.fn(),
}));
jest.mock('../video/videoProviderCascade', () => ({
  submitVideoWithFallback: jest.fn(),
  pollVideoProvider: jest.fn(),
  shouldUseNativeCascade: jest.fn(() => true),
}));

import { ServiceManager, type ServiceManagerRequest, type ServiceManagerResponse } from './ServiceManager';
import { createVeoClip, deliverableUrl, pollVeoClip, veoTransport } from '../veo/engine';
import { downloadGeminiVideo } from '../veo/geminiTransport';
import { hostGcsVideo } from '../veo/deliver';
import { createSignedAssetUrl, removeStorageObjects, uploadBufferAndSign } from '../orchestrator/storage-adapter';
import { stripBottomWatermark } from '../video/remixOps';
import { guardedCall } from '../services/billing/guardedCall';
import { createPrediction } from '../replicate/client';
import { createRunwayI2V } from '../ai/runway';
import { submitVideoWithFallback } from '../video/videoProviderCascade';
import { costPerSecondUsd, resolutionFor, resolveModel } from '../veo/capabilities';
import type { VeoTransport, VeoVideo } from '../veo/types';

const createVeoClipMock = createVeoClip as jest.MockedFunction<typeof createVeoClip>;
const pollVeoClipMock = pollVeoClip as jest.MockedFunction<typeof pollVeoClip>;
const deliverableUrlMock = deliverableUrl as jest.MockedFunction<typeof deliverableUrl>;
const hostGcsMock = hostGcsVideo as jest.MockedFunction<typeof hostGcsVideo>;
const veoTransportMock = veoTransport as jest.MockedFunction<typeof veoTransport>;
const downloadMock = downloadGeminiVideo as jest.MockedFunction<typeof downloadGeminiVideo>;
const signedMock = createSignedAssetUrl as jest.MockedFunction<typeof createSignedAssetUrl>;
const uploadBufMock = uploadBufferAndSign as jest.MockedFunction<typeof uploadBufferAndSign>;
const removeMock = removeStorageObjects as jest.MockedFunction<typeof removeStorageObjects>;
const stripMock = stripBottomWatermark as jest.MockedFunction<typeof stripBottomWatermark>;
const guardMock = guardedCall as jest.MockedFunction<typeof guardedCall>;

const SESSION = 'session_studio_abc123';
const REFS = [
  'https://cdn.example.com/ref/1.png',
  'https://cdn.example.com/ref/2.png',
  'https://cdn.example.com/ref/3.png',
  'https://cdn.example.com/ref/4.png',
];
const GEMINI_MODEL = 'veo-3.1-fast-generate-preview';
const GEMINI_OP = `models/${GEMINI_MODEL}/operations/op-777`;
const VERTEX_OP = 'projects/p/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/op-9';

/** The studio's full Veo plan, as buildFilmClipRequest stamps it onto one clip. */
const STUDIO_PLAN: Record<string, string> = {
  googleOnly: '1',
  veoTier: 'fast',
  veoFormat: '4:5',
  veoReferenceMode: 'reference',
  characterReferences: JSON.stringify(REFS),
  veoSeedLock: '0',
  seed: '42',
  veoGenerateAudio: '0',
  veoEnhancePrompt: '1',
  veoCameraMove: 'push_in',
  duration: '6',
  sceneOrdinal: '2',
};

function videoRequest(selectedOptions: Record<string, string>): ServiceManagerRequest {
  return {
    sessionId: SESSION,
    serviceContext: 'video',
    intent: 'video_generation',
    userPrompt: 'A lighthouse keeper climbs the spiral stairs at dusk',
    selectedOptions,
  };
}

/** What a successful engine submit hands back (the engine renders 4:5 natively at 9:16). */
function acceptedClip(name = GEMINI_OP, transport: VeoTransport = 'gemini') {
  return {
    outcome: { ok: true as const, operation: { transport, name, model: GEMINI_MODEL } },
    request: { prompt: 'p', aspect: '9:16' as const, durationSec: 8 as const, resolution: '1080p' as const, tier: 'fast' as const, generateAudio: true },
    adjustments: [{ field: 'durationSec' as const, from: 6, to: 8, reason: 'reference images require 8 s' }],
    model: GEMINI_MODEL,
    transport,
  };
}

function refusedClip(reason: 'quota' | 'ambiguous' | 'rate_limited', retryable: boolean) {
  return {
    outcome: { ok: false as const, reason, retryable },
    request: acceptedClip().request,
    adjustments: [],
    model: GEMINI_MODEL,
    transport: 'gemini' as const,
  };
}

function decodeRef(ref: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(ref, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** The opts the budget guard received on its most recent call. */
function lastGuardOpts(): Record<string, unknown> & { units: number; model: string; unitCostUsd?: number; actualCost?: (r: unknown) => number | undefined } {
  const call = guardMock.mock.calls[guardMock.mock.calls.length - 1];
  if (!call) throw new Error('guardedCall was never called');
  return call[0] as never;
}

const ENV_KEYS = ['VIDEO_GOOGLE_ONLY', 'VEO_MODEL_STANDARD', 'VEO_MODEL_FAST', 'VEO_MODEL_LITE', 'GEMINI_VEO_MODEL', 'VIDEO_I2V_DISABLED'];
const savedEnv: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  veoTransportMock.mockReturnValue('gemini');
  createVeoClipMock.mockResolvedValue(acceptedClip() as never);
  // Any network call from a fallback engine (the direct LTX API goes through global fetch) is a test failure.
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});

afterEach(() => {
  fetchSpy.mockRestore();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function expectNoOtherEngine(): void {
  expect(createPrediction).not.toHaveBeenCalled();
  expect(createRunwayI2V).not.toHaveBeenCalled();
  expect(submitVideoWithFallback).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

// ── Submit ──────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('execute() → createVeoClip carries the studio’s Veo plan exactly', () => {
  it('maps every veo* option onto the engine request', async () => {
    await new ServiceManager().execute(videoRequest(STUDIO_PLAN));

    expect(createVeoClipMock).toHaveBeenCalledTimes(1);
    const input = createVeoClipMock.mock.calls[0]![0];
    expect(input.tier).toBe('fast');
    expect(input.sessionId).toBe(SESSION);
    expect(input.ordinal).toBe(2);

    const r = input.request;
    expect(r.aspect).toBe('4:5'); // the OUTPUT format — the engine renders it at 9:16 and the assembler crops
    expect(r.durationSec).toBe(6);
    expect(r.generateAudio).toBe(false);
    expect(r.enhancePrompt).toBe(true);
    expect(r.cameraControl).toBe('push_in');
    // The enriched (Gemini-only) prompt is what reaches Veo, not the raw brief.
    expect(r.prompt).toContain('cinematic 35mm');
  });

  it('reference mode: the first THREE uploads become asset references and there is no first frame', async () => {
    await new ServiceManager().execute(videoRequest(STUDIO_PLAN));
    const r = createVeoClipMock.mock.calls[0]![0].request;
    // ⚠️ Veo takes at most 3 references, and they are EXCLUSIVE with a first frame. resolveClipImage would happily
    // hand back REFS[0] as a start image — sending both is an invalid request Google rejects.
    expect(r.referenceImages).toEqual(REFS.slice(0, 3).map((url) => ({ kind: 'url', url })));
    expect(r).not.toHaveProperty('startImage');
  });

  it('seed lock OFF drops the seed entirely (each scene samples freely), even with seed:42 present', async () => {
    await new ServiceManager().execute(videoRequest(STUDIO_PLAN));
    expect(createVeoClipMock.mock.calls[0]![0].request).not.toHaveProperty('seed');
  });

  it('without the reference-mode plan the upload is the FIRST FRAME and the seed is kept', async () => {
    const { veoReferenceMode: _r, veoSeedLock: _s, ...firstFrame } = STUDIO_PLAN;
    await new ServiceManager().execute(videoRequest(firstFrame));
    const r = createVeoClipMock.mock.calls[0]![0].request;
    expect(r.startImage).toEqual({ kind: 'url', url: REFS[0] });
    expect(r).not.toHaveProperty('referenceImages');
    expect(r.seed).toBe(42);
  });

  it('an accepted submit returns a gemini-veo task ref that encodes the operation and the NATIVE aspect', async () => {
    const res = await new ServiceManager().execute(videoRequest(STUDIO_PLAN));
    expect(res.success).toBe(true);
    expect(res.predictionStatus).toBe('processing');
    expect(res.metadata.videoProvider).toBe('gemini-veo');
    expect(res.metadata.veoTransport).toBe('gemini');
    expect(res.metadata.veoAdjustments).toEqual(['durationSec']);
    const ref = decodeRef(res.predictionId as string);
    expect(ref).toMatchObject({ provider: 'gemini-veo', sessionId: SESSION, operation: 'video-avatar', responseType: 'video' });
    // 9:16 — what Veo rendered, not the 4:5 output format — is what the poll crops the watermark at.
    expect(ref.providerTaskId).toBe(`${GEMINI_OP}::9:16`);
    expectNoOtherEngine();
  });

  it('a refused submit is a failed leg with veoFailure — and nothing else is tried', async () => {
    createVeoClipMock.mockResolvedValue(refusedClip('quota', false) as never);
    const res = await new ServiceManager().execute(videoRequest(STUDIO_PLAN));
    expect(res.success).toBe(false);
    expect(res.predictionStatus).toBe('failed');
    expect(res.predictionId).toBeUndefined();
    expect(res.metadata.videoProvider).toBe('gemini-veo');
    expect(res.metadata.veoFailure).toEqual({ reason: 'quota', retryable: false });
    // The user-facing text never carries provider detail.
    expect(res.message).not.toMatch(/402|prepay|billing|gemini/i);
    expect(createVeoClipMock).toHaveBeenCalledTimes(1); // submitted AT MOST once
    expectNoOtherEngine();
  });

  it('a retryable refusal is reported as retryable (filmComposite decides whether a re-POST is safe)', async () => {
    createVeoClipMock.mockResolvedValue(refusedClip('rate_limited', true) as never);
    const res = await new ServiceManager().execute(videoRequest(STUDIO_PLAN));
    expect(res.metadata.veoFailure).toEqual({ reason: 'rate_limited', retryable: true });
    expectNoOtherEngine();
  });

  it('the process-wide policy alone (no googleOnly option) also keeps the leg on Veo', async () => {
    createVeoClipMock.mockResolvedValue(refusedClip('quota', false) as never);
    const { googleOnly: _g, ...noOption } = STUDIO_PLAN;
    const res = await new ServiceManager().execute(videoRequest(noOption)); // VIDEO_GOOGLE_ONLY unset → ON
    expect(res.metadata.veoFailure).toEqual({ reason: 'quota', retryable: false });
    expectNoOtherEngine();
  });
});

// ── Poll ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A real task ref, minted by execute() — so the tests never hand-roll the wire format. */
async function taskRefFor(operation: string, transport: VeoTransport = 'gemini'): Promise<string> {
  createVeoClipMock.mockResolvedValueOnce(acceptedClip(operation, transport) as never);
  const res = await new ServiceManager().execute(videoRequest(STUDIO_PLAN));
  return res.predictionId as string;
}

describe('poll() → deliver a finished Veo clip', () => {
  it('a Vertex "gcs" video is hosted once at its fixed path (the Library cannot re-sign a GCS link) — never cropped', async () => {
    const ref = await taskRefFor(VERTEX_OP, 'vertex');
    const video: VeoVideo = { kind: 'gcs', gcsUri: 'gs://bucket/veo/out/sample_0.mp4', mimeType: 'video/mp4' };
    pollVeoClipMock.mockResolvedValue({ state: 'succeeded', videos: [video] });
    hostGcsMock.mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/renders/veo/vertex.mp4?token=t');

    const res = await new ServiceManager().poll(ref, SESSION);
    expect(pollVeoClipMock).toHaveBeenCalledWith(VERTEX_OP);
    expect(hostGcsMock).toHaveBeenCalledWith(video, expect.stringMatching(new RegExp(`^veo/${SESSION}/[0-9a-f]{24}\\.mp4$`)));
    expect(res).toMatchObject({ success: true, predictionStatus: 'succeeded', assetUrl: expect.stringContaining('supabase.co') });
    expect(res.metadata.veoTransport).toBe('vertex');
    expect(downloadMock).not.toHaveBeenCalled();
    expect(stripMock).not.toHaveBeenCalled();
  });

  it('with the crop switched off (the raw URL comes back) the clip is hosted at the fixed path — never the deleted staging URL', async () => {
    const ref = await taskRefFor(GEMINI_OP);
    pollVeoClipMock.mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download', mimeType: 'video/mp4' }] });
    signedMock.mockResolvedValue(null);
    downloadMock.mockResolvedValue(Buffer.alloc(4_096, 1));
    uploadBufMock
      .mockResolvedValueOnce('https://x.supabase.co/raw-staging.mp4')
      .mockResolvedValueOnce('https://x.supabase.co/final.mp4');
    stripMock.mockResolvedValue('https://x.supabase.co/raw-staging.mp4'); // VEO_WATERMARK_CROP_PCT=0 returns the input

    const res = await new ServiceManager().poll(ref, SESSION);
    expect(res.assetUrl).toBe('https://x.supabase.co/final.mp4');
    expect(uploadBufMock.mock.calls[1]![1]).toMatch(/^veo\/.+\/[0-9a-f]{24}\.mp4$/);
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('a crop miss does not overwrite a cropped clip a concurrent poll already hosted', async () => {
    const ref = await taskRefFor(GEMINI_OP);
    pollVeoClipMock.mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download', mimeType: 'video/mp4' }] });
    signedMock
      .mockResolvedValueOnce(null) // not hosted yet when this poll started
      .mockResolvedValueOnce('https://x.supabase.co/cropped-by-the-other-poll.mp4');
    downloadMock.mockResolvedValue(Buffer.alloc(4_096, 1));
    uploadBufMock.mockResolvedValueOnce('https://x.supabase.co/raw-staging.mp4');
    stripMock.mockResolvedValue(null); // this poll's crop failed

    const res = await new ServiceManager().poll(ref, SESSION);
    expect(res.assetUrl).toBe('https://x.supabase.co/cropped-by-the-other-poll.mp4');
    expect(uploadBufMock).toHaveBeenCalledTimes(1); // only the staging copy — the fixed path was left alone
  });

  it('a Gemini-file video already hosted at its fixed path is re-signed, NOT downloaded again', async () => {
    const ref = await taskRefFor(GEMINI_OP);
    pollVeoClipMock.mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download', mimeType: 'video/mp4' }] });
    signedMock.mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/renders/veo/existing.mp4?token=t');

    const res = await new ServiceManager().poll(ref, SESSION);
    expect(res.success).toBe(true);
    expect(res.assetUrl).toBe('https://x.supabase.co/storage/v1/object/sign/renders/veo/existing.mp4?token=t');
    // The path is fixed per operation (sha256 prefix), under the sanitised session — the next tick finds the same object.
    expect(signedMock).toHaveBeenCalledWith('renders', expect.stringMatching(new RegExp(`^veo/${SESSION}/[0-9a-f]{24}\\.mp4$`)), 604_800);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(uploadBufMock).not.toHaveBeenCalled();
    expect(stripMock).not.toHaveBeenCalled();
  });

  it('a first delivery downloads once, crops at the native aspect into the fixed path, and removes the staging copy', async () => {
    const ref = await taskRefFor(GEMINI_OP);
    pollVeoClipMock.mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download', mimeType: 'video/mp4' }] });
    signedMock.mockResolvedValue(null);
    downloadMock.mockResolvedValue(Buffer.alloc(4_096, 1));
    uploadBufMock.mockResolvedValue('https://x.supabase.co/raw-staging.mp4');
    stripMock.mockResolvedValue('https://x.supabase.co/clean.mp4');

    const res = await new ServiceManager().poll(ref, SESSION);
    expect(res.assetUrl).toBe('https://x.supabase.co/clean.mp4');
    expect(downloadMock).toHaveBeenCalledTimes(1);
    const fixedPath = signedMock.mock.calls[0]![1];
    expect(stripMock).toHaveBeenCalledWith('https://x.supabase.co/raw-staging.mp4', '9:16', undefined, { bucket: 'renders', path: fixedPath });
    expect(removeMock).toHaveBeenCalledWith('renders', [fixedPath.replace(/\.mp4$/, '-raw.mp4')]);
  });

  it('a safety-filtered clip is a terminal failure flagged veoFiltered', async () => {
    const ref = await taskRefFor(GEMINI_OP);
    pollVeoClipMock.mockResolvedValue({ state: 'filtered', reason: 'raiMediaFiltered', supportCodes: ['58061214'] });
    const res = await new ServiceManager().poll(ref, SESSION);
    expect(res).toMatchObject({ success: false, predictionStatus: 'failed' });
    expect(res.metadata.veoFiltered).toBe(true);
    expect(deliverableUrlMock).not.toHaveBeenCalled();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('a still-rendering operation keeps polling (processing, not failed)', async () => {
    const ref = await taskRefFor(GEMINI_OP);
    pollVeoClipMock.mockResolvedValue({ state: 'processing' });
    const res = await new ServiceManager().poll(ref, SESSION);
    expect(res).toMatchObject({ success: true, predictionStatus: 'processing' });
  });

  it('a ref from another session is refused before Google is polled', async () => {
    const ref = await taskRefFor(GEMINI_OP);
    const res = await new ServiceManager().poll(ref, 'someone-elses-session');
    expect(res.success).toBe(false);
    expect(pollVeoClipMock).not.toHaveBeenCalled();
  });
});

// ── Budget guard ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('execute() → the budget guard is priced on what Veo will actually render', () => {
  /** Everything but the length-changing knobs: first-frame mode, the Fast tier, audio on (the Gemini rate). */
  const base: Record<string, string> = { googleOnly: '1', veoTier: 'fast', characterReference: REFS[0]! };

  it.each([
    ['6', 6],
    ['5', 6], // Veo renders 4 / 6 / 8 — 5 s is billed as the 6 s it becomes, never under-counted
    ['3', 4],
    ['0.001', 4], // ⚠️ the drain: a fractional duration once booked a whole clip at a fraction of a cent
    ['8', 8],
    ['12', 8],
    ['abc', 8],
  ])('duration %p → %p units', async (duration, units) => {
    await new ServiceManager().execute(videoRequest({ ...base, duration }));
    expect(lastGuardOpts().units).toBe(units);
  });

  it('no duration at all → 8 s', async () => {
    await new ServiceManager().execute(videoRequest(base));
    expect(lastGuardOpts().units).toBe(8);
  });

  it('reference mode books 8 s whatever the asked length (references pin the clip to 8 s)', async () => {
    await new ServiceManager().execute(videoRequest({ ...base, veoReferenceMode: 'reference', duration: '4' }));
    expect(lastGuardOpts().units).toBe(8);
  });

  it.each([
    ['gemini', 'fast', '6', undefined],
    ['gemini', 'fast', '8', undefined],
    ['gemini', 'standard', '8', undefined],
    ['gemini', 'lite', '4', undefined],
    ['vertex', 'fast', '6', '0'], // Vertex with audio off → the video-only rate
    ['vertex', 'standard', '8', '1'],
  ] as const)('%s · %s · %s s (audio %p): model + $/s come from capabilities', async (transport, tier, duration, audio) => {
    veoTransportMock.mockReturnValue(transport);
    await new ServiceManager().execute(
      videoRequest({ ...base, veoTier: tier, duration, ...(audio !== undefined ? { veoGenerateAudio: audio } : {}) }),
    );
    const opts = lastGuardOpts();
    const model = resolveModel(transport, tier);
    const seconds = Number(duration); // every length in this table is already on Veo's 4 / 6 / 8 grid
    // The Gemini API always renders (and bills) audio; only Vertex honours veoGenerateAudio:'0'.
    const withAudio = transport === 'gemini' || audio !== '0';
    expect(opts.service).toBe('video');
    expect(opts.units).toBe(seconds);
    expect(opts.model).toBe(model);
    expect(opts.unitCostUsd).toBe(costPerSecondUsd(model, resolutionFor(seconds), withAudio, transport));
  });

  it('anchored to the published table: Veo 3.1 Fast on the Gemini API is $0.10/s at 720p (6 s) and $0.12/s at 1080p (8 s)', async () => {
    // A literal anchor, so a change that moved BOTH the route and capabilities off Google's price sheet still fails.
    await new ServiceManager().execute(videoRequest({ ...base, duration: '6' }));
    expect(lastGuardOpts().unitCostUsd).toBeCloseTo(0.1, 6);
    await new ServiceManager().execute(videoRequest({ ...base, duration: '8' }));
    expect(lastGuardOpts().unitCostUsd).toBeCloseTo(0.12, 6);
  });

  it('the Vertex video-only rate is genuinely cheaper than the audio rate (the option is not ignored)', async () => {
    veoTransportMock.mockReturnValue('vertex');
    await new ServiceManager().execute(videoRequest({ ...base, duration: '6', veoGenerateAudio: '0' }));
    const off = lastGuardOpts().unitCostUsd as number;
    await new ServiceManager().execute(videoRequest({ ...base, duration: '6', veoGenerateAudio: '1' }));
    const on = lastGuardOpts().unitCostUsd as number;
    expect(off).toBeLessThan(on);
  });

  it('actualCost: a definitive refusal books $0, an ambiguous one keeps the estimate, a success keeps it', async () => {
    await new ServiceManager().execute(videoRequest(STUDIO_PLAN));
    const actualCost = lastGuardOpts().actualCost as (r: unknown) => number | undefined;
    const failed = (reason: string): Partial<ServiceManagerResponse> => ({ success: false, metadata: { veoFailure: { reason, retryable: false } } as never });
    expect(actualCost(failed('quota'))).toBe(0);
    expect(actualCost(failed('invalid_request'))).toBe(0);
    // ⚠️ `ambiguous` = a timeout / 5xx: the job MAY exist and bill, so the budget keeps counting it.
    expect(actualCost(failed('ambiguous'))).toBeUndefined();
    expect(actualCost({ success: true, metadata: {} as never })).toBeUndefined();
  });

  it('a non-Google-only render keeps the flat video line (no Veo price is invented for it)', async () => {
    process.env.VIDEO_GOOGLE_ONLY = '0';
    // Let the multi-vendor path fail fast and locally: no Replicate token, no LTX key.
    const saved = { r: process.env.REPLICATE_API_TOKEN, l: process.env.LTX_VIDEO_API_KEY, l2: process.env.LTX_API_KEY };
    delete process.env.REPLICATE_API_TOKEN; delete process.env.LTX_VIDEO_API_KEY; delete process.env.LTX_API_KEY;
    try {
      await new ServiceManager().execute(videoRequest({ veoTier: 'fast', duration: '5' })).catch(() => undefined);
      const opts = lastGuardOpts();
      expect(opts.unitCostUsd).toBeUndefined();
      expect(opts.units).toBe(5); // guardVideoSeconds: ceil, clamped to 4–10
    } finally {
      if (saved.r !== undefined) process.env.REPLICATE_API_TOKEN = saved.r;
      if (saved.l !== undefined) process.env.LTX_VIDEO_API_KEY = saved.l;
      if (saved.l2 !== undefined) process.env.LTX_API_KEY = saved.l2;
    }
  });
});

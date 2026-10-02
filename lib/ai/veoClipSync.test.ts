/** @jest-environment node */
/**
 * renderVeoClipSync — the blocking Veo render Product-Ad uses — on lib/veo/engine and inside the budget guard.
 *
 * ⚠️ WHY THESE TESTS. This file used to call lib/ai/geminiVeo directly: a private Gemini-API client that
 * could never render on Vertex AI once GCP credentials were added, and that spent Google money OUTSIDE the
 * daily budget guard. What must hold now, on every path, is the contract the route's `veo || kling ||
 * kenBurns` chain depends on: a URL only for a clip that was actually delivered, null for every miss, never
 * a throw — and never a second POST for a create that MAY already have made a billed job.
 *
 * The engine, the Gemini download, the guard, hosting and the ffmpeg crop are mocked; capabilities is real,
 * so the guard is priced by the same table the engine renders by. Fake timers drive the 5 s poll cadence.
 */
import { costPerSecondUsd, resolveModel } from '../veo/capabilities';
import { STUDIO_DEFAULT_VEO_TIER } from '../credits/videoPricing';
import { renderVeoClipSync, veoCanRender } from './veoClipSync';

const veoTransport = jest.fn();
const createVeoClip = jest.fn();
const pollVeoClip = jest.fn();
const deliverableUrl = jest.fn();
const downloadGeminiVideo = jest.fn();
const guardedCall = jest.fn();
const uploadBufferAndSign = jest.fn();
const stripBottomWatermark = jest.fn();
const hostGcsVideo = jest.fn();

jest.mock('../veo/engine', () => ({
  veoTransport: () => veoTransport(),
  createVeoClip: (...a: unknown[]) => createVeoClip(...a),
  pollVeoClip: (...a: unknown[]) => pollVeoClip(...a),
  deliverableUrl: (...a: unknown[]) => deliverableUrl(...a),
}));
jest.mock('../veo/geminiTransport', () => ({ downloadGeminiVideo: (...a: unknown[]) => downloadGeminiVideo(...a) }));
jest.mock('../veo/deliver', () => ({ hostGcsVideo: (...a: unknown[]) => hostGcsVideo(...a) }));
jest.mock('../services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    readonly reason: string;
    constructor(_service: string, reason: string) {
      super(`budget_exceeded:${reason}`);
      this.reason = reason;
    }
  }
  return { BudgetExceededError, guardedCall: (...a: unknown[]) => guardedCall(...a) };
});
jest.mock('../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: (...a: unknown[]) => uploadBufferAndSign(...a) }));
jest.mock('../video/remixOps', () => ({ stripBottomWatermark: (...a: unknown[]) => stripBottomWatermark(...a) }));

const GEMINI_OP = 'models/veo-3.1-generate-preview/operations/op1';
const VERTEX_OP = 'projects/p/locations/us-central1/publishers/google/models/veo-3.1-generate-001/operations/op1';
const SIGNED = 'https://storage.googleapis.com/bucket/veo/product-ad_u1/0-ab/sample_0.mp4?X-Goog-Signature=abc';
const GEMINI_FILE = { kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x:download', mimeType: 'video/mp4' };
/** Big enough to clear the 1 KiB "not a playable clip" floor. */
const MP4 = Buffer.alloc(4_096, 7);

const accepted = (transport: 'gemini' | 'vertex' = 'gemini') => {
  const model = transport === 'vertex' ? 'veo-3.1-generate-001' : 'veo-3.1-generate-preview';
  return {
    outcome: { ok: true, operation: { name: transport === 'vertex' ? VERTEX_OP : GEMINI_OP, model } },
    request: { aspect: '9:16', durationSec: 8, resolution: '1080p', tier: 'standard', generateAudio: true, prompt: 'p' },
    adjustments: [],
    model,
    transport,
  };
};
const refused = (reason: string, retryable = false) => ({
  outcome: { ok: false, reason, retryable },
  request: { aspect: '9:16' },
  adjustments: [],
  model: 'veo-3.1-generate-preview',
  transport: 'gemini',
});

const ARGS = {
  startImage: 'https://cdn.example.com/product.jpg',
  promptText: 'the product as the hero, cinematic',
  aspect: '9:16',
  durationSec: 8,
  folder: 'product-ad/u1',
  budgetMs: 240_000,
};

type GuardOpts = {
  service: string; model: string; units: number; unitCostUsd: number; userId?: string;
  actualCost: (r: unknown) => number | undefined;
};
const guardOpts = (): GuardOpts => guardedCall.mock.calls[0][0] as GuardOpts;

/** Run a render, stepping the fake clock through its 5 s poll sleeps. */
async function render(args: Parameters<typeof renderVeoClipSync>[0] = ARGS) {
  const pending = renderVeoClipSync(args);
  for (let i = 0; i < 60; i++) await jest.advanceTimersByTimeAsync(5_000);
  return pending;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Only the clock is faked: the gemini-file crop writes a real scratch file under the OS tmpdir.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  veoTransport.mockReturnValue('gemini');
  guardedCall.mockImplementation(async (_opts: unknown, fn: () => Promise<unknown>) => fn());
  createVeoClip.mockResolvedValue(accepted());
  pollVeoClip.mockResolvedValue({ state: 'succeeded', videos: [GEMINI_FILE] });
  deliverableUrl.mockResolvedValue(SIGNED);
  hostGcsVideo.mockResolvedValue(SIGNED);
  downloadGeminiVideo.mockResolvedValue(MP4);
  uploadBufferAndSign.mockResolvedValue('https://supabase.example.com/renders/raw.mp4?token=t');
  stripBottomWatermark.mockResolvedValue('https://supabase.example.com/renders/veo-clean.mp4?token=t');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('what Veo is asked to render', () => {
  it('refuses 1:1 without a submit — Veo has no square and this path has no crop', async () => {
    expect(veoCanRender('1:1')).toBe(false);

    await expect(render({ ...ARGS, aspect: '1:1' })).resolves.toBeNull();

    expect(guardedCall).not.toHaveBeenCalled();
    expect(createVeoClip).not.toHaveBeenCalled();
  });

  it('can render only when a Veo transport is configured', async () => {
    expect(veoCanRender('9:16')).toBe(true);
    veoTransport.mockReturnValue(null);
    expect(veoCanRender('9:16')).toBe(false);

    await expect(render()).resolves.toBeNull();
    expect(createVeoClip).not.toHaveBeenCalled();
  });

  it('submits once, inside the budget guard, priced at the seconds Veo renders', async () => {
    await render({ ...ARGS, durationSec: 5, userId: 'u1' });

    expect(guardedCall).toHaveBeenCalledTimes(1);
    const model = resolveModel('gemini', STUDIO_DEFAULT_VEO_TIER);
    // 5 s snaps UP to 6 s (720p — above 720p needs an 8 s clip); the budget never under-counts.
    expect(guardOpts()).toEqual(expect.objectContaining({ service: 'video', model, units: 6, userId: 'u1' }));
    expect(guardOpts().unitCostUsd).toBeCloseTo(costPerSecondUsd(model, '720p', true, 'gemini'));

    expect(createVeoClip).toHaveBeenCalledTimes(1);
    expect(createVeoClip).toHaveBeenCalledWith({
      request: {
        prompt: ARGS.promptText,
        aspect: '9:16',
        durationSec: 5,
        generateAudio: true,
        startImage: { kind: 'url', url: ARGS.startImage },
      },
      tier: STUDIO_DEFAULT_VEO_TIER, // the tier the guard priced — never the engine's dearer default
      sessionId: 'product-ad/u1',
      ordinal: 0,
    });
  });

  it('returns null without a submit when the budget refuses', async () => {
    const { BudgetExceededError } = jest.requireMock('../services/billing/guardedCall') as {
      BudgetExceededError: new (service: string, reason: string) => Error;
    };
    guardedCall.mockRejectedValue(new BudgetExceededError('video', 'daily_cap'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(render()).resolves.toBeNull();

    expect(createVeoClip).not.toHaveBeenCalled();
    expect(pollVeoClip).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('delivery', () => {
  it('a Vertex AI clip is copied once into Supabase (the Library re-signs only Supabase) — never downloaded from Gemini or cropped', async () => {
    veoTransport.mockReturnValue('vertex');
    createVeoClip.mockResolvedValue(accepted('vertex'));
    pollVeoClip
      .mockResolvedValueOnce({ state: 'processing' })
      .mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gcs', gcsUri: 'gs://bucket/veo/x/sample_0.mp4', mimeType: 'video/mp4' }] });

    const res = await render();

    expect(res).toEqual({ url: SIGNED, engine: 'Veo on Vertex AI (veo-3.1-generate-001)' });
    expect(pollVeoClip).toHaveBeenCalledWith(VERTEX_OP);
    expect(hostGcsVideo).toHaveBeenCalledWith(expect.objectContaining({ kind: 'gcs' }), expect.stringMatching(/\.mp4$/));
    expect(downloadGeminiVideo).not.toHaveBeenCalled();
    expect(stripBottomWatermark).not.toHaveBeenCalled();
    // The Vertex price, not the Gemini one.
    const model = resolveModel('vertex', STUDIO_DEFAULT_VEO_TIER);
    expect(guardOpts().model).toBe(model);
    expect(guardOpts().unitCostUsd).toBeCloseTo(costPerSecondUsd(model, '1080p', true, 'vertex'));
  });

  it('a Gemini API clip is downloaded server-side, cropped and hosted once', async () => {
    const res = await render();

    expect(res).toEqual({
      url: 'https://supabase.example.com/renders/veo-clean.mp4?token=t',
      engine: 'Gemini Veo (veo-3.1-generate-preview)',
    });
    expect(downloadGeminiVideo).toHaveBeenCalledWith(GEMINI_FILE.uri);
    // Cropped from the LOCAL bytes (no re-download of a hosted copy), at the native frame Veo rendered.
    const [input, aspect] = stripBottomWatermark.mock.calls[0] as [string, string];
    expect(input).not.toMatch(/^https?:/);
    expect(aspect).toBe('9:16');
    expect(uploadBufferAndSign).not.toHaveBeenCalled(); // the crop hosted it — no orphaned raw upload
  });

  it('hosts the raw clip when the crop is off or misses — never a local path', async () => {
    // VEO_WATERMARK_CROP_PCT=0 → stripBottomWatermark hands back its INPUT, a /tmp path.
    stripBottomWatermark.mockImplementation(async (input: string) => input);

    const res = await render();

    expect(res?.url).toBe('https://supabase.example.com/renders/raw.mp4?token=t');
    expect(uploadBufferAndSign).toHaveBeenCalledWith(
      'renders', expect.stringMatching(/^product-ad\/u1\/\d+\.mp4$/), MP4, 'video/mp4', 604_800,
    );
  });

  it('hosts Vertex inline bytes uncropped — Vertex stamps no visible mark', async () => {
    veoTransport.mockReturnValue('vertex');
    createVeoClip.mockResolvedValue(accepted('vertex'));
    pollVeoClip.mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'bytes', base64: MP4.toString('base64'), mimeType: 'video/mp4' }] });

    const res = await render();

    expect(res?.url).toBe('https://supabase.example.com/renders/raw.mp4?token=t');
    expect(stripBottomWatermark).not.toHaveBeenCalled();
    expect(downloadGeminiVideo).not.toHaveBeenCalled();
  });

  it.each([
    ['the download misses', () => downloadGeminiVideo.mockResolvedValue(null)],
    ['the download is not a playable clip', () => downloadGeminiVideo.mockResolvedValue(Buffer.from('mp4'))],
    ['hosting misses', () => {
      stripBottomWatermark.mockResolvedValue(null);
      uploadBufferAndSign.mockResolvedValue(null);
    }],
  ])('returns null — never a dead URL — when %s', async (_label, arrange) => {
    arrange();
    await expect(render()).resolves.toBeNull();
  });

  it('returns null when a Vertex clip cannot be signed', async () => {
    createVeoClip.mockResolvedValue(accepted('vertex'));
    pollVeoClip.mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gcs', gcsUri: 'gs://bucket/x.mp4', mimeType: 'video/mp4' }] });
    hostGcsVideo.mockResolvedValue(null); // hostGcsVideo is null only when the clip cannot be signed at all

    await expect(render()).resolves.toBeNull();
  });
});

describe('misses fall through to the caller’s next engine', () => {
  it.each([
    ['filtered', { state: 'filtered', reason: 'blocked by safety filters', supportCodes: ['58061214'] }],
    ['failed', { state: 'failed', reason: 'internal error' }],
  ])('a %s poll returns null and delivers nothing', async (_label, outcome) => {
    pollVeoClip.mockResolvedValue(outcome);

    await expect(render()).resolves.toBeNull();

    expect(pollVeoClip).toHaveBeenCalledTimes(1);
    expect(downloadGeminiVideo).not.toHaveBeenCalled();
    expect(deliverableUrl).not.toHaveBeenCalled();
  });

  it('stops polling at the deadline', async () => {
    pollVeoClip.mockResolvedValue({ state: 'processing' });

    // Polls at 5 s and 10 s are inside 12 s; the one at 15 s is the last, then the budget is spent.
    await expect(render({ ...ARGS, budgetMs: 12_000 })).resolves.toBeNull();

    expect(pollVeoClip).toHaveBeenCalledTimes(3);
  });

  it('keeps waiting through a poll that throws', async () => {
    pollVeoClip.mockRejectedValueOnce(new Error('socket hang up'));

    const res = await render();

    expect(res?.engine).toBe('Gemini Veo (veo-3.1-generate-preview)');
    expect(pollVeoClip).toHaveBeenCalledTimes(2);
  });

  it('never re-submits an ambiguous create — and the budget keeps its estimate', async () => {
    // A timed-out / 5xx submit MAY have made a billed job; a second POST could make two.
    createVeoClip.mockResolvedValue(refused('ambiguous'));

    await expect(render()).resolves.toBeNull();

    expect(createVeoClip).toHaveBeenCalledTimes(1);
    expect(pollVeoClip).not.toHaveBeenCalled();
    expect(guardOpts().actualCost(refused('ambiguous'))).toBeUndefined();
    // A definitive refusal created nothing, so it books $0; an accepted clip keeps the estimate.
    expect(guardOpts().actualCost(refused('rate_limited', true))).toBe(0);
    expect(guardOpts().actualCost(accepted())).toBeUndefined();
  });

  it('returns null — never throws — when a definitive refusal comes back', async () => {
    createVeoClip.mockResolvedValue(refused('quota'));

    await expect(render()).resolves.toBeNull();
    expect(createVeoClip).toHaveBeenCalledTimes(1);
  });
});

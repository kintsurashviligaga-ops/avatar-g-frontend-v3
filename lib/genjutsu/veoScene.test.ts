/** @jest-environment node */
/**
 * The scene's engine leg: ONE Veo reference-to-video clip. Pinned with Veo, storage and the budget guard mocked —
 * what is sent (8 s, the references as our own URLs, the tier), what a refusal looks like (never thrown, never a
 * re-submit), and how a finished clip is delivered (a fixed path per operation, the Gemini mark cropped, no throw).
 */
jest.mock('server-only', () => ({}));
jest.mock('../services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    readonly reason: string;
    constructor(reason: string) { super(`budget_exceeded:${reason}`); this.reason = reason; }
  }
  return { BudgetExceededError, guardedCall: jest.fn(async (_o: unknown, fn: () => Promise<unknown>) => fn()) };
});
jest.mock('../veo/engine', () => ({ veoTransport: jest.fn(() => 'gemini'), createVeoClip: jest.fn(), pollVeoClip: jest.fn() }));
jest.mock('../veo/deliver', () => ({ hostGcsVideo: jest.fn(async () => 'https://signed.example/gcs-hosted.mp4') }));
jest.mock('../veo/geminiTransport', () => ({ downloadGeminiVideo: jest.fn(async () => Buffer.alloc(4096, 1)) }));
jest.mock('../video/remixOps', () => ({ stripBottomWatermark: jest.fn(async () => 'https://signed.example/cropped.mp4') }));
jest.mock('../orchestrator/storage-adapter', () => ({
  createSignedAssetUrl: jest.fn(async () => null),
  uploadBufferAndSign: jest.fn(async (_b: string, path: string) => `https://signed.example/${path}`),
  removeStorageObjects: jest.fn(async () => undefined),
}));

import { guardedCall, BudgetExceededError } from '../services/billing/guardedCall';
import { createVeoClip, pollVeoClip, veoTransport } from '../veo/engine';
import { hostGcsVideo } from '../veo/deliver';
import { downloadGeminiVideo } from '../veo/geminiTransport';
import { stripBottomWatermark } from '../video/remixOps';
import { createSignedAssetUrl, removeStorageObjects, uploadBufferAndSign } from '../orchestrator/storage-adapter';
import { SCENE_NEGATIVE_PROMPT, deliverScene, pollScene, scenePath, submitScene } from './veoScene';

const OK_CREATE = {
  outcome: { ok: true, operation: { transport: 'gemini', name: 'models/veo-3.1-fast-generate-preview/operations/abc', model: 'veo-3.1-fast-generate-preview' } },
  request: { aspect: '9:16' },
  adjustments: [{ field: 'durationSec' }],
  model: 'veo-3.1-fast-generate-preview',
  transport: 'gemini',
};
const input = { prompt: 'A scene', aspect: '9:16' as const, quality: 'fast' as const, referenceUrls: ['https://signed.example/a.jpg', 'https://signed.example/b.jpg'], userId: 'u1', sessionId: 'genjutsu-1' };

beforeEach(() => {
  jest.clearAllMocks();
  (veoTransport as jest.Mock).mockReturnValue('gemini');
  (createVeoClip as jest.Mock).mockResolvedValue(OK_CREATE);
  (createSignedAssetUrl as jest.Mock).mockResolvedValue(null);
  (downloadGeminiVideo as jest.Mock).mockResolvedValue(Buffer.alloc(4096, 1));
  (stripBottomWatermark as jest.Mock).mockResolvedValue('https://signed.example/cropped.mp4');
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ─── submit ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('submits ONE 8 s reference-to-video request: the references as our own URLs, audio on, the tier from the quality', async () => {
  const r = await submitScene(input);
  expect(r).toEqual({ ok: true, operation: 'models/veo-3.1-fast-generate-preview/operations/abc', aspect: '9:16', model: 'veo-3.1-fast-generate-preview', transport: 'gemini', adjustments: ['durationSec'] });
  expect(createVeoClip).toHaveBeenCalledTimes(1);
  const arg = (createVeoClip as jest.Mock).mock.calls[0]![0];
  expect(arg.tier).toBe('fast');
  expect(arg.request).toMatchObject({ aspect: '9:16', durationSec: 8, generateAudio: true, negativePrompt: SCENE_NEGATIVE_PROMPT });
  expect(arg.request.referenceImages).toEqual([{ kind: 'url', url: 'https://signed.example/a.jpg' }, { kind: 'url', url: 'https://signed.example/b.jpg' }]);
  expect(arg.sessionId).toBe('genjutsu-1');
  // A product reference carries its own branding: the negative prompt must not forbid logos or text.
  expect(SCENE_NEGATIVE_PROMPT).not.toMatch(/logo|\btext\b/i);
});

test('Standard quality renders on the Standard tier; no photos means no referenceImages at all', async () => {
  await submitScene({ ...input, quality: 'standard', referenceUrls: [] });
  const arg = (createVeoClip as jest.Mock).mock.calls[0]![0];
  expect(arg.tier).toBe('standard');
  expect(arg.request.referenceImages).toBeUndefined();
});

test('the spend goes through the platform budget guard at the seconds Veo RENDERS and its exact $/s', async () => {
  await submitScene(input);
  const opts = (guardedCall as jest.Mock).mock.calls[0]![0];
  expect(opts).toMatchObject({ service: 'video', units: 8, userId: 'u1' });
  expect(opts.unitCostUsd).toBeGreaterThan(0);
  // A definitive refusal books $0; an ambiguous one keeps the estimate (it may have been billed).
  expect(opts.actualCost({ outcome: { ok: false, reason: 'invalid_request' } })).toBe(0);
  expect(opts.actualCost({ outcome: { ok: false, reason: 'ambiguous' } })).toBeUndefined();
  expect(opts.actualCost({ outcome: { ok: true } })).toBeUndefined();
});

test('no Veo transport configured → not_configured, nothing submitted', async () => {
  (veoTransport as jest.Mock).mockReturnValue(null);
  expect(await submitScene(input)).toEqual({ ok: false, reason: 'not_configured', retryable: false });
  expect(createVeoClip).not.toHaveBeenCalled();
});

test('a refused or ambiguous create is returned, never thrown, never re-submitted', async () => {
  (createVeoClip as jest.Mock).mockResolvedValue({ outcome: { ok: false, reason: 'ambiguous', retryable: false }, request: {}, adjustments: [], model: 'm', transport: 'gemini' });
  expect(await submitScene(input)).toEqual({ ok: false, reason: 'ambiguous', retryable: false });
  expect(createVeoClip).toHaveBeenCalledTimes(1);
});

test('the platform budget refusing is a `budget` miss; any other throw before a job exists is a retryable `unavailable`', async () => {
  (guardedCall as jest.Mock).mockRejectedValueOnce(new BudgetExceededError('daily_limit' as never));
  expect(await submitScene(input)).toEqual({ ok: false, reason: 'budget', retryable: false });
  (guardedCall as jest.Mock).mockRejectedValueOnce(new Error('guard blew up'));
  expect(await submitScene(input)).toEqual({ ok: false, reason: 'unavailable', retryable: true });
});

// ─── poll + deliver ─────────────────────────────────────────────────────────────────────────────────────────────

test('pollScene maps Veo\'s states: working, filtered, failed — and a transient poll error reads as working', async () => {
  (pollVeoClip as jest.Mock).mockResolvedValueOnce({ state: 'processing' });
  expect(await pollScene('op', '16:9', 'u1')).toEqual({ state: 'processing' });
  (pollVeoClip as jest.Mock).mockResolvedValueOnce({ state: 'filtered', reason: 'x', supportCodes: [] });
  expect(await pollScene('op', '16:9', 'u1')).toEqual({ state: 'failed', reason: 'filtered' });
  (pollVeoClip as jest.Mock).mockResolvedValueOnce({ state: 'failed', reason: 'x' });
  expect(await pollScene('op', '16:9', 'u1')).toEqual({ state: 'failed', reason: 'generation_failed' });
  (pollVeoClip as jest.Mock).mockRejectedValueOnce(new Error('network'));
  expect(await pollScene('op', '16:9', 'u1')).toEqual({ state: 'processing' });
});

test('a finished Gemini clip is downloaded server-side, the visible mark cropped, hosted at the FIXED path, the staging copy removed', async () => {
  (pollVeoClip as jest.Mock).mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x', mimeType: 'video/mp4' }] });
  const r = await pollScene('models/m/operations/abc', '9:16', 'u1');
  expect(r).toEqual({ state: 'ready', url: 'https://signed.example/cropped.mp4' });
  const path = scenePath('u1', 'models/m/operations/abc');
  expect(stripBottomWatermark).toHaveBeenCalledWith(`https://signed.example/${path.replace(/\.mp4$/, '-raw.mp4')}`, '9:16', undefined, { bucket: 'renders', path });
  expect(removeStorageObjects).toHaveBeenCalledWith('renders', [path.replace(/\.mp4$/, '-raw.mp4')]);
});

test('if the crop cannot run, the uncropped clip is hosted at the same fixed path — the user still gets their clip', async () => {
  (stripBottomWatermark as jest.Mock).mockResolvedValue(null);
  const url = await deliverScene({ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x', mimeType: 'video/mp4' }, '16:9', 'genjutsu/u1/k.mp4');
  expect(url).toBe('https://signed.example/genjutsu/u1/k.mp4');
  expect(uploadBufferAndSign).toHaveBeenLastCalledWith('renders', 'genjutsu/u1/k.mp4', expect.any(Buffer), 'video/mp4', 604_800);
});

test('a crop that merely hands back its INPUT (crop switched off) is not mistaken for the cropped clip', async () => {
  (stripBottomWatermark as jest.Mock).mockImplementation(async (raw: string) => raw);
  const url = await deliverScene({ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x', mimeType: 'video/mp4' }, '16:9', 'genjutsu/u1/k.mp4');
  expect(url).toBe('https://signed.example/genjutsu/u1/k.mp4');
});

test('Vertex (gcs) clips are copied into our storage — and never cropped (Vertex stamps no mark)', async () => {
  const url = await deliverScene({ kind: 'gcs', gcsUri: 'gs://b/o.mp4', mimeType: 'video/mp4' }, '16:9', 'genjutsu/u1/k.mp4');
  expect(url).toBe('https://signed.example/gcs-hosted.mp4');
  expect(hostGcsVideo).toHaveBeenCalledWith({ kind: 'gcs', gcsUri: 'gs://b/o.mp4', mimeType: 'video/mp4' }, 'genjutsu/u1/k.mp4');
  expect(stripBottomWatermark).not.toHaveBeenCalled();
  expect(downloadGeminiVideo).not.toHaveBeenCalled();
});

test('a re-poll re-signs the hosted object instead of downloading, cropping and uploading it again', async () => {
  (createSignedAssetUrl as jest.Mock).mockResolvedValue('https://signed.example/already.mp4');
  const url = await deliverScene({ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x', mimeType: 'video/mp4' }, '16:9', 'genjutsu/u1/k.mp4');
  expect(url).toBe('https://signed.example/already.mp4');
  expect(downloadGeminiVideo).not.toHaveBeenCalled();
  expect(uploadBufferAndSign).not.toHaveBeenCalled();
});

test('undeliverable is "delivering" (retried by the next poll), never a throw and never a dead URL', async () => {
  (pollVeoClip as jest.Mock).mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1beta/files/x', mimeType: 'video/mp4' }] });
  (downloadGeminiVideo as jest.Mock).mockResolvedValue(null);
  expect(await pollScene('op', '16:9', 'u1')).toEqual({ state: 'delivering' });
  (downloadGeminiVideo as jest.Mock).mockResolvedValue(Buffer.alloc(10)); // under the 1 KB floor — not a playable clip
  expect(await pollScene('op', '16:9', 'u1')).toEqual({ state: 'delivering' });
  (downloadGeminiVideo as jest.Mock).mockRejectedValue(new Error('boom'));
  expect(await pollScene('op', '16:9', 'u1')).toEqual({ state: 'delivering' });
  expect(await deliverScene(undefined, '16:9', 'p')).toBeNull();
});

test('the delivery path is stable per operation, per user, and path-safe', () => {
  expect(scenePath('u1', 'models/m/operations/abc')).toBe(scenePath('u1', 'models/m/operations/abc'));
  expect(scenePath('u1', 'op-a')).not.toBe(scenePath('u1', 'op-b'));
  expect(scenePath('u1/../x', 'op')).toMatch(/^genjutsu\/u1x\/[0-9a-f]{24}\.mp4$/);
});

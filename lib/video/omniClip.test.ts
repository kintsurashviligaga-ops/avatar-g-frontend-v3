/** @jest-environment node */
/**
 * lib/video/omniClip — the 10 s clip on Gemini Omni Flash (Vertex AI, the Interactions API; GG card 2026-10-25 16:51Z).
 *
 * The request body is the shape the paid probe that day proved; a finished interaction gives the model's own clip (never the
 * photo the request sent); a submit is priced by the budget guard at Omni's list price and never re-sent when ambiguous; a
 * poll re-signs an already hosted clip without asking Vertex again. Network, guard, hosting and the token are mocked.
 */
jest.mock('server-only', () => ({}));

const guardedCall = jest.fn();
const createSignedAssetUrl = jest.fn();
const deliverScene = jest.fn();
const getVertexAccessToken = jest.fn();
const vertexAiConfig = jest.fn();

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
jest.mock('../orchestrator/storage-adapter', () => ({ createSignedAssetUrl: (...a: unknown[]) => createSignedAssetUrl(...a) }));
jest.mock('../genjutsu/veoScene', () => ({ deliverScene: (...a: unknown[]) => deliverScene(...a) }));
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: (...a: unknown[]) => getVertexAccessToken(...a),
  vertexAiConfig: (...a: unknown[]) => vertexAiConfig(...a),
}));

import { BudgetExceededError } from '../services/billing/guardedCall';
import { VertexAuthError } from '../veo/vertexAuth';
import {
  OMNI_INPUT_VIDEO_USD_PER_SEC, OMNI_MODEL, OMNI_USD_PER_SEC, isOmniInteractionId, omniEditListUsd, omniEditRequestBody, omniRequestBody,
  pollOmniClip, readInteraction, submitOmniClip, submitOmniEdit,
} from './omniClip';

const ID = 'v1_ChBqT21uaVByb2JlMDAx';
const PATH = 'video-clip/u-1/omni.mp4';
const PHOTO = { base64: Buffer.from('photo').toString('base64'), mimeType: 'image/jpeg' as const };
const VIDEO = { base64: Buffer.from('video').toString('base64'), mimeType: 'video/mp4' as const };
const fetchMock = jest.fn();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
  vertexAiConfig.mockReturnValue({ projectId: 'gen-lang-client-0671348730', location: 'global' });
  getVertexAccessToken.mockResolvedValue('tok');
  createSignedAssetUrl.mockResolvedValue(null);
  // The guard runs the call; what it books is checked where it matters.
  guardedCall.mockImplementation((_opts: unknown, fn: () => Promise<unknown>) => fn());
});

test('the body: an image part then `<FIRST_FRAME>` and the prompt; 10 s at the picked resolution; stored and in the background', () => {
  expect(omniRequestBody({ prompt: 'A woman smiles.', aspect: '9:16', resolution: '1080p', seconds: 10, firstFrame: PHOTO })).toEqual({
    model: OMNI_MODEL,
    input: [{ type: 'image', data: PHOTO.base64, mime_type: 'image/jpeg' }, { type: 'text', text: '<FIRST_FRAME> A woman smiles.' }],
    response_format: { type: 'video', aspect_ratio: '9:16', resolution: '1080p', duration: '10s' },
    generation_config: { video_config: { task: 'image_to_video' } },
    background: true,
    store: true,
  });
  const text = omniRequestBody({ prompt: 'Rain on a lake.', aspect: '16:9', resolution: '720p', seconds: 42 });
  expect(text.input).toEqual([{ type: 'text', text: 'Rain on a lake.' }]);
  expect(text.generation_config).toEqual({ video_config: { task: 'text_to_video' } });
  // Omni takes 3–10 s; anything else is clamped, never sent as is.
  expect((text.response_format as { duration: string }).duration).toBe('10s');
  expect((omniRequestBody({ prompt: 'x', aspect: '16:9', resolution: '720p', seconds: 1 }).response_format as { duration: string }).duration).toBe('3s');
});

test('list prices a second: 5,792 video tokens at 720p, 8,688 at 1080p, $17.50 per 1M', () => {
  expect(OMNI_USD_PER_SEC['720p']).toBeCloseTo(0.10136, 6);
  expect(OMNI_USD_PER_SEC['1080p']).toBeCloseTo(0.15204, 6);
});

test('an interaction id becomes a URL segment, so only its own alphabet passes', () => {
  expect(isOmniInteractionId(ID)).toBe(true);
  for (const bad of ['', 'short', '../../x/y/z', 'a/b/c/d/e/f', `${ID}?alt=media`, 'x'.repeat(257)]) expect(isOmniInteractionId(bad)).toBe(false);
});

test('reading an interaction: the model\'s clip, never the photo sent; usage numbers only; failures and safety words', () => {
  const done = readInteraction({
    status: 'completed',
    steps: [
      { type: 'user_input', content: [{ type: 'video', data: 'SENT', mime_type: 'video/mp4' }] },
      { type: 'model_output', content: [{ type: 'text', text: 'ok' }, { type: 'video', data: 'CLIP', mime_type: 'video/mp4' }] },
    ],
    usage: { total_output_tokens: 57_920, by_modality: { video: 57_920, note: 'x' }, model: 'm' },
  });
  expect(done).toEqual({
    state: 'completed',
    video: { kind: 'bytes', base64: 'CLIP', mimeType: 'video/mp4' },
    usage: { total_output_tokens: 57_920, 'by_modality.video': 57_920 },
  });
  // The shape Vertex returned on the 2026-10-25 edit probe: every input part echoed as a user_input step, thought steps
  // (a `summary`, then a `signature`), the clip last; usage per modality in an array of no fixed order.
  expect(readInteraction({
    id: 'ChBjOWFhProbeEditKgRtYWlu', status: 'completed', object: 'interaction', model: 'gemini-omni-1.1-flash-preview',
    steps: [
      { type: 'user_input', content: [{ type: 'video', mime_type: 'video/mp4', data: 'SOURCE' }] },
      { type: 'user_input', content: [{ type: 'text', text: 'Make it night.' }] },
      { type: 'thought', summary: [{ type: 'text', text: 'thinking' }] },
      { type: 'thought', signature: 'sig' },
      { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: 'EDITED' }] },
    ],
    usage: {
      total_tokens: 35_410, total_input_tokens: 17_665, total_output_tokens: 17_376, total_thought_tokens: 369,
      input_tokens_by_modality: [{ modality: 'text', tokens: 111 }, { modality: 'video', tokens: 17_478 }, { modality: 'audio', tokens: 76 }],
      output_tokens_by_modality: [{ modality: 'video', tokens: 17_376 }],
    },
  })).toEqual({
    state: 'completed',
    video: { kind: 'bytes', base64: 'EDITED', mimeType: 'video/mp4' },
    usage: {
      total_tokens: 35_410, total_input_tokens: 17_665, total_output_tokens: 17_376, total_thought_tokens: 369,
      'input_tokens_by_modality.text': 111, 'input_tokens_by_modality.video': 17_478, 'input_tokens_by_modality.audio': 76,
      'output_tokens_by_modality.video': 17_376,
    },
  });
  expect(readInteraction({ status: 'COMPLETED', steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'gs://b/o.mp4' }] }] }))
    .toEqual({ state: 'completed', video: { kind: 'gcs', gcsUri: 'gs://b/o.mp4', mimeType: 'video/mp4' }, usage: null });
  // A completed interaction with no clip in it is read as such (the poll fails it, never shows an empty video).
  expect(readInteraction({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'no' }] }] }))
    .toMatchObject({ state: 'completed', video: null });
  expect(readInteraction({ status: 'in_progress' })).toEqual({ state: 'processing' });
  expect(readInteraction(null)).toEqual({ state: 'processing' });
  expect(readInteraction({ status: 'failed', error: { message: 'Generation blocked by our safety filters' } })).toEqual({ state: 'failed', filtered: true });
  expect(readInteraction({ status: 'cancelled' })).toEqual({ state: 'failed', filtered: false });
});

test('submit: one POST to the global Interactions endpoint, inside the guard at Omni\'s price; the id comes back', async () => {
  fetchMock.mockResolvedValue(json(200, { id: ID, status: 'in_progress' }));
  const r = await submitOmniClip({ prompt: 'p', aspect: '9:16', resolution: '1080p', seconds: 10, userId: 'u-1' });
  expect(r).toEqual({ ok: true, id: ID });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('https://aiplatform.googleapis.com/v1beta1/projects/gen-lang-client-0671348730/locations/global/interactions');
  expect(init).toMatchObject({ method: 'POST', redirect: 'manual', headers: { Authorization: 'Bearer tok' } });
  expect(JSON.parse(init.body).model).toBe(OMNI_MODEL);
  expect(getVertexAccessToken).toHaveBeenCalledWith(false);
  const [opts] = guardedCall.mock.calls[0]!;
  expect(opts).toMatchObject({ service: 'video', model: OMNI_MODEL, units: 10, unitCostUsd: OMNI_USD_PER_SEC['1080p'], userId: 'u-1' });
  // A definitive refusal books $0; an ambiguous one keeps the estimate.
  expect(opts.actualCost({ ok: false, reason: 'rejected', retryable: false })).toBe(0);
  expect(opts.actualCost({ ok: false, reason: 'ambiguous', retryable: false })).toBeUndefined();
  expect(opts.actualCost({ ok: true, id: ID })).toBeUndefined();
});

test('submit misses: a refusal is classified; a timeout or an id-less 2xx is ambiguous and never re-sent; budget and auth', async () => {
  fetchMock.mockResolvedValue(json(400, { error: { message: 'Request contains an invalid argument.' } }));
  const refused = await submitOmniClip({ prompt: 'p', aspect: '9:16', resolution: '720p', seconds: 10, userId: 'u-1' });
  expect(refused.ok).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fetchMock.mockReset().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
  const timedOut = await submitOmniClip({ prompt: 'p', aspect: '9:16', resolution: '720p', seconds: 10, userId: 'u-1' });
  expect(timedOut).toMatchObject({ ok: false, retryable: false });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fetchMock.mockReset().mockResolvedValue(json(200, { status: 'in_progress' }));
  expect(await submitOmniClip({ prompt: 'p', aspect: '9:16', resolution: '720p', seconds: 10, userId: 'u-1' }))
    .toEqual({ ok: false, reason: 'ambiguous', retryable: false });

  guardedCall.mockRejectedValueOnce(new BudgetExceededError('video' as never, 'daily'));
  expect(await submitOmniClip({ prompt: 'p', aspect: '9:16', resolution: '720p', seconds: 10, userId: 'u-1' }))
    .toEqual({ ok: false, reason: 'budget', retryable: false });

  fetchMock.mockReset();
  getVertexAccessToken.mockRejectedValueOnce(new VertexAuthError('token_failed', 'no token'));
  expect(await submitOmniClip({ prompt: 'p', aspect: '9:16', resolution: '720p', seconds: 10, userId: 'u-1' }))
    .toEqual({ ok: false, reason: 'auth', retryable: false });
  expect(fetchMock).not.toHaveBeenCalled();

  vertexAiConfig.mockReturnValue(null);
  expect(await submitOmniClip({ prompt: 'p', aspect: '9:16', resolution: '720p', seconds: 10, userId: 'u-1' }))
    .toEqual({ ok: false, reason: 'not_configured', retryable: false });
});

test('poll: a hosted clip is re-signed without asking Vertex; a finished one is hosted at the fixed path with its usage', async () => {
  createSignedAssetUrl.mockResolvedValueOnce('https://signed.example/omni.mp4');
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'ready', url: 'https://signed.example/omni.mp4' });
  expect(createSignedAssetUrl).toHaveBeenCalledWith('renders', PATH, 604_800);
  expect(fetchMock).not.toHaveBeenCalled();

  // A fresh Response each poll: a body is read once.
  fetchMock.mockImplementation(async () => json(200, {
    status: 'completed', usage: { total_output_tokens: 57_920 },
    steps: [{ type: 'model_output', content: [{ type: 'video', data: 'CLIP', mime_type: 'video/mp4' }] }],
  }));
  deliverScene.mockResolvedValueOnce('https://signed.example/new.mp4');
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'ready', url: 'https://signed.example/new.mp4', usage: { total_output_tokens: 57_920 } });
  expect(fetchMock.mock.calls[0]![0]).toBe(`https://aiplatform.googleapis.com/v1beta1/projects/gen-lang-client-0671348730/locations/global/interactions/${ID}`);
  expect(deliverScene).toHaveBeenCalledWith({ kind: 'bytes', base64: 'CLIP', mimeType: 'video/mp4' }, PATH);

  // A hosting miss is "delivering": the next poll tries again.
  deliverScene.mockResolvedValueOnce(null);
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'delivering' });
});

test('poll misses: still working, a transient error, a 404, a failure, an empty result and a forged id', async () => {
  fetchMock.mockResolvedValue(json(200, { status: 'in_progress' }));
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'processing' });
  fetchMock.mockResolvedValue(json(503, {}));
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'processing' });
  fetchMock.mockRejectedValue(new Error('socket hang up'));
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'processing' });
  fetchMock.mockResolvedValue(json(404, {}));
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'failed', reason: 'generation_failed' });
  fetchMock.mockResolvedValue(json(200, { status: 'failed', error: { message: 'blocked by safety filters' } }));
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'failed', reason: 'filtered' });
  fetchMock.mockResolvedValue(json(200, { status: 'completed', steps: [] }));
  expect(await pollOmniClip(ID, PATH)).toEqual({ state: 'failed', reason: 'generation_failed' });

  fetchMock.mockReset();
  expect(await pollOmniClip('../x', PATH)).toEqual({ state: 'failed', reason: 'generation_failed' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('the edit body: the video part then the words as typed; the task; no aspect ratio (Vertex refuses one for an edit)', () => {
  expect(omniEditRequestBody({ op: 'edit', prompt: 'Make it night.', video: VIDEO, seconds: 5, resolution: '720p' })).toEqual({
    model: OMNI_MODEL,
    input: [{ type: 'video', data: VIDEO.base64, mime_type: 'video/mp4' }, { type: 'text', text: 'Make it night.' }],
    response_format: { type: 'video', resolution: '720p', duration: '5s' },
    generation_config: { video_config: { task: 'edit' } },
    background: true,
    store: true,
  });
  const extend = omniEditRequestBody({ op: 'extend', prompt: 'He walks away.', video: VIDEO, seconds: 8, resolution: '1080p' });
  expect(extend.generation_config).toEqual({ video_config: { task: 'extend' } });
  expect(extend.response_format).toEqual({ type: 'video', resolution: '1080p', duration: '8s' });
  expect(JSON.stringify(extend)).not.toContain('aspect_ratio');
  // Omni renders 3–10 s; anything else is clamped, never sent as is.
  expect((omniEditRequestBody({ op: 'edit', prompt: 'x', video: VIDEO, seconds: 2, resolution: '720p' }).response_format as { duration: string }).duration).toBe('3s');
  expect((omniEditRequestBody({ op: 'extend', prompt: 'x', video: VIDEO, seconds: 30, resolution: '720p' }).response_format as { duration: string }).duration).toBe('10s');
});

test('the edit list price: the seconds rendered and the input video\'s own tokens (5,826 a second, $1.50 per 1M)', () => {
  expect(OMNI_INPUT_VIDEO_USD_PER_SEC).toBeCloseTo(0.008739, 6);
  expect(omniEditListUsd({ seconds: 8, inputSec: 6, resolution: '720p' })).toBeCloseTo(8 * 0.10136 + 6 * 0.008739, 6);
  expect(omniEditListUsd({ seconds: 4, inputSec: 10, resolution: '1080p' })).toBeCloseTo(4 * 0.15204 + 10 * 0.008739, 6);
  // The input is capped where the route refuses a longer one.
  expect(omniEditListUsd({ seconds: 4, inputSec: 60, resolution: '720p' })).toBeCloseTo(4 * 0.10136 + 10.25 * 0.008739, 6);
});

test('edit submit: one POST inside the guard, booked as the seconds rendered at a rate that carries the input video', async () => {
  fetchMock.mockResolvedValue(json(200, { id: ID, status: 'in_progress' }));
  const r = await submitOmniEdit({ op: 'extend', prompt: 'He walks away.', video: VIDEO, inputSec: 5, seconds: 8, resolution: '720p', userId: 'u-1' });
  expect(r).toEqual({ ok: true, id: ID });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('https://aiplatform.googleapis.com/v1beta1/projects/gen-lang-client-0671348730/locations/global/interactions');
  expect(JSON.parse(init.body).generation_config).toEqual({ video_config: { task: 'extend' } });
  const [opts] = guardedCall.mock.calls[0]!;
  expect(opts).toMatchObject({ service: 'video', model: OMNI_MODEL, units: 8, userId: 'u-1', promptSummary: 'extend: He walks away.' });
  expect(opts.units * opts.unitCostUsd).toBeCloseTo(omniEditListUsd({ seconds: 8, inputSec: 5, resolution: '720p' }), 9);
  expect(opts.actualCost({ ok: false, reason: 'rejected', retryable: false })).toBe(0);

  guardedCall.mockRejectedValueOnce(new BudgetExceededError('video' as never, 'daily'));
  expect(await submitOmniEdit({ op: 'edit', prompt: 'p', video: VIDEO, inputSec: 5, seconds: 5, resolution: '720p', userId: 'u-1' }))
    .toEqual({ ok: false, reason: 'budget', retryable: false });
  fetchMock.mockReset().mockResolvedValue(json(200, { status: 'in_progress' }));
  expect(await submitOmniEdit({ op: 'edit', prompt: 'p', video: VIDEO, inputSec: 5, seconds: 5, resolution: '720p', userId: 'u-1' }))
    .toEqual({ ok: false, reason: 'ambiguous', retryable: false });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

/** @jest-environment node */
/**
 * lib/providers/syncso — the sync.so lip-sync client (GG 2026-10-17 12:29Z), every call against a fake fetch: the request
 * says what the docs say (x-api-key, one video, one audio, the output cut to the audio), the key never leaves the
 * header, and each answer becomes the step the avatar's delivery takes next — wait, collect, or refund.
 */
jest.mock('server-only', () => ({}));

import { SYNC_GENERATE_URL, lipsyncRequest, pollLipsync, readGeneration, startLipsync, syncConfigured, syncModel } from './syncso';

const KEY_ENV = { SYNC_API_KEY: ' test-key ' } as unknown as NodeJS.ProcessEnv;
const answer = (status: number, json: unknown) => jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => json })) as unknown as typeof fetch;
const start = (fetchImpl: typeof fetch, env: NodeJS.ProcessEnv = KEY_ENV, idempotencyKey = 'myavatar-avatar-aaaa') =>
  startLipsync({ videoUrl: 'https://s/clip.mp4', audioUrl: 'https://s/line.wav', idempotencyKey, env, fetchImpl });

describe('configuration', () => {
  it('is on only with a key; the model is the owner\'s pick from the allowlist, else lipsync-2-pro', () => {
    expect(syncConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(syncConfigured({ SYNC_API_KEY: '  ' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(syncConfigured(KEY_ENV)).toBe(true);
    expect(syncModel({} as NodeJS.ProcessEnv)).toBe('lipsync-2-pro');
    expect(syncModel({ SYNC_LIPSYNC_MODEL: 'sync-3' } as unknown as NodeJS.ProcessEnv)).toBe('sync-3');
    expect(syncModel({ SYNC_LIPSYNC_MODEL: 'react-1' } as unknown as NodeJS.ProcessEnv)).toBe('lipsync-2-pro');
  });

  it('the body: one video, one audio, and the output the audio\'s length (bounce) — never the voice stretched', () => {
    expect(lipsyncRequest({ videoUrl: 'v', audioUrl: 'a', model: 'lipsync-2' })).toEqual({
      model: 'lipsync-2',
      input: [{ type: 'video', url: 'v' }, { type: 'audio', url: 'a' }],
      options: { sync_mode: 'bounce' },
    });
  });
});

describe('startLipsync', () => {
  it('posts to /v2/generate with the key in x-api-key and the job\'s Idempotency-Key, and returns the id', async () => {
    const f = answer(201, { id: 'gen-1', status: 'PENDING' });
    expect(await start(f)).toEqual({ ok: true, id: 'gen-1' });
    const [url, init] = (f as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SYNC_GENERATE_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-api-key': 'test-key', 'Content-Type': 'application/json', 'Idempotency-Key': 'myavatar-avatar-aaaa' });
    expect(JSON.parse(String(init.body))).toEqual(lipsyncRequest({ videoUrl: 'https://s/clip.mp4', audioUrl: 'https://s/line.wav', model: 'lipsync-2-pro' }));
    expect(String(init.body)).not.toContain('test-key');
  });

  it('no key, or a key sync.so would refuse → nothing is sent', async () => {
    const f = answer(201, { id: 'x' });
    expect(await start(f, {} as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: 'not_configured', code: 'no_key' });
    expect(await start(f, KEY_ENV, 'has spaces')).toMatchObject({ ok: false, reason: 'refused' });
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    [401, { errorCode: 'unauthorized' }, { ok: false, reason: 'refused', code: 'unauthorized' }],
    [402, {}, { ok: false, reason: 'refused', code: 'http_402' }],
    [422, { errorCode: 'generation_input_video_inaccessible' }, { ok: false, reason: 'refused', code: 'generation_input_video_inaccessible' }],
    [429, { errorCode: 'concurrency_limit_reached' }, { ok: false, reason: 'busy', code: 'concurrency_limit_reached' }],
    [503, {}, { ok: false, reason: 'unavailable', code: 'http_503' }],
    [409, { generationId: 'gen-earlier' }, { ok: true, id: 'gen-earlier' }],
    [200, {}, { ok: false, reason: 'unavailable', code: 'no_id' }],
  ])('HTTP %i → %j', async (status, json, want) => {
    expect(await start(answer(status, json))).toEqual(want);
  });

  it('a network failure is an outage, never a throw', async () => {
    const f = jest.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await start(f)).toEqual({ ok: false, reason: 'unavailable', code: 'network' });
  });
});

describe('readGeneration / pollLipsync', () => {
  it('reads each status into the next step', () => {
    expect(readGeneration({ status: 'PENDING' })).toEqual({ state: 'pending' });
    expect(readGeneration({ status: 'PROCESSING' })).toEqual({ state: 'pending' });
    expect(readGeneration({ status: 'COMPLETED', outputUrl: 'https://cdn/out.mp4', outputDuration: 3.29 })).toEqual({ state: 'done', url: 'https://cdn/out.mp4', seconds: 3.29 });
    expect(readGeneration({ status: 'COMPLETED', outputUrl: 'https://cdn/out.mp4' })).toEqual({ state: 'done', url: 'https://cdn/out.mp4', seconds: null });
    expect(readGeneration({ status: 'COMPLETED', outputUrl: 'http://cdn/out.mp4' })).toEqual({ state: 'failed', code: 'no_output' });
    expect(readGeneration({ status: 'FAILED', errorCode: 'face_not_detected' })).toEqual({ state: 'failed', code: 'face_not_detected' });
    expect(readGeneration({ status: 'REJECTED' })).toEqual({ state: 'failed', code: 'rejected' });
    expect(readGeneration({})).toEqual({ state: 'pending' });
  });

  it('GETs /v2/generate/{id} with the key; gone or unauthorised fails, anything else waits', async () => {
    const f = answer(200, { status: 'COMPLETED', outputUrl: 'https://cdn/out.mp4', outputDuration: 3 });
    expect(await pollLipsync('gen 1', { env: KEY_ENV, fetchImpl: f })).toEqual({ state: 'done', url: 'https://cdn/out.mp4', seconds: 3 });
    const [url, init] = (f as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SYNC_GENERATE_URL}/gen%201`);
    expect(init.headers).toEqual({ 'x-api-key': 'test-key' });
    expect(await pollLipsync('g', { env: KEY_ENV, fetchImpl: answer(404, {}) })).toEqual({ state: 'failed', code: 'not_found' });
    expect(await pollLipsync('g', { env: KEY_ENV, fetchImpl: answer(401, {}) })).toEqual({ state: 'failed', code: 'unauthorized' });
    expect(await pollLipsync('g', { env: KEY_ENV, fetchImpl: answer(502, {}) })).toEqual({ state: 'pending' });
    const down = jest.fn(async () => { throw new Error('reset'); }) as unknown as typeof fetch;
    expect(await pollLipsync('g', { env: KEY_ENV, fetchImpl: down })).toEqual({ state: 'pending' });
    expect(await pollLipsync('g', { env: {} as NodeJS.ProcessEnv, fetchImpl: f })).toEqual({ state: 'failed', code: 'no_key' });
  });
});

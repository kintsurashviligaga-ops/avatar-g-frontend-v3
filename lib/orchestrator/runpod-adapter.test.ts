/**
 * RunPod adapter tests — config read, request shape, response parse, and
 * retry/backoff behaviour with a stubbed fetch.
 */
import {
  readRunPodConfig,
  buildRunPodRequest,
  parseRunPodResponse,
  dispatchRunPod,
  type RunPodManifest,
} from './runpod-adapter';

const manifest: RunPodManifest = {
  segments: [{ url: 'gs://b/1.mp4', durationSec: 6, cameraMotion: null, render: { fps: 60 } }],
  voiceoverUrl: null, musicUrl: null, globalRender: { fps: 60 }, pipelineId: 'p1',
};

describe('runpod-adapter', () => {
  test('readRunPodConfig requires url + a token', () => {
    expect(readRunPodConfig({})).toBeNull();
    expect(readRunPodConfig({ RUNPOD_RENDER_WEBHOOK_URL: 'u' })).toBeNull();
    expect(readRunPodConfig({ RUNPOD_RENDER_WEBHOOK_URL: 'u', RUNPOD_RENDER_WEBHOOK_TOKEN: 't' }))
      .toEqual({ webhookUrl: 'u', token: 't' });
    expect(readRunPodConfig({ RUNPOD_RENDER_WEBHOOK_URL: 'u', RUNPOD_API_TOKEN: 't2' }))
      .toEqual({ webhookUrl: 'u', token: 't2' });
  });

  test('buildRunPodRequest sets bearer auth + wraps in {input}', () => {
    const { url, init } = buildRunPodRequest({ webhookUrl: 'https://x', token: 'tok' }, manifest);
    expect(url).toBe('https://x');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toEqual({ input: manifest });
  });

  test('parseRunPodResponse reads output.url or url, else throws', () => {
    expect(parseRunPodResponse({ output: { url: 'a' } })).toBe('a');
    expect(parseRunPodResponse({ url: 'b' })).toBe('b');
    expect(() => parseRunPodResponse({})).toThrow(/no url/);
  });

  test('dispatch returns url on first 200', async () => {
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => ({ output: { url: 'done' } }) })) as unknown as typeof fetch;
    const res = await dispatchRunPod({ webhookUrl: 'u', token: 't' }, manifest, { fetchImpl });
    expect(res.url).toBe('done');
  });

  test('dispatch fails fast on 4xx (no retry)', async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return { ok: false, status: 400, json: async () => ({}) }; }) as unknown as typeof fetch;
    await expect(dispatchRunPod({ webhookUrl: 'u', token: 't' }, manifest, { fetchImpl })).rejects.toThrow(/400/);
    expect(calls).toBe(1);
  });

  test('dispatch retries on 5xx then succeeds', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls < 2) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ url: 'ok' }) };
    }) as unknown as typeof fetch;
    const res = await dispatchRunPod({ webhookUrl: 'u', token: 't' }, manifest, { fetchImpl });
    expect(res.url).toBe('ok');
    expect(calls).toBe(2);
  });
});

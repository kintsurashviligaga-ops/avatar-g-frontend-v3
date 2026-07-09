/** @jest-environment node */
import {
  submitVideoWithFallback, pollVideoProvider, klingJwt, shouldUseNativeCascade,
  VIDEO_PROVIDER_CASCADE, VideoCascadeError, type FetchLike, type VideoGenInput,
} from './videoProviderCascade';

const ALL_KEYS: NodeJS.ProcessEnv = {
  KLING_ACCESS_KEY: 'ak-test', KLING_SECRET_KEY: 'sk-test',
  LUMA_API_KEY: 'luma-test',
  LTX_VIDEO_API_KEY: 'ltx-test',
  REPLICATE_API_TOKEN: 'r8-test',
};

interface Route { match: string; throw?: string; ok?: boolean; status?: number; json?: unknown }
function mockFetch(routes: Route[]): FetchLike {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    for (const r of routes) {
      if (u.includes(r.match)) {
        if (r.throw) throw new Error(r.throw);
        return {
          ok: r.ok ?? true, status: r.status ?? 200,
          text: async () => '', json: async () => r.json ?? {},
        } as Response;
      }
    }
    throw new Error(`unmocked fetch: ${u}`);
  }) as unknown as FetchLike;
}

const INPUT: VideoGenInput = { prompt: 'a lion at dawn', imageUrl: 'https://x/frame.png', aspectRatio: '9:16' };

describe('submitVideoWithFallback — ordered cascade', () => {
  it('falls through Kling(drop) → Luma(429) → LTX(500) → Replicate(ok)', async () => {
    const fetchImpl = mockFetch([
      { match: 'klingai.com/v1/videos/image2video', throw: 'ECONNRESET' },   // 1 connection drop
      { match: 'lumalabs.ai/dream-machine/v1/generations', ok: false, status: 429 }, // 2 rate limit
      { match: 'ltx.video/v2/image-to-video', ok: false, status: 500 },      // 3 API error
      { match: 'replicate.com/v1/models', json: { id: 'rep-123' } },          // 4 accepts
    ]);
    const res = await submitVideoWithFallback(INPUT, { env: ALL_KEYS, fetchImpl });
    expect(res.provider).toBe('replicate-kling');
    expect(res.taskId).toBe('rep-123');
    expect(res.attempts.map((a) => `${a.provider}:${a.ok}`)).toEqual([
      'kling-native:false', 'luma:false', 'ltx:false', 'replicate-kling:true',
    ]);
  });

  it('stops at the FIRST provider that accepts (Kling succeeds → Luma/LTX/Replicate never called)', async () => {
    const fetchImpl = mockFetch([
      { match: 'klingai.com/v1/videos/image2video', json: { data: { task_id: 'kl-9' } } },
      { match: 'lumalabs.ai', throw: 'should-not-be-called' },
    ]);
    const res = await submitVideoWithFallback(INPUT, { env: ALL_KEYS, fetchImpl });
    expect(res.provider).toBe('kling-native');
    expect(res.taskId).toBe('kl-9');
    expect(res.attempts).toEqual([{ provider: 'kling-native', ok: true }]);
  });

  it('SKIPS unconfigured providers (Replicate-only env → straight to Replicate, no native attempts)', async () => {
    const fetchImpl = mockFetch([{ match: 'replicate.com/v1/models', json: { id: 'rep-only' } }]);
    const res = await submitVideoWithFallback(INPUT, { env: { REPLICATE_API_TOKEN: 'r8' }, fetchImpl });
    expect(res.provider).toBe('replicate-kling');
    expect(res.attempts).toEqual([
      { provider: 'kling-native', ok: false, skipped: true, error: 'not-configured' },
      { provider: 'luma', ok: false, skipped: true, error: 'not-configured' },
      { provider: 'ltx', ok: false, skipped: true, error: 'not-configured' },
      { provider: 'replicate-kling', ok: true },
    ]);
  });

  it('throws VideoCascadeError when every tier fails', async () => {
    const fetchImpl = mockFetch([
      { match: 'klingai.com', throw: 'drop' }, { match: 'lumalabs.ai', ok: false, status: 500 },
      { match: 'ltx.video', ok: false, status: 503 }, { match: 'replicate.com', ok: false, status: 500 },
    ]);
    await expect(submitVideoWithFallback(INPUT, { env: ALL_KEYS, fetchImpl })).rejects.toBeInstanceOf(VideoCascadeError);
  });

  it('LTX text-to-video path when no image (endpoint switches to /v2/text-to-video)', async () => {
    let hit = '';
    const fetchImpl = (async (url: string) => {
      hit = String(url);
      return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'ltx-1' }) } as Response;
    }) as unknown as FetchLike;
    const res = await submitVideoWithFallback({ prompt: 'no image' }, { env: { LTX_VIDEO_API_KEY: 'k' }, fetchImpl });
    expect(res.provider).toBe('ltx');
    expect(hit).toContain('/v2/text-to-video');
    expect(res.taskId).toBe('text-to-video::ltx-1'); // endpoint encoded for the poll
  });
});

describe('pollVideoProvider — per-provider status mapping', () => {
  it('Replicate succeeded → normalized url', async () => {
    const fetchImpl = mockFetch([{ match: 'replicate.com/v1/predictions', json: { status: 'succeeded', output: 'https://cdn/out.mp4' } }]);
    expect(await pollVideoProvider('replicate-kling', 'rep-123', { env: ALL_KEYS, fetchImpl })).toEqual({ status: 'succeeded', url: 'https://cdn/out.mp4' });
  });
  it('Kling succeed → task_result.videos[0].url', async () => {
    const fetchImpl = mockFetch([{ match: 'klingai.com/v1/videos/image2video', json: { data: { task_status: 'succeed', task_result: { videos: [{ url: 'https://k/v.mp4' }] } } } }]);
    expect(await pollVideoProvider('kling-native', 'kl-9', { env: ALL_KEYS, fetchImpl })).toEqual({ status: 'succeeded', url: 'https://k/v.mp4' });
  });
  it('Luma completed → assets.video; failed → failed', async () => {
    const ok = mockFetch([{ match: 'lumalabs.ai', json: { state: 'completed', assets: { video: 'https://l/v.mp4' } } }]);
    expect(await pollVideoProvider('luma', 'lm-1', { env: ALL_KEYS, fetchImpl: ok })).toEqual({ status: 'succeeded', url: 'https://l/v.mp4' });
    const bad = mockFetch([{ match: 'lumalabs.ai', json: { state: 'failed', failure_reason: 'nsfw' } }]);
    expect(await pollVideoProvider('luma', 'lm-1', { env: ALL_KEYS, fetchImpl: bad })).toMatchObject({ status: 'failed' });
  });
  it('LTX completed → result.video_url (endpoint parsed from composite id)', async () => {
    let hit = '';
    const fetchImpl = (async (url: string) => { hit = String(url); return { ok: true, status: 200, text: async () => '', json: async () => ({ status: 'completed', result: { video_url: 'https://x/l.mp4' } }) } as Response; }) as unknown as FetchLike;
    const r = await pollVideoProvider('ltx', 'image-to-video::ltx-1', { env: { LTX_VIDEO_API_KEY: 'k' }, fetchImpl });
    expect(r).toEqual({ status: 'succeeded', url: 'https://x/l.mp4' });
    expect(hit).toContain('/v2/image-to-video/ltx-1');
  });
  it('a transient non-2xx poll reports processing (keep polling, do not fail)', async () => {
    const fetchImpl = mockFetch([{ match: 'replicate.com/v1/predictions', ok: false, status: 502 }]);
    expect(await pollVideoProvider('replicate-kling', 'x', { env: ALL_KEYS, fetchImpl })).toEqual({ status: 'processing', url: null });
  });
  it('unknown provider name → failed', async () => {
    expect(await pollVideoProvider('nope', 'x', { env: ALL_KEYS })).toMatchObject({ status: 'failed' });
  });
});

describe('config + JWT + gating', () => {
  it('providers read keys ONLY from env (empty env → nothing configured)', () => {
    expect(VIDEO_PROVIDER_CASCADE.map((p) => p.isConfigured({}))).toEqual([false, false, false, false]);
    expect(VIDEO_PROVIDER_CASCADE.map((p) => p.name)).toEqual(['kling-native', 'luma', 'ltx', 'replicate-kling']);
  });
  it('klingJwt is a well-formed HS256 token with iss/exp/nbf claims', () => {
    const jwt = klingJwt('my-ak', 'my-sk', 1000);
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toEqual({ iss: 'my-ak', exp: 1000 + 1800, nbf: 1000 - 5 });
    // deterministic signature for a fixed key+claims
    expect(klingJwt('my-ak', 'my-sk', 1000)).toBe(jwt);
  });
  it('shouldUseNativeCascade only trips for a NEW provider (Kling-native/Luma), not Replicate/LTX alone', () => {
    expect(shouldUseNativeCascade({ REPLICATE_API_TOKEN: 'r8', LTX_VIDEO_API_KEY: 'k' })).toBe(false);
    expect(shouldUseNativeCascade({ KLING_ACCESS_KEY: 'a', KLING_SECRET_KEY: 'b' })).toBe(true);
    expect(shouldUseNativeCascade({ LUMA_API_KEY: 'l' })).toBe(true);
  });
});

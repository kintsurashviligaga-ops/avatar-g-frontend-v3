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

/**
 * MyAvatar v32 (lib/providers/policy): video is Google-only (Veo). Every tier of this legacy cascade — native Kling, Luma,
 * LTX and Replicate→Kling — is retired: a provisioned key no longer makes a tier "configured", nothing is submitted or
 * polled, and no request leaves the process. The cascade mechanics (skip, record, throw) still report that honestly.
 */
const neverFetch = () => {
  const fetchImpl = jest.fn(async () => { throw new Error('a retired video provider attempted network access'); });
  return { fetchImpl: fetchImpl as unknown as FetchLike, calls: fetchImpl };
};
const ALL_SKIPPED = ['kling-native', 'luma', 'ltx', 'replicate-kling'].map((provider) => ({ provider, ok: false, skipped: true, error: 'not-configured' }));

describe('submitVideoWithFallback — every legacy tier is retired', () => {
  it.each([
    ['every legacy key', ALL_KEYS, INPUT],
    ['a Replicate-only env', { REPLICATE_API_TOKEN: 'r8' }, INPUT],
    ['an LTX-only env, text-to-video (no image)', { LTX_VIDEO_API_KEY: 'k' }, { prompt: 'no image' }],
  ] as const)('%s: no tier is attempted, nothing is sent, and the cascade throws VideoCascadeError', async (_label, env, input) => {
    const { fetchImpl, calls } = neverFetch();
    const err = await submitVideoWithFallback(input, { env: env as NodeJS.ProcessEnv, fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VideoCascadeError);
    expect((err as VideoCascadeError).attempts).toEqual(ALL_SKIPPED);
    expect(calls).not.toHaveBeenCalled();
  });

  it('throws VideoCascadeError when every tier fails', async () => {
    const fetchImpl = mockFetch([
      { match: 'klingai.com', throw: 'drop' }, { match: 'lumalabs.ai', ok: false, status: 500 },
      { match: 'ltx.video', ok: false, status: 503 }, { match: 'replicate.com', ok: false, status: 500 },
    ]);
    await expect(submitVideoWithFallback(INPUT, { env: ALL_KEYS, fetchImpl })).rejects.toBeInstanceOf(VideoCascadeError);
  });

  it('a tier called directly (bypassing isConfigured) refuses before reading a key or fetching', async () => {
    const { fetchImpl, calls } = neverFetch();
    for (const p of VIDEO_PROVIDER_CASCADE) {
      await expect(p.submit(INPUT, ALL_KEYS, fetchImpl)).rejects.toMatchObject({ code: 'provider_deprecated' });
    }
    expect(calls).not.toHaveBeenCalled();
  });
});

describe('pollVideoProvider — a legacy task is never polled', () => {
  it.each([
    ['replicate-kling', 'rep-123'],
    ['kling-native', 'kl-9'],
    ['luma', 'lm-1'],
    ['ltx', 'image-to-video::ltx-1'],
  ])('%s → provider_deprecated, no status request', async (name, taskId) => {
    const { fetchImpl, calls } = neverFetch();
    await expect(pollVideoProvider(name, taskId, { env: ALL_KEYS, fetchImpl })).rejects.toMatchObject({ code: 'provider_deprecated' });
    expect(calls).not.toHaveBeenCalled();
  });
  it('unknown provider name → failed', async () => {
    expect(await pollVideoProvider('nope', 'x', { env: ALL_KEYS })).toMatchObject({ status: 'failed' });
  });
});

describe('config + JWT + gating', () => {
  it('nothing is configured — not with an empty env, not with every legacy key', () => {
    expect(VIDEO_PROVIDER_CASCADE.map((p) => p.isConfigured({}))).toEqual([false, false, false, false]);
    expect(VIDEO_PROVIDER_CASCADE.map((p) => p.isConfigured(ALL_KEYS))).toEqual([false, false, false, false]);
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
  it('shouldUseNativeCascade never trips: a Kling or Luma key cannot route a render off Veo (v32)', () => {
    expect(shouldUseNativeCascade({ REPLICATE_API_TOKEN: 'r8', LTX_VIDEO_API_KEY: 'k' })).toBe(false);
    expect(shouldUseNativeCascade({ KLING_ACCESS_KEY: 'a', KLING_SECRET_KEY: 'b' })).toBe(false);
    expect(shouldUseNativeCascade({ LUMA_API_KEY: 'l' })).toBe(false);
    expect(shouldUseNativeCascade(ALL_KEYS)).toBe(false);
  });
});

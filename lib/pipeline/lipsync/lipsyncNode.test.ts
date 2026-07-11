/** @jest-environment node */
import {
  lipsyncNode, passthroughLipsyncProvider, replicateLipsyncProvider, heygenLipsyncProvider, cascadeLipsyncProvider,
  type LipsyncProvider, type LipsyncProviderResult, type LipsyncRequest,
} from './lipsyncNode';

const req = { clipUrl: 'https://c/clip.mp4', audioUrl: 'https://a/voice.mp3' };
const provider = (r: LipsyncProviderResult | (() => Promise<LipsyncProviderResult>)): LipsyncProvider => ({
  name: 'mock',
  sync: typeof r === 'function' ? r : async () => r,
});

describe('lipsyncNode', () => {
  it('uses the synced clip on a confident success', async () => {
    const res = await lipsyncNode(req, { provider: provider({ ok: true, url: 'https://s/synced.mp4', confidence: 0.9 }) });
    expect(res).toMatchObject({ ok: true, url: 'https://s/synced.mp4', usedFallback: false, confidence: 0.9 });
  });

  it('FALLS BACK to the raw clip when confidence is below the floor (artifacting)', async () => {
    const res = await lipsyncNode(req, { provider: provider({ ok: true, url: 'https://s/warped.mp4', confidence: 0.4 }) });
    expect(res).toMatchObject({ ok: true, url: req.clipUrl, usedFallback: true });
    expect(res.reason).toMatch(/below_floor/);
  });

  it('falls back on provider error, no output, or a thrown exception', async () => {
    expect((await lipsyncNode(req, { provider: provider({ ok: false, error: 'x' }) })).url).toBe(req.clipUrl);
    expect((await lipsyncNode(req, { provider: provider({ ok: true, confidence: 1 }) })).url).toBe(req.clipUrl); // no url
    const thrower = provider(async () => { throw new Error('boom'); });
    expect((await lipsyncNode(req, { provider: thrower })).usedFallback).toBe(true);
  });

  it('respects a custom confidenceFloor', async () => {
    const res = await lipsyncNode(req, { provider: provider({ ok: true, url: 'https://s/x.mp4', confidence: 0.5 }), confidenceFloor: 0.4 });
    expect(res.usedFallback).toBe(false);
  });

  it('treats a missing audio track as "raw is correct" (not a failure)', async () => {
    const res = await lipsyncNode({ clipUrl: req.clipUrl, audioUrl: '' }, { provider: provider({ ok: true, url: 'https://s/x.mp4', confidence: 1 }) });
    expect(res).toMatchObject({ ok: true, url: req.clipUrl, usedFallback: true, confidence: 1 });
  });

  it('returns ok:false only when there is no clip at all', async () => {
    const res = await lipsyncNode({ clipUrl: '', audioUrl: req.audioUrl }, { provider: passthroughLipsyncProvider });
    expect(res.ok).toBe(false);
  });

  it('passthrough provider always yields the raw clip (safe default)', async () => {
    const res = await lipsyncNode(req, { provider: passthroughLipsyncProvider });
    expect(res).toMatchObject({ url: req.clipUrl, usedFallback: true });
  });
});

describe('replicateLipsyncProvider (mock fetch — create + poll)', () => {
  it('parses a terminal prediction returned by Prefer:wait on CREATE', async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ status: 'succeeded', output: 'https://r/out.mp4' }) })) as unknown as typeof fetch;
    const res = await lipsyncNode(req, { provider: replicateLipsyncProvider({ token: 't', fetchImpl }) });
    expect(res).toMatchObject({ ok: true, url: 'https://r/out.mp4', usedFallback: false });
  });

  it('POLLS a non-terminal CREATE to succeeded (the old code skipped this → always failed)', async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n += 1;
      return n === 1
        ? { ok: true, json: async () => ({ status: 'processing', id: 'p1', urls: { get: 'https://api.replicate.com/v1/predictions/p1' } }) }
        : { ok: true, json: async () => ({ status: 'succeeded', output: ['https://r/synced.mp4'] }) };
    }) as unknown as typeof fetch;
    const res = await lipsyncNode(req, { provider: replicateLipsyncProvider({ token: 't', fetchImpl, pollMs: 1 }) });
    expect(res).toMatchObject({ ok: true, url: 'https://r/synced.mp4', usedFallback: false });
    expect(n).toBeGreaterThanOrEqual(2); // proved it actually polled
  });

  it('hits the official-model endpoint with video/audio fields (regression on the broken wiring)', async () => {
    let capturedUrl = '';
    let capturedInput: unknown = null;
    const fetchImpl = (async (url: string, init: { body: string }) => {
      capturedUrl = url; capturedInput = (JSON.parse(init.body) as { input: unknown }).input;
      return { ok: true, json: async () => ({ status: 'succeeded', output: 'https://r/o.mp4' }) };
    }) as unknown as typeof fetch;
    await replicateLipsyncProvider({ token: 't', fetchImpl }).sync(req);
    expect(capturedUrl).toBe('https://api.replicate.com/v1/models/sync/lipsync-2/predictions');
    expect(capturedInput).toEqual({ video: req.clipUrl, audio: req.audioUrl });
  });

  it('falls back on a non-2xx CREATE (e.g. 402 credit block)', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 402, json: async () => ({}) })) as unknown as typeof fetch;
    const res = await lipsyncNode(req, { provider: replicateLipsyncProvider({ token: 't', fetchImpl }) });
    expect(res.usedFallback).toBe(true);
  });
});

describe('heygenLipsyncProvider', () => {
  it('DECLINES a video master (talking_photo is image-only) so the cascade falls through', async () => {
    const r = await heygenLipsyncProvider({ apiKey: 'k' }).sync({ clipUrl: 'https://c/master.mp4', audioUrl: 'https://a/v.mp3' });
    expect(r).toMatchObject({ ok: false, error: 'heygen_requires_image_not_video' });
  });
  it('keys a 402 subscription/credit block explicitly (image input)', async () => {
    const fetchImpl = (async () => ({ status: 402, ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    const r = await heygenLipsyncProvider({ apiKey: 'k', fetchImpl }).sync({ clipUrl: 'https://c/face.jpg', audioUrl: 'https://a/v.mp3' });
    expect(r.error).toMatch(/heygen_credit_block_402/);
  });
});

describe('cascadeLipsyncProvider (VECTOR 4 — HeyGen → Replicate fallback)', () => {
  const ok = (url: string): LipsyncProvider => ({ name: 'ok', sync: async () => ({ ok: true, url, confidence: 0.9 }) });
  const errP = (name: string): LipsyncProvider => ({ name, sync: async () => ({ ok: false, error: 'x' }) });
  const thrower = (name: string): LipsyncProvider => ({ name, sync: async () => { throw new Error('boom'); } });

  it('forwards the EXACT request to the secondary when the primary THROWS', async () => {
    let seen: LipsyncRequest | null = null;
    const secondary: LipsyncProvider = { name: 'replicate', sync: async (r) => { seen = r; return { ok: true, url: 'https://r/s.mp4', confidence: 0.9 }; } };
    const res = await cascadeLipsyncProvider([thrower('heygen'), secondary]).sync(req);
    expect(res).toMatchObject({ ok: true, url: 'https://r/s.mp4' });
    expect(seen).toEqual(req); // the same payload matrix reached the Replicate leg
  });

  it('falls through when the primary returns not-ok (e.g. HeyGen declines a video)', async () => {
    const res = await cascadeLipsyncProvider([errP('heygen'), ok('https://r/s.mp4')]).sync(req);
    expect(res).toMatchObject({ ok: true, url: 'https://r/s.mp4' });
  });

  it('first genuine success wins — the secondary is never called', async () => {
    let calledSecond = false;
    const second: LipsyncProvider = { name: 's', sync: async () => { calledSecond = true; return { ok: false, error: 'x' }; } };
    const res = await cascadeLipsyncProvider([ok('https://r/first.mp4'), second]).sync(req);
    expect(res.url).toBe('https://r/first.mp4');
    expect(calledSecond).toBe(false);
  });

  it('all-fail → aggregated error → lipsyncNode fail-opens to the raw clip', async () => {
    const cascade = cascadeLipsyncProvider([errP('heygen'), thrower('replicate')]);
    expect((await lipsyncNode(req, { provider: cascade })).url).toBe(req.clipUrl);
    expect((await cascade.sync(req)).error).toMatch(/cascade_exhausted/);
  });

  it('empty cascade is a safe no-op (raw clip)', async () => {
    const res = await lipsyncNode(req, { provider: cascadeLipsyncProvider([null, undefined]) });
    expect(res).toMatchObject({ url: req.clipUrl, usedFallback: true });
  });
});

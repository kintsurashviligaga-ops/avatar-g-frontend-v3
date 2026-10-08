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

// MyAvatar v32 (lib/providers/policy): lip-sync is ElevenLabs-only. The Replicate (sync/lipsync-2) and HeyGen
// (talking_photo) adapters are retired: each answers `provider_deprecated` without a request, so lipsyncNode fail-opens
// to the raw clip — a film still ships, unsynced, and nothing is spent on a forbidden provider.
const neverFetch = () => {
  const fetchImpl = jest.fn(async () => { throw new Error('a retired lip-sync provider attempted network access'); });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls: fetchImpl };
};

describe('replicateLipsyncProvider — retired (v32)', () => {
  it('a sync is refused as provider_deprecated without a create or a poll — even with a token', async () => {
    const { fetchImpl, calls } = neverFetch();
    const r = await replicateLipsyncProvider({ token: 't', fetchImpl, pollMs: 1 }).sync(req);
    expect(r).toEqual({ ok: false, error: 'provider_deprecated' });
    expect(calls).not.toHaveBeenCalled();
  });

  it('lipsyncNode fail-opens to the raw clip (never a provider URL)', async () => {
    const { fetchImpl, calls } = neverFetch();
    const res = await lipsyncNode(req, { provider: replicateLipsyncProvider({ token: 't', fetchImpl }) });
    expect(res).toMatchObject({ ok: true, url: req.clipUrl, usedFallback: true });
    expect(calls).not.toHaveBeenCalled();
  });
});

describe('heygenLipsyncProvider — retired (v32)', () => {
  it.each([
    ['a video master', 'https://c/master.mp4'],
    ['an image', 'https://c/face.jpg'],
  ])('%s is refused as provider_deprecated before any request (no talking_photo, no credit probe)', async (_label, clipUrl) => {
    const { fetchImpl, calls } = neverFetch();
    const r = await heygenLipsyncProvider({ apiKey: 'k', fetchImpl }).sync({ clipUrl, audioUrl: 'https://a/v.mp3' });
    expect(r).toEqual({ ok: false, error: 'provider_deprecated' });
    expect(calls).not.toHaveBeenCalled();
  });

  it('a HeyGen → Replicate cascade of retired legs exhausts without a request and ships the raw clip', async () => {
    const { fetchImpl, calls } = neverFetch();
    const cascade = cascadeLipsyncProvider([heygenLipsyncProvider({ apiKey: 'k', fetchImpl }), replicateLipsyncProvider({ token: 't', fetchImpl })]);
    expect((await cascade.sync(req)).error).toMatch(/cascade_exhausted/);
    expect((await lipsyncNode(req, { provider: cascade })).url).toBe(req.clipUrl);
    expect(calls).not.toHaveBeenCalled();
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

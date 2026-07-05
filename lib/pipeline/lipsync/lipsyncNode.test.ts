/** @jest-environment node */
import {
  lipsyncNode, passthroughLipsyncProvider, replicateLipsyncProvider,
  type LipsyncProvider, type LipsyncProviderResult,
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

describe('replicateLipsyncProvider (mock fetch)', () => {
  it('parses a successful prediction output', async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ output: 'https://r/out.mp4', confidence: 0.92 }) })) as unknown as typeof fetch;
    const p = replicateLipsyncProvider({ token: 't', fetchImpl });
    const res = await lipsyncNode(req, { provider: p });
    expect(res).toMatchObject({ ok: true, url: 'https://r/out.mp4', usedFallback: false });
  });

  it('falls back on a non-2xx response', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const res = await lipsyncNode(req, { provider: replicateLipsyncProvider({ token: 't', fetchImpl }) });
    expect(res.usedFallback).toBe(true);
  });
});

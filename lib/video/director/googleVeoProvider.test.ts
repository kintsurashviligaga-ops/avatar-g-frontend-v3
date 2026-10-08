/** @jest-environment node */
/**
 * googleVeoProvider.ts over a scripted fake engine (testing/fakeVeoEngine) — no network, no spend. Rules under test:
 * V1 (the literal provider name), V3 (the prompt reaches the engine byte-for-byte, including Georgian text, emoji,
 * surrounding whitespace and newlines), V4 (shot values override the lock's), the preflight that turns every change
 * the engine would make into a ShotError before any submit, the wire check against lib/veo/payload's real builders,
 * V5's mapping of every engine / poll failure to one of the eight reasons, veoRawResponse bounds, and cancellation.
 */
import type { VeoCreateOutcome, VeoPollOutcome } from '@/lib/veo/types';
import { GoogleVeoProvider, ShotCancelledError, veoWireFields } from './googleVeoProvider';
import { createFakeVeoEngine, type FakeClipScript, type FakeVeoEngineOptions } from './testing/fakeVeoEngine';
import { HERO_REF, makeShot, VILLAIN_REF } from './testing/fixtures';
import type { ConsistencyLock, Shot, ShotGenerationResult } from './types';

const LOCK: ConsistencyLock = { aspectRatio: '16:9', enforceAcrossShots: true };

function setup(opts: FakeVeoEngineOptions = {}) {
  const engine = createFakeVeoEngine(opts);
  const provider = new GoogleVeoProvider({ engine, pollIntervalMs: 5_000, maxWaitMs: 30_000 });
  const run = (shot: Shot, lock: ConsistencyLock = LOCK, cancellation?: { aborted: boolean }) =>
    provider.generateShot({ storyboardId: 'sb-1', shot, consistencyLock: lock }, cancellation);
  return { engine, provider, run };
}

function errorOf(result: ShotGenerationResult) {
  if (result.ok) throw new Error('expected a ShotError');
  return result.error;
}

const once = (script: FakeClipScript) => (i: number) => (i === 0 ? script : undefined);

describe('V1 — Google engine only', () => {
  it('names itself with the literal "google_veo"', () => {
    const { provider } = setup();
    expect(provider.providerName).toBe('google_veo');
  });
});

describe('V3 — the prompt reaches the engine byte-for-byte', () => {
  const PROMPTS: Array<[string, string]> = [
    ['Georgian', 'მთების ფონზე ახალგაზრდა ქალი ნელა მიდის, კამერა ნელა მისდევს უკნიდან.'],
    ['surrounding whitespace and newlines', '  \n\tA fox runs through snow at dawn.\n\n  '],
    ['CRLF and inner runs of spaces', 'Line one,\r\nline   two;\r\n\r\nline three'],
    ['emoji, ZWJ sequences and combining marks', 'A 👩🏽‍🚀 waves; café vs café; arrows → ⇄; quotes “ ” ‘ ’'],
    ['mixed scripts', 'Tbilisi at night — თბილისი ღამით — Тбилиси ночью — 第比利斯'],
    ['Veo-style dialogue and SFX', 'She says: "We leave at dawn." SFX: distant thunder. Ambience: rain on tin.'],
  ];

  it.each(PROMPTS)('%s', async (_label, prompt) => {
    const { engine, run } = setup();
    const negativePrompt = '  blurry footage,\n extra limbs ';
    const result = await run(makeShot({ id: 'a', order: 1, prompt, negativePrompt }));
    expect(result.ok).toBe(true);
    expect(engine.calls).toHaveLength(1);
    const sent = engine.calls[0]!.request;
    expect(sent.prompt).toBe(prompt);
    expect(Buffer.from(sent.prompt, 'utf8').equals(Buffer.from(prompt, 'utf8'))).toBe(true);
    expect(sent.negativePrompt).toBe(negativePrompt);
    // Google-side rewriting stays off.
    expect(sent.enhancePrompt).toBe(false);
  });

  it('adds nothing to the request: no framing hint, no resolution, no camera control, no extra media', async () => {
    const { engine, run } = setup();
    await run(makeShot({ id: 'a', order: 1, cameraMotion: 'slow push in', notes: 'make it moody' }));
    expect(Object.keys(engine.calls[0]!.request).sort()).toEqual(['aspect', 'durationSec', 'enhancePrompt', 'prompt', 'tier']);
  });
});

describe('the live wire (lib/veo/payload builders)', () => {
  it('passes a Georgian prompt through unchanged on both transports', () => {
    const prompt = 'ქალაქის ქუჩა წვიმაში, ნეონის შუქი.';
    for (const transport of ['vertex', 'gemini'] as const) {
      const wire = veoWireFields({ prompt, aspect: '16:9', durationSec: 8, resolution: '1080p', tier: 'fast', generateAudio: true, seed: 42, enhancePrompt: false }, transport);
      expect(wire.prompt).toBe(prompt);
      expect(wire.seed).toBe(42);
      expect(wire.enhancePrompt).toBe(false);
    }
  });

  it('reports that the engine trims the prompt (known engine behaviour)', () => {
    const wire = veoWireFields({ prompt: '  a fox \n', aspect: '16:9', durationSec: 8, resolution: '1080p', tier: 'fast', generateAudio: true }, 'gemini');
    expect(wire.prompt).toBe('a fox');
  });

  it('refuses — before any submit — a prompt the live transport would trim, instead of sending it changed', async () => {
    const { engine, run } = setup({ wire: 'live' });
    const result = await run(makeShot({ id: 'a', order: 1, prompt: ' A fox runs through snow.\n' }));
    const error = errorOf(result);
    expect(error.reason).toBe('unknown');
    expect(error.retryable).toBe(false);
    expect(error.message).toMatch(/whitespace/);
    expect(engine.calls).toHaveLength(0);
  });

  it('lets an untrimmed-safe prompt through the live wire, seed and reference included', async () => {
    const { engine, run } = setup({ wire: 'live', transport: 'vertex' });
    const result = await run(makeShot({ id: 'a', order: 1, prompt: 'ბავშვი კაიტს უშვებს.' }), { ...LOCK, seed: 99, characterReference: HERO_REF });
    expect(result.ok).toBe(true);
    expect(engine.calls[0]!.request.seed).toBe(99);
  });
});

describe('V4 — the shot overrides the consistency lock', () => {
  it('uses the lock\'s seed and character reference when the shot sets none', async () => {
    const { engine, run } = setup();
    const result = await run(makeShot({ id: 'a', order: 1 }), { ...LOCK, seed: 42, characterReference: HERO_REF });
    expect(engine.calls[0]!.request.seed).toBe(42);
    expect(engine.calls[0]!.request.referenceImages).toEqual([{ kind: 'url', url: HERO_REF }]);
    expect(result.ok && result.metadata).toMatchObject({ seed: 42, seedSource: 'consistency_lock', referenceImageSource: 'consistency_lock' });
  });

  it('uses the shot\'s own seed (even 0) and reference over the lock\'s', async () => {
    const { engine, run } = setup();
    const result = await run(makeShot({ id: 'a', order: 1, seed: 0, referenceImage: VILLAIN_REF }), { ...LOCK, seed: 42, characterReference: HERO_REF });
    expect(engine.calls[0]!.request.seed).toBe(0);
    expect(engine.calls[0]!.request.referenceImages).toEqual([{ kind: 'url', url: VILLAIN_REF }]);
    expect(result.ok && result.metadata).toMatchObject({ seed: 0, seedSource: 'shot', referenceImageSource: 'shot' });
  });

  it('maps duration / aspect / quality / order to the engine fields', async () => {
    const { engine, provider } = setup();
    const shot = makeShot({ id: 'z', order: 4, durationSeconds: 6, aspectRatio: '9:16', quality: 'lite' });
    const result = await provider.generateShot({ storyboardId: 'sb-9', shot, consistencyLock: { ...LOCK, aspectRatio: '9:16' }, params: { userId: 'user-7' } });
    expect(engine.calls[0]).toMatchObject({ request: { durationSec: 6, aspect: '9:16', tier: 'lite' }, tier: 'lite', ordinal: 4, sessionId: 'director-sb-9' });
    expect(engine.userIds).toEqual(['user-7']);
    expect(result.ok && result.metadata).toMatchObject({ providerName: 'google_veo', durationSeconds: 6, aspectRatio: '9:16', quality: 'lite', resolution: '720p' });
  });
});

describe('preflight — what Veo would change is a ShotError, never a silent adjustment (V6)', () => {
  it.each<[string, Shot, ConsistencyLock, string]>([
    ['a 5 s shot (would be snapped to 6 s)', makeShot({ id: 'a', order: 1, durationSeconds: 5 }), LOCK, 'invalid_duration'],
    ['a 12 s shot', makeShot({ id: 'a', order: 1, durationSeconds: 12 }), LOCK, 'invalid_duration'],
    ['a 1:1 shot (would be rendered 16:9)', makeShot({ id: 'a', order: 1, aspectRatio: '1:1' }), { ...LOCK, aspectRatio: '1:1' }, 'invalid_dimension'],
    ['a shot off the locked frame', makeShot({ id: 'a', order: 1, aspectRatio: '9:16' }), LOCK, 'invalid_dimension'],
    ['a reference on a 6 s shot (would be stretched to 8 s)', makeShot({ id: 'a', order: 1, durationSeconds: 6 }), { ...LOCK, characterReference: HERO_REF }, 'invalid_duration'],
    ['a reference on lite (would be dropped)', makeShot({ id: 'a', order: 1, quality: 'lite', referenceImage: HERO_REF }), LOCK, 'reference_image_issue'],
    ['an http:// reference', makeShot({ id: 'a', order: 1, referenceImage: 'http://cdn.example.com/a.png' }), LOCK, 'reference_image_issue'],
    ['a fractional seed (would be coerced)', makeShot({ id: 'a', order: 1, seed: 1.5 }), LOCK, 'seed_conflict'],
    ['a negative lock seed', makeShot({ id: 'a', order: 1 }), { ...LOCK, seed: -3 }, 'seed_conflict'],
    ['an unknown tier', makeShot({ id: 'a', order: 1, quality: 'ultra' }), LOCK, 'unknown'],
  ])('%s', async (_label, shot, lock, reason) => {
    const { engine, run } = setup();
    const error = errorOf(await run(shot, lock));
    expect(error).toMatchObject({ shotId: 'a', reason, retryable: false });
    expect(engine.calls).toHaveLength(0);
  });

  it('refuses when no Veo transport is configured', async () => {
    const { engine, run } = setup({ transport: null });
    expect(errorOf(await run(makeShot({ id: 'a', order: 1 })))).toMatchObject({ reason: 'unknown', retryable: false });
    expect(engine.calls).toHaveLength(0);
  });

  it('refuses a transport that would not send the seed as set', async () => {
    const engine = createFakeVeoEngine();
    const provider = new GoogleVeoProvider({ engine: { ...engine, wire: (r) => ({ prompt: r.prompt, referenceImageCount: 0, enhancePrompt: false }) } });
    const result = await provider.generateShot({ storyboardId: 'sb-1', shot: makeShot({ id: 'a', order: 1, seed: 5 }), consistencyLock: LOCK });
    expect(errorOf(result).reason).toBe('seed_conflict');
    expect(engine.calls).toHaveLength(0);
  });
});

describe('V5 — engine failures map to the eight reasons', () => {
  const submit = (o: Omit<Extract<VeoCreateOutcome, { ok: false }>, 'ok'>): FakeClipScript => ({ submit: { ok: false, ...o } });

  it.each<[string, FakeClipScript, string, boolean]>([
    ['a safety refusal', submit({ reason: 'safety', retryable: false, status: 400, detail: 'HTTP 400: violates usage guidelines' }), 'prompt_safety', false],
    ['a 429', submit({ reason: 'rate_limited', retryable: true, status: 429 }), 'rate_limit', true],
    ['an exhausted quota / budget', submit({ reason: 'quota', retryable: false, status: 402 }), 'rate_limit', false],
    ['a 503', submit({ reason: 'unavailable', retryable: true, status: 503 }), 'veo_internal', true],
    ['a reference image host timeout', submit({ reason: 'unavailable', retryable: true, detail: 'referenceImages: image download timed out after 15 s' }), 'reference_image_issue', true],
    ['an ambiguous submit (never re-POSTed)', submit({ reason: 'ambiguous', retryable: false, detail: 'no answer within 30 s — the job may exist' }), 'veo_internal', false],
    ['a 400 about the duration', submit({ reason: 'invalid_request', retryable: false, detail: 'durationSec: durationSeconds must be 4, 6 or 8' }), 'invalid_duration', false],
    ['a 400 about the seed', submit({ reason: 'invalid_request', retryable: false, detail: 'seed: seed must be a uint32' }), 'seed_conflict', false],
    ['a 400 about the aspect ratio', submit({ reason: 'invalid_request', retryable: false, detail: 'HTTP 400: aspectRatio not supported' }), 'invalid_dimension', false],
    ['a reference image that cannot be read', submit({ reason: 'invalid_request', retryable: false, detail: 'referenceImages: image download failed: HTTP 404' }), 'reference_image_issue', false],
    ['an unexplained 400', submit({ reason: 'invalid_request', retryable: false, detail: 'HTTP 400: Request contains an invalid argument.' }), 'unknown', false],
    ['refused credentials', submit({ reason: 'auth', retryable: false, status: 403 }), 'unknown', false],
    ['no transport configured', submit({ reason: 'not_configured', retryable: false }), 'unknown', false],
    ['a filtered render', { polls: [{ state: 'processing' }, { state: 'filtered', reason: 'Blocked by Responsible-AI filters', supportCodes: ['29310472'] }] }, 'prompt_safety', false],
    ['a filtered input image', { polls: [{ state: 'filtered', reason: 'The input image contains a prominent person', supportCodes: [] }] }, 'reference_image_issue', false],
    ['a render out of capacity', { polls: [{ state: 'failed', reason: 'RESOURCE_EXHAUSTED', code: 8 }] }, 'rate_limit', true],
    ['a render rejected for its duration', { polls: [{ state: 'failed', reason: 'Invalid duration for this model', code: 3 }] }, 'invalid_duration', false],
    ['an internal render failure', { polls: [{ state: 'failed', reason: 'Internal error', code: 13 }] }, 'veo_internal', true],
    ['a render that returns no video', { polls: [{ state: 'succeeded', videos: [] }] }, 'veo_internal', true],
    ['a render that never finishes', { polls: [{ state: 'processing' }] }, 'veo_internal', true],
    ['a clip that cannot be delivered', { deliver: null }, 'unknown', true],
  ])('%s', async (_label, script, reason, retryable) => {
    const { run } = setup({ script: once(script) });
    const error = errorOf(await run(makeShot({ id: 'shot-x', order: 1 })));
    expect(error).toMatchObject({ shotId: 'shot-x', reason, retryable });
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('keeps veoRawResponse short, on one line and URL-free', async () => {
    const detail = `HTTP 400: ${'bad request '.repeat(200)} see https://storage.googleapis.com/b/o?X-Goog-Signature=SECRET\nmore`;
    const { run } = setup({ script: once({ submit: { ok: false, reason: 'invalid_request', retryable: false, detail: `https://x.example/a?sig=1 ${detail}` } }) });
    const raw = errorOf(await run(makeShot({ id: 'a', order: 1 }))).veoRawResponse ?? '';
    expect(raw.length).toBeLessThanOrEqual(301);
    expect(raw).not.toMatch(/https?:\/\//);
    expect(raw).not.toMatch(/SECRET|\n/);
    expect(raw).toContain('[url]');
  });

  it('submits exactly once and polls until done; a poll that throws is a transient miss', async () => {
    const polls: Array<VeoPollOutcome | Error> = [{ state: 'processing' }, new Error('socket hang up'), { state: 'succeeded', videos: [{ kind: 'gcs', gcsUri: 'gs://b/o.mp4', mimeType: 'video/mp4' }] }];
    const { engine, run } = setup({ script: once({ polls }) });
    const result = await run(makeShot({ id: 'a', order: 1 }));
    expect(result).toMatchObject({ ok: true, clipUrl: 'https://storage.example.com/renders/clip-0.mp4' });
    expect(engine.calls).toHaveLength(1);
    expect(engine.polled).toHaveLength(3);
    expect(engine.sleeps).toEqual([5_000, 5_000, 5_000]);
  });

  it('gives up waiting after the poll budget (30 s / 5 s = 6 polls), without re-submitting', async () => {
    const { engine, run } = setup({ script: once({ polls: [{ state: 'processing' }] }) });
    await run(makeShot({ id: 'a', order: 1 }));
    expect(engine.polled).toHaveLength(6);
    expect(engine.calls).toHaveLength(1);
  });

  it('turns an engine that throws into a non-retryable unknown (it may have submitted)', async () => {
    const { run } = setup({ createThrows: () => new Error('boom') });
    expect(errorOf(await run(makeShot({ id: 'a', order: 1 })))).toMatchObject({ reason: 'unknown', retryable: false, veoRawResponse: 'boom' });
  });

  it('discards a clip the engine changed after the submit instead of returning it as the frozen shot', async () => {
    const engine = createFakeVeoEngine();
    const changed = {
      ...engine,
      createClip: async (...args: Parameters<typeof engine.createClip>) => {
        const result = await engine.createClip(...args);
        return { ...result, adjustments: [{ field: 'durationSec' as const, from: 8, to: 6, reason: 'snapped' }] };
      },
    };
    const provider = new GoogleVeoProvider({ engine: changed });
    const result = await provider.generateShot({ storyboardId: 'sb-1', shot: makeShot({ id: 'a', order: 1 }), consistencyLock: LOCK });
    expect(errorOf(result)).toMatchObject({ reason: 'invalid_duration' });
    expect(engine.polled).toHaveLength(0);
  });
});

describe('cancellation', () => {
  it('submits nothing once cancelled', async () => {
    const { engine, run } = setup();
    await expect(run(makeShot({ id: 'a', order: 1 }), LOCK, { aborted: true })).rejects.toBeInstanceOf(ShotCancelledError);
    expect(engine.calls).toHaveLength(0);
  });

  it('stops waiting on an in-flight clip (an AbortSignal works as the token)', async () => {
    const controller = new AbortController();
    const { engine, run } = setup({ onCreate: () => controller.abort(), script: once({ polls: [{ state: 'processing' }] }) });
    await expect(run(makeShot({ id: 'a', order: 1 }), LOCK, controller.signal)).rejects.toBeInstanceOf(ShotCancelledError);
    expect(engine.calls).toHaveLength(1);
    expect(engine.polled).toHaveLength(0);
  });
});

/** @jest-environment node */
import {
  DEFAULT_MODEL_IDS,
  DEFAULT_TIER,
  VEO_MODELS,
  capsFor,
  costPerSecondUsd,
  estimateClipCostUsd,
  framingHintFor,
  inferTier,
  nativeAspectFor,
  normalizeClipRequest,
  resolutionFor,
  resolveModel,
  type VeoClipInput,
} from './capabilities';
import type { VeoMedia, VeoTier, VeoTransport } from './types';

const V_STD = 'veo-3.1-generate-001';
const V_FAST = 'veo-3.1-fast-generate-001';
const V_LITE = 'veo-3.1-lite-generate-001';
const G_STD = 'veo-3.1-generate-preview';
const G_FAST = 'veo-3.1-fast-generate-preview';
const G_LITE = 'veo-3.1-lite-generate-preview';

const IMG: VeoMedia = { kind: 'gcs', uri: 'gs://bucket/inputs/s/a.png', mimeType: 'image/png' };
const IMG2: VeoMedia = { kind: 'bytes', base64: 'QUJD', mimeType: 'image/jpeg' };
const refs = (n: number): VeoMedia[] =>
  Array.from({ length: n }, (_, i) => ({ kind: 'gcs', uri: `gs://bucket/r${i}.png`, mimeType: 'image/png' }));

const base = (over: Partial<VeoClipInput> = {}): VeoClipInput => ({ prompt: 'A lighthouse at dusk', aspect: '16:9', ...over });

const ENV_KEYS = ['VEO_MODEL_STANDARD', 'VEO_MODEL_FAST', 'VEO_MODEL_LITE', 'GEMINI_VEO_MODEL'] as const;
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('VEO_MODELS — the §1 table', () => {
  it('catalogues exactly the six documented ids, each under its own id', () => {
    expect(Object.keys(VEO_MODELS).sort()).toEqual([G_FAST, G_LITE, G_STD, V_FAST, V_LITE, V_STD].sort());
    for (const [id, caps] of Object.entries(VEO_MODELS)) expect(caps.id).toBe(id);
  });

  it('maps every id to its tier and transport', () => {
    const expected: Array<[string, VeoTier, VeoTransport]> = [
      [V_STD, 'standard', 'vertex'], [V_FAST, 'fast', 'vertex'], [V_LITE, 'lite', 'vertex'],
      [G_STD, 'standard', 'gemini'], [G_FAST, 'fast', 'gemini'], [G_LITE, 'lite', 'gemini'],
    ];
    for (const [id, tier, transport] of expected) {
      expect(VEO_MODELS[id]).toMatchObject({ tier, transport });
    }
  });

  it('marks Vertex standard/fast GA, Vertex Lite and every Gemini id Preview', () => {
    expect(VEO_MODELS[V_STD]?.status).toBe('ga');
    expect(VEO_MODELS[V_FAST]?.status).toBe('ga');
    expect(VEO_MODELS[V_LITE]?.status).toBe('preview');
    for (const id of [G_STD, G_FAST, G_LITE]) expect(VEO_MODELS[id]?.status).toBe('preview');
  });

  it('renders only 16:9 / 9:16 at 4, 6, 8 s on every model', () => {
    for (const caps of Object.values(VEO_MODELS)) {
      expect(caps.aspects).toEqual(['16:9', '9:16']);
      expect(caps.durations).toEqual([4, 6, 8]);
    }
  });

  it('encodes the 8 s rule: 720p at any length, 1080p and 4k only at 8 s', () => {
    for (const caps of Object.values(VEO_MODELS)) {
      expect(caps.resolutions['720p']).toEqual([4, 6, 8]);
      expect(caps.resolutions['1080p']).toEqual([8]);
      if (caps.resolutions['4k']) expect(caps.resolutions['4k']).toEqual([8]);
    }
  });

  it('offers 4k on Standard (both), Fast only on the Gemini API, never on Lite', () => {
    expect(VEO_MODELS[V_STD]?.resolutions['4k']).toBeDefined();
    expect(VEO_MODELS[G_STD]?.resolutions['4k']).toBeDefined();
    expect(VEO_MODELS[G_FAST]?.resolutions['4k']).toBeDefined();
    expect(VEO_MODELS[V_FAST]?.resolutions['4k']).toBeUndefined();
    expect(VEO_MODELS[V_LITE]?.resolutions['4k']).toBeUndefined();
    expect(VEO_MODELS[G_LITE]?.resolutions['4k']).toBeUndefined();
  });

  it('allows ≤3 reference images except on Lite, and a last frame everywhere', () => {
    for (const id of [V_STD, V_FAST, G_STD, G_FAST]) expect(VEO_MODELS[id]?.maxReferenceImages).toBe(3);
    for (const id of [V_LITE, G_LITE]) expect(VEO_MODELS[id]?.maxReferenceImages).toBe(0);
    for (const caps of Object.values(VEO_MODELS)) expect(caps.supportsLastFrame).toBe(true);
  });

  it('has the audio toggle and cameraControl on Vertex only', () => {
    for (const caps of Object.values(VEO_MODELS)) {
      expect(caps.supportsAudioToggle).toBe(caps.transport === 'vertex');
      expect(caps.supportsCameraControl).toBe(caps.transport === 'vertex');
    }
  });

  it('carries the published with-audio rates', () => {
    expect(VEO_MODELS[V_STD]?.pricePerSecondUsd.audio).toEqual({ '720p': 0.4, '1080p': 0.4, '4k': 0.6 });
    expect(VEO_MODELS[G_FAST]?.pricePerSecondUsd.audio).toEqual({ '720p': 0.1, '1080p': 0.12, '4k': 0.3 });
    expect(VEO_MODELS[G_LITE]?.pricePerSecondUsd.audio).toEqual({ '720p': 0.05, '1080p': 0.08 });
  });

  it('carries the Vertex video-only rates, and none on the Gemini API (no toggle there)', () => {
    expect(VEO_MODELS[V_STD]?.pricePerSecondUsd.videoOnly).toEqual({ '720p': 0.2, '1080p': 0.2, '4k': 0.4 });
    expect(VEO_MODELS[V_FAST]?.pricePerSecondUsd.videoOnly).toEqual({ '720p': 0.08, '1080p': 0.1, '4k': 0.25 });
    expect(VEO_MODELS[V_LITE]?.pricePerSecondUsd.videoOnly).toEqual({ '720p': 0.03, '1080p': 0.05 });
    for (const id of [G_STD, G_FAST, G_LITE]) expect(VEO_MODELS[id]?.pricePerSecondUsd.videoOnly).toBeUndefined();
  });

  it('is frozen — a caller cannot mutate the shared catalogue', () => {
    expect(Object.isFrozen(VEO_MODELS)).toBe(true);
    expect(Object.isFrozen(VEO_MODELS[V_STD])).toBe(true);
  });
});

describe('resolveModel', () => {
  it('defaults to the §1 ids per transport and tier', () => {
    expect(resolveModel('vertex', 'standard')).toBe(V_STD);
    expect(resolveModel('vertex', 'fast')).toBe(V_FAST);
    expect(resolveModel('vertex', 'lite')).toBe(V_LITE);
    expect(resolveModel('gemini', 'standard')).toBe(G_STD);
    expect(resolveModel('gemini', 'fast')).toBe(G_FAST);
    expect(resolveModel('gemini', 'lite')).toBe(G_LITE);
  });

  it('uses DEFAULT_TIER = standard when no tier is given', () => {
    expect(DEFAULT_TIER).toBe('standard');
    expect(resolveModel('vertex')).toBe(V_STD);
    expect(resolveModel('gemini')).toBe(G_STD);
  });

  it('falls back to the default tier for a garbage tier at runtime', () => {
    expect(resolveModel('vertex', 'ultra' as VeoTier)).toBe(V_STD);
  });

  it('honours VEO_MODEL_STANDARD / _FAST / _LITE on both transports (trimmed)', () => {
    process.env.VEO_MODEL_STANDARD = ' veo-3.2-generate-001 ';
    process.env.VEO_MODEL_FAST = 'veo-3.2-fast-generate-001';
    process.env.VEO_MODEL_LITE = 'veo-3.2-lite-generate-001';
    expect(resolveModel('vertex', 'standard')).toBe('veo-3.2-generate-001');
    expect(resolveModel('vertex', 'fast')).toBe('veo-3.2-fast-generate-001');
    expect(resolveModel('vertex', 'lite')).toBe('veo-3.2-lite-generate-001');
    expect(resolveModel('gemini', 'fast')).toBe('veo-3.2-fast-generate-001');
    expect(resolveModel('gemini', 'standard')).toBe('veo-3.2-generate-001');
  });

  it('keeps GEMINI_VEO_MODEL working for the Gemini standard tier (backward compatible with lib/ai/geminiVeo)', () => {
    process.env.GEMINI_VEO_MODEL = 'veo-3.1-fast-generate-preview';
    expect(resolveModel('gemini', 'standard')).toBe('veo-3.1-fast-generate-preview');
  });

  it('GEMINI_VEO_MODEL (transport-specific) wins over VEO_MODEL_STANDARD on Gemini; Vertex still gets the generic one', () => {
    process.env.GEMINI_VEO_MODEL = 'veo-3.1-generate-preview';
    process.env.VEO_MODEL_STANDARD = 'veo-3.2-generate-001';
    expect(resolveModel('gemini', 'standard')).toBe('veo-3.1-generate-preview');
    expect(resolveModel('vertex', 'standard')).toBe('veo-3.2-generate-001');
  });

  it('GEMINI_VEO_MODEL never leaks into Vertex or into the other Gemini tiers', () => {
    process.env.GEMINI_VEO_MODEL = 'veo-9-generate-preview';
    expect(resolveModel('vertex', 'standard')).toBe(V_STD);
    expect(resolveModel('gemini', 'fast')).toBe(G_FAST);
    expect(resolveModel('gemini', 'lite')).toBe(G_LITE);
  });

  it('ignores empty or URL-unsafe overrides instead of splicing them into a request path', () => {
    process.env.VEO_MODEL_STANDARD = '   ';
    expect(resolveModel('vertex', 'standard')).toBe(V_STD);
    process.env.VEO_MODEL_STANDARD = 'veo/../../evil';
    expect(resolveModel('vertex', 'standard')).toBe(V_STD);
    process.env.VEO_MODEL_FAST = 'veo fast';
    expect(resolveModel('vertex', 'fast')).toBe(V_FAST);
    process.env.GEMINI_VEO_MODEL = 'models/veo?x=1';
    expect(resolveModel('gemini', 'standard')).toBe(G_STD);
  });
});

describe('inferTier / capsFor', () => {
  it('infers lite before fast, else standard (case-insensitive)', () => {
    expect(inferTier('veo-3.2-lite-generate-001')).toBe('lite');
    expect(inferTier('veo-3.2-fast-generate-001')).toBe('fast');
    expect(inferTier('VEO-4-FAST-preview')).toBe('fast');
    expect(inferTier('veo-3.2-generate-001')).toBe('standard');
    expect(inferTier('')).toBe('standard');
  });

  it('returns the catalogue row for a known id', () => {
    expect(capsFor(V_FAST)).toBe(VEO_MODELS[V_FAST]);
    expect(capsFor(` ${G_STD} `)).toBe(VEO_MODELS[G_STD]);
    expect(capsFor(V_FAST, 'vertex')).toBe(VEO_MODELS[V_FAST]);
  });

  it('gives an unknown id the profile of its inferred tier on the stated transport — never throws', () => {
    const caps = capsFor('veo-3.2-lite-generate-001', 'vertex');
    expect(caps).toMatchObject({
      id: 'veo-3.2-lite-generate-001', tier: 'lite', transport: 'vertex', inferred: true, status: 'preview',
      maxReferenceImages: 0, supportsAudioToggle: true,
    });
    expect(caps.pricePerSecondUsd.videoOnly).toEqual({ '720p': 0.03, '1080p': 0.05 });
    expect(capsFor('veo-3.2-generate-preview', 'gemini')).toMatchObject({ tier: 'standard', transport: 'gemini', supportsAudioToggle: false });
    expect(capsFor('veo-3.2-fast-generate-preview', 'gemini').resolutions['4k']).toEqual([8]);
  });

  it('without a transport, an unknown id gets the conservative profile: audio always on, only shared resolutions', () => {
    const caps = capsFor('veo-3.2-fast-generate-001');
    expect(caps).toMatchObject({ tier: 'fast', inferred: true, supportsAudioToggle: false, supportsCameraControl: false });
    expect(caps.pricePerSecondUsd.videoOnly).toBeUndefined();
    // Gemini Fast has 4k, Vertex Fast does not → not offered when the transport is unknown.
    expect(caps.resolutions['4k']).toBeUndefined();
    expect(caps.resolutions['1080p']).toEqual([8]);
    expect(capsFor('veo-3.2-generate-001').resolutions['4k']).toEqual([8]);
  });

  it('a catalogued id asked for on the other transport gets that transport’s profile', () => {
    const caps = capsFor(V_STD, 'gemini');
    expect(caps).toMatchObject({ id: V_STD, transport: 'gemini', tier: 'standard', supportsAudioToggle: false, inferred: true });
  });

  it('never returns Object.prototype members for prototype-ish ids', () => {
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const caps = capsFor(id);
      expect(caps.tier).toBe('standard');
      expect(caps.inferred).toBe(true);
      expect(caps.durations).toEqual([4, 6, 8]);
    }
  });

  it('does not let an inferred profile mutate the shared catalogue', () => {
    capsFor('veo-9-lite', 'vertex');
    expect(VEO_MODELS[V_LITE]?.id).toBe(V_LITE);
  });
});

describe('nativeAspectFor / framingHintFor', () => {
  it('maps every output format to the native frame it is cropped from', () => {
    expect(nativeAspectFor('9:16')).toBe('9:16');
    expect(nativeAspectFor('16:9')).toBe('16:9');
    expect(nativeAspectFor('4:5')).toBe('9:16');
    expect(nativeAspectFor('1:1')).toBe('16:9');
  });

  it('asks for centred framing with safe margins for the cropped formats only', () => {
    const square = framingHintFor('1:1');
    const portrait = framingHintFor('4:5');
    expect(square).toMatch(/centred/);
    expect(square).toMatch(/square 1:1 crop/);
    expect(square).toMatch(/left and right/);
    expect(portrait).toMatch(/centred/);
    expect(portrait).toMatch(/4:5 crop/);
    expect(portrait).toMatch(/top and bottom/);
    expect(framingHintFor('16:9')).toBeNull();
    expect(framingHintFor('9:16')).toBeNull();
  });
});

describe('resolutionFor — above 720p needs 8 s', () => {
  it('keeps the preferred resolution at 8 s and drops to 720p below', () => {
    expect(resolutionFor(8, '1080p')).toBe('1080p');
    expect(resolutionFor(8, '4k')).toBe('4k');
    expect(resolutionFor(8, '720p')).toBe('720p');
    expect(resolutionFor(6, '1080p')).toBe('720p');
    expect(resolutionFor(4, '4k')).toBe('720p');
  });

  it('defaults the preference to 1080p', () => {
    expect(resolutionFor(8)).toBe('1080p');
    expect(resolutionFor(4)).toBe('720p');
  });
});

describe('normalizeClipRequest', () => {
  it('fills the defaults silently: 8 s, 1080p, audio on, tier from the model', () => {
    const { request, adjustments } = normalizeClipRequest(base(), V_STD);
    expect(request).toEqual({
      prompt: 'A lighthouse at dusk', aspect: '16:9', durationSec: 8, resolution: '1080p', tier: 'standard', generateAudio: true,
    });
    expect(adjustments).toEqual([]);
  });

  it('a short default clip renders 720p without an adjustment (nothing the caller set changed)', () => {
    const { request, adjustments } = normalizeClipRequest(base({ durationSec: 4 }), V_STD);
    expect(request.resolution).toBe('720p');
    expect(adjustments).toEqual([]);
  });

  it('passes a valid request through untouched', () => {
    const input = base({
      aspect: '9:16', durationSec: 8, resolution: '4k', tier: 'standard', seed: 42, generateAudio: false,
      startImage: IMG, lastFrame: IMG2, cameraControl: 'push_in', negativePrompt: 'blur', personGeneration: 'allow_adult', enhancePrompt: false,
    });
    const { request, adjustments } = normalizeClipRequest(input, V_STD);
    expect(adjustments).toEqual([]);
    expect(request).toEqual({ ...input, durationSec: 8 });
  });

  it('rule 1 — the tier comes from the model, with an adjustment when the caller said otherwise', () => {
    const { request, adjustments } = normalizeClipRequest(base({ tier: 'standard' }), G_FAST);
    expect(request.tier).toBe('fast');
    expect(adjustments).toEqual([{ field: 'tier', from: 'standard', to: 'fast', reason: expect.stringContaining('fast tier') }]);
  });

  it('maps a cropped output format to its native aspect with an adjustment', () => {
    const sq = normalizeClipRequest(base({ aspect: '1:1' }), V_STD);
    expect(sq.request.aspect).toBe('16:9');
    expect(sq.adjustments).toEqual([expect.objectContaining({ field: 'aspect', from: '1:1', to: '16:9' })]);
    const p = normalizeClipRequest(base({ aspect: '4:5' }), V_STD);
    expect(p.request.aspect).toBe('9:16');
    const junk = normalizeClipRequest(base({ aspect: '21:9' as VeoClipInput['aspect'] }), V_STD);
    expect(junk.request.aspect).toBe('16:9');
    expect(junk.adjustments[0]).toMatchObject({ field: 'aspect', from: '21:9' });
  });

  describe('rule 2 — duration snapped to 4 / 6 / 8 (ties up)', () => {
    const snap = (d: number) => normalizeClipRequest(base({ durationSec: d, resolution: '720p' }), V_STD);
    it.each([
      [1, 4], [3, 4], [4, 4], [4.9, 4], [5, 6], [5.5, 6], [6, 6], [7, 8], [7.2, 8], [8, 8], [10, 8], [24, 8], [0, 4], [-3, 4],
    ])('%p s → %p s', (from, to) => {
      const { request, adjustments } = snap(from);
      expect(request.durationSec).toBe(to);
      if (from === to) expect(adjustments).toEqual([]);
      else expect(adjustments).toEqual([expect.objectContaining({ field: 'durationSec', from, to })]);
    });

    it('a non-number duration becomes 8 s with an adjustment', () => {
      const { request, adjustments } = normalizeClipRequest(base({ durationSec: Number.NaN }), V_STD);
      expect(request.durationSec).toBe(8);
      expect(adjustments[0]).toMatchObject({ field: 'durationSec', to: 8 });
    });
  });

  describe('rule 3 — reference images', () => {
    it('are dropped on Lite (no asset references there), leaving a first frame usable', () => {
      const { request, adjustments } = normalizeClipRequest(base({ referenceImages: refs(2), startImage: IMG, durationSec: 6 }), V_LITE);
      expect(request.referenceImages).toBeUndefined();
      expect(request.startImage).toBe(IMG);
      expect(request.durationSec).toBe(6);
      expect(adjustments).toEqual([expect.objectContaining({ field: 'referenceImages', from: 2, to: 0 })]);
    });

    it('are capped at 3, keeping the first three in order', () => {
      const five = refs(5);
      const { request, adjustments } = normalizeClipRequest(base({ referenceImages: five }), V_STD);
      expect(request.referenceImages).toEqual(five.slice(0, 3));
      expect(adjustments).toEqual([expect.objectContaining({ field: 'referenceImages', from: 5, to: 3 })]);
    });

    it('force an 8 s clip', () => {
      const { request, adjustments } = normalizeClipRequest(base({ referenceImages: refs(1), durationSec: 4 }), G_STD);
      expect(request.durationSec).toBe(8);
      expect(adjustments).toEqual([expect.objectContaining({ field: 'durationSec', from: 4, to: 8, reason: expect.stringContaining('Reference images') })]);
    });

    it('are exclusive with a first and last frame — both frames are dropped, the references kept', () => {
      const { request, adjustments } = normalizeClipRequest(base({ referenceImages: refs(2), startImage: IMG, lastFrame: IMG2 }), V_FAST);
      expect(request.referenceImages).toHaveLength(2);
      expect(request.startImage).toBeUndefined();
      expect(request.lastFrame).toBeUndefined();
      expect(adjustments.map((a) => a.field)).toEqual(['startImage', 'lastFrame']);
    });

    it('an empty list is the same as none', () => {
      const { request, adjustments } = normalizeClipRequest(base({ referenceImages: [], startImage: IMG }), V_STD);
      expect('referenceImages' in request).toBe(false);
      expect(request.startImage).toBe(IMG);
      expect(adjustments).toEqual([]);
    });

    it('never puts media payloads into an adjustment (they are logged and shown in the UI)', () => {
      const secretBytes: VeoMedia = { kind: 'bytes', base64: 'U0VDUkVUX0JBU0U2NA==', mimeType: 'image/png' };
      const signed: VeoMedia = { kind: 'url', url: 'https://storage.googleapis.com/b/o?X-Goog-Signature=abc' };
      const { adjustments } = normalizeClipRequest(base({ referenceImages: refs(1), startImage: secretBytes, lastFrame: signed }), V_STD);
      const dump = JSON.stringify(adjustments);
      expect(dump).not.toContain('U0VDUkVUX0JBU0U2NA==');
      expect(dump).not.toContain('X-Goog-Signature');
      expect(adjustments.find((a) => a.field === 'startImage')).toMatchObject({ from: 'bytes image', to: null });
    });
  });

  describe('rule 4 — last frame needs a first frame', () => {
    it('drops a lone last frame', () => {
      const { request, adjustments } = normalizeClipRequest(base({ lastFrame: IMG2 }), V_STD);
      expect(request.lastFrame).toBeUndefined();
      expect(adjustments).toEqual([expect.objectContaining({ field: 'lastFrame', to: null, reason: expect.stringContaining('first frame') })]);
    });

    it('keeps first + last together', () => {
      const { request, adjustments } = normalizeClipRequest(base({ startImage: IMG, lastFrame: IMG2 }), G_LITE);
      expect(request.startImage).toBe(IMG);
      expect(request.lastFrame).toBe(IMG2);
      expect(adjustments).toEqual([]);
    });
  });

  describe('rule 5 — resolution', () => {
    it('4k only where supported, else 1080p', () => {
      for (const id of [V_FAST, V_LITE, G_LITE]) {
        const { request, adjustments } = normalizeClipRequest(base({ resolution: '4k' }), id);
        expect(request.resolution).toBe('1080p');
        expect(adjustments).toEqual([expect.objectContaining({ field: 'resolution', from: '4k', to: '1080p' })]);
      }
      for (const id of [V_STD, G_STD, G_FAST]) {
        expect(normalizeClipRequest(base({ resolution: '4k' }), id).request.resolution).toBe('4k');
      }
    });

    it('above 720p requires 8 s — the duration is kept and the resolution becomes 720p', () => {
      const { request, adjustments } = normalizeClipRequest(base({ durationSec: 6, resolution: '1080p' }), V_STD);
      expect(request.durationSec).toBe(6);
      expect(request.resolution).toBe('720p');
      expect(adjustments).toEqual([expect.objectContaining({ field: 'resolution', from: '1080p', to: '720p', reason: expect.stringContaining('8 s') })]);
    });

    it('4k on a short Lite clip steps down twice, each with its own reason', () => {
      const { request, adjustments } = normalizeClipRequest(base({ durationSec: 4, resolution: '4k' }), V_LITE);
      expect(request.resolution).toBe('720p');
      expect(adjustments.map((a) => [a.field, a.from, a.to])).toEqual([
        ['resolution', '4k', '1080p'],
        ['resolution', '1080p', '720p'],
      ]);
    });

    it('checks the rule against the SNAPPED length (5 s → 6 s → 720p)', () => {
      const { request } = normalizeClipRequest(base({ durationSec: 5, resolution: '1080p' }), V_STD);
      expect(request.durationSec).toBe(6);
      expect(request.resolution).toBe('720p');
    });

    it('reference images forcing 8 s let 1080p stand', () => {
      const { request } = normalizeClipRequest(base({ durationSec: 4, resolution: '1080p', referenceImages: refs(1) }), V_STD);
      expect(request.durationSec).toBe(8);
      expect(request.resolution).toBe('1080p');
    });

    it('an unknown resolution string becomes 1080p (then the 8 s rule applies)', () => {
      const { request, adjustments } = normalizeClipRequest(base({ durationSec: 4, resolution: '8k' as VeoClipInput['resolution'] }), V_STD);
      expect(request.resolution).toBe('720p');
      expect(adjustments[0]).toMatchObject({ field: 'resolution', from: '8k', to: '1080p' });
    });
  });

  describe('rule 6 — generateAudio=false only where the toggle exists', () => {
    it('Vertex keeps video-only', () => {
      const { request, adjustments } = normalizeClipRequest(base({ generateAudio: false }), V_STD);
      expect(request.generateAudio).toBe(false);
      expect(adjustments).toEqual([]);
    });

    it('the Gemini API always renders audio', () => {
      const { request, adjustments } = normalizeClipRequest(base({ generateAudio: false }), G_STD);
      expect(request.generateAudio).toBe(true);
      expect(adjustments).toEqual([expect.objectContaining({ field: 'generateAudio', from: false, to: true })]);
    });

    it('an unknown id with no transport stays audio-on (conservative)', () => {
      expect(normalizeClipRequest(base({ generateAudio: false }), 'veo-3.2-generate-001').request.generateAudio).toBe(true);
      expect(normalizeClipRequest(base({ generateAudio: false }), 'veo-3.2-generate-001', 'vertex').request.generateAudio).toBe(false);
    });
  });

  describe('rule 7 — cameraControl only with a first frame (and only on Vertex)', () => {
    it('is kept with a first frame on Vertex', () => {
      const { request, adjustments } = normalizeClipRequest(base({ startImage: IMG, cameraControl: 'pan_left' }), V_STD);
      expect(request.cameraControl).toBe('pan_left');
      expect(adjustments).toEqual([]);
    });

    it('is dropped without a first frame', () => {
      const { request, adjustments } = normalizeClipRequest(base({ cameraControl: 'fixed' }), V_STD);
      expect(request.cameraControl).toBeUndefined();
      expect(adjustments).toEqual([expect.objectContaining({ field: 'cameraControl', from: 'fixed', to: null, reason: expect.stringContaining('first frame') })]);
    });

    it('is dropped when reference images removed the first frame', () => {
      const { request, adjustments } = normalizeClipRequest(base({ startImage: IMG, referenceImages: refs(1), cameraControl: 'push_in' }), V_STD);
      expect(request.cameraControl).toBeUndefined();
      expect(adjustments.map((a) => a.field)).toEqual(['startImage', 'cameraControl']);
    });

    it('is dropped on the Gemini API (no such field there)', () => {
      const { request, adjustments } = normalizeClipRequest(base({ startImage: IMG2, cameraControl: 'tilt_up' }), G_STD);
      expect(request.cameraControl).toBeUndefined();
      expect(adjustments).toEqual([expect.objectContaining({ field: 'cameraControl', reason: expect.stringContaining('Vertex') })]);
    });
  });

  describe('rule 8 — seed coerced to uint32', () => {
    it.each([
      [0, 0], [42, 42], [4294967295, 4294967295],
    ])('keeps a valid seed %p untouched', (seed, want) => {
      const { request, adjustments } = normalizeClipRequest(base({ seed }), V_STD);
      expect(request.seed).toBe(want);
      expect(adjustments).toEqual([]);
    });

    it.each([
      [-1, 4294967295], [4294967296, 0], [4294967297, 1], [12.9, 12], [-0.5, 0],
    ])('coerces %p → %p with an adjustment', (seed, want) => {
      const { request, adjustments } = normalizeClipRequest(base({ seed }), V_STD);
      expect(request.seed).toBe(want);
      expect(adjustments).toEqual([expect.objectContaining({ field: 'seed', from: seed, to: want })]);
    });

    it('drops a non-finite seed', () => {
      for (const seed of [Number.NaN, Number.POSITIVE_INFINITY]) {
        const { request, adjustments } = normalizeClipRequest(base({ seed }), V_STD);
        expect('seed' in request).toBe(false);
        expect(adjustments).toEqual([expect.objectContaining({ field: 'seed', to: null })]);
      }
    });

    it('accepts a numeric string from an untyped caller', () => {
      const { request, adjustments } = normalizeClipRequest(base({ seed: '7' as unknown as number }), V_STD);
      expect(request.seed).toBe(7);
      expect(adjustments[0]).toMatchObject({ field: 'seed', from: '7', to: 7 });
    });
  });

  it('reports adjustments in the contract order', () => {
    const { adjustments } = normalizeClipRequest(
      base({
        tier: 'lite', aspect: '4:5', durationSec: 5, referenceImages: refs(4), startImage: IMG, lastFrame: IMG2,
        resolution: '4k', generateAudio: false, cameraControl: 'push_in', seed: -1,
      }),
      G_FAST,
    );
    expect(adjustments.map((a) => a.field)).toEqual([
      'tier', 'aspect', 'durationSec', 'referenceImages', 'durationSec', 'startImage', 'lastFrame', 'generateAudio', 'cameraControl', 'seed',
    ]);
    // G_FAST renders 4k at 8 s, which the references forced — no resolution change needed.
    for (const a of adjustments) expect(typeof a.reason).toBe('string');
  });

  it('never emits undefined optional keys', () => {
    const { request } = normalizeClipRequest(base({ startImage: undefined, seed: undefined, negativePrompt: undefined }), V_STD);
    for (const v of Object.values(request)) expect(v).not.toBeUndefined();
  });

  it('never throws for an unknown model id', () => {
    expect(() => normalizeClipRequest(base({ referenceImages: refs(2) }), 'veo-3.2-lite-generate-001')).not.toThrow();
    const { request } = normalizeClipRequest(base({ referenceImages: refs(2) }), 'veo-3.2-lite-generate-001');
    expect(request.tier).toBe('lite');
    expect(request.referenceImages).toBeUndefined();
  });
});

describe('pricing', () => {
  it('uses the with-audio rate by default', () => {
    expect(costPerSecondUsd(V_STD, '1080p', true)).toBe(0.4);
    expect(costPerSecondUsd(V_STD, '4k', true)).toBe(0.6);
    expect(costPerSecondUsd(G_FAST, '720p', true)).toBe(0.1);
    expect(costPerSecondUsd(G_FAST, '1080p', true)).toBe(0.12);
    expect(costPerSecondUsd(G_LITE, '1080p', true)).toBe(0.08);
  });

  it('uses the video-only rate on Vertex with audio off', () => {
    expect(costPerSecondUsd(V_STD, '720p', false)).toBe(0.2);
    expect(costPerSecondUsd(V_STD, '4k', false)).toBe(0.4);
    expect(costPerSecondUsd(V_FAST, '1080p', false)).toBe(0.1);
    expect(costPerSecondUsd(V_LITE, '720p', false)).toBe(0.03);
  });

  it('the Gemini API bills audio even when audio=false is asked (it always renders it)', () => {
    expect(costPerSecondUsd(G_STD, '1080p', false)).toBe(0.4);
  });

  it('prices a resolution the tier lacks as what normalisation renders (Lite 4k → 1080p)', () => {
    expect(costPerSecondUsd(V_LITE, '4k', true)).toBe(0.08);
    expect(costPerSecondUsd(V_LITE, '4k', false)).toBe(0.05);
  });

  it('prices an unknown id by its inferred tier', () => {
    expect(costPerSecondUsd('veo-3.2-fast-generate-001', '1080p', true)).toBe(0.12);
    expect(costPerSecondUsd('veo-3.2-fast-generate-001', '1080p', false)).toBe(0.12);
    expect(costPerSecondUsd('veo-3.2-fast-generate-001', '1080p', false, 'vertex')).toBe(0.1);
  });

  it('estimates a whole clip, rounded free of float noise', () => {
    const { request } = normalizeClipRequest(base({ durationSec: 8, resolution: '1080p' }), V_STD);
    expect(estimateClipCostUsd(request, V_STD)).toBe(3.2);
    const short = normalizeClipRequest(base({ durationSec: 6, generateAudio: false }), V_FAST).request;
    expect(short.resolution).toBe('720p');
    expect(estimateClipCostUsd(short, V_FAST)).toBe(0.48);
    const lite = normalizeClipRequest(base({ durationSec: 6 }), G_LITE).request;
    expect(estimateClipCostUsd(lite, G_LITE)).toBe(0.3);
    const fast4k = normalizeClipRequest(base({ resolution: '4k' }), G_FAST).request;
    expect(estimateClipCostUsd(fast4k, G_FAST)).toBe(2.4);
  });

  it('DEFAULT_MODEL_IDS agrees with the catalogue', () => {
    for (const transport of ['vertex', 'gemini'] as const) {
      for (const tier of ['standard', 'fast', 'lite'] as const) {
        expect(VEO_MODELS[DEFAULT_MODEL_IDS[transport][tier]]).toMatchObject({ transport, tier });
      }
    }
  });
});

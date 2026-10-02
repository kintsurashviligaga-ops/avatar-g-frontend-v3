/**
 * The engine table the module rests on. Each cap is READ from (or pinned against) the code that really enforces it,
 * so the panel's "Using 3 of 12 — this engine takes up to 3" can never drift from what the engine accepts.
 */
import { MAX_UPLOAD_BYTES } from '@/components/studio/ui/useUpload';
import { MAX_REFS, klingMotionInput } from '@/lib/providers/higgsfield/models';
import { VEO_MODELS } from '@/lib/veo/capabilities';
import { ENGINES, MOTION_REFERENCE_CAP, SWAP_REFERENCE_CAP, VEO_REFERENCE_CAP, modelLabel, qualityFor } from './engines';
import { MAX_REFERENCES, SOURCE_VIDEO_MAX_BYTES, SOURCE_VIDEO_MAX_SEC, SOURCE_VIDEO_MIN_SEC } from './limits';

test('Veo takes up to 3 asset images — read from the engine\'s own capability table, on both transports', () => {
  expect(VEO_REFERENCE_CAP).toBe(3);
  for (const m of Object.values(VEO_MODELS).filter((c) => c.tier !== 'lite')) expect(m.maxReferenceImages).toBeGreaterThanOrEqual(VEO_REFERENCE_CAP);
  // Lite takes none — which is why this module never offers it.
  expect(Object.values(VEO_MODELS).filter((c) => c.tier === 'lite').every((c) => c.maxReferenceImages === 0)).toBe(true);
});

test('Kling Motion Control takes ONE image — its schema has a single image_url', () => {
  expect(MOTION_REFERENCE_CAP).toBe(1);
  expect(Object.keys(klingMotionInput.shape)).toEqual(expect.arrayContaining(['image_url', 'video_url', 'prompt']));
  expect(Object.keys(klingMotionInput.shape)).not.toContain('image_urls');
});

test('the swap cap is the studio-wide reference policy (MAX_REFS), below the provider\'s own maximum', () => {
  expect(SWAP_REFERENCE_CAP).toBe(MAX_REFS);
  expect(MAX_REFS).toBeLessThanOrEqual(MAX_REFERENCES);
});

test('the dropzone may hold more than any engine takes — that is what the selection rule is for', () => {
  expect(MAX_REFERENCES).toBe(40);
  for (const e of Object.values(ENGINES)) expect(e.maxRefs).toBeLessThan(MAX_REFERENCES);
});

test('the source video is 3–30 s and its size ceiling is the upload hook\'s own (a file the browser allows is never refused as too large)', () => {
  expect([SOURCE_VIDEO_MIN_SEC, SOURCE_VIDEO_MAX_SEC]).toEqual([3, 30]);
  expect(SOURCE_VIDEO_MAX_BYTES).toBe(MAX_UPLOAD_BYTES);
});

test('scene needs no video and is priced locally; motion and swap need one and are provider-quoted', () => {
  expect(ENGINES.scene).toMatchObject({ needsVideo: false, pricing: 'local', fixedSeconds: 8, provider: 'veo' });
  expect(ENGINES.motion).toMatchObject({ needsVideo: true, pricing: 'provider-quote', requiresRole: 'character', provider: 'higgsfield' });
  expect(ENGINES.swap).toMatchObject({ needsVideo: true, pricing: 'provider-quote', provider: 'higgsfield' });
  expect(ENGINES.scene.aspects).toEqual(['16:9', '9:16']);
  expect(ENGINES.motion.aspects).toBeNull();
});

test('qualityFor never upgrades silently: an unoffered tier becomes the default', () => {
  expect(qualityFor('scene', 'standard')).toBe('standard');
  expect(qualityFor('scene', 'pro')).toBe('fast');
  expect(qualityFor('motion', 'pro')).toBe('pro');
  expect(qualityFor('motion', 'fast')).toBe('standard');
  expect(qualityFor('swap', null)).toBe('standard');
});

test('model labels name the real model', () => {
  expect(modelLabel('scene', 'fast', 'en')).toBe('Veo 3.1 Fast');
  expect(modelLabel('scene', 'standard', 'en')).toBe('Veo 3.1');
  expect(modelLabel('motion', 'pro', 'en')).toBe('Kling 3 Motion Control Pro');
  expect(modelLabel('swap', null, 'ru')).toContain('Genjutsu');
});

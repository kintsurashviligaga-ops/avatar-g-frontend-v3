/**
 * The request contract. The two rules the owner set are pinned here: the source video is 3–30 s (and bounded in
 * size) and a request carries at most 40 reference photos — plus the rule that only OUR storage paths cross the wire.
 */
import { MAX_REFERENCES, SOURCE_VIDEO_MAX_BYTES } from './limits';
import { isStoragePath, ownsUploadPath, parseGenjutsuRequest, type IssueCode } from './contract';

const UID = '11111111-2222-4333-8444-555555555555';
const path = (name: string) => `omni-uploads/${UID}/${name}`;
const photo = (i: number, role: 'character' | 'product' | 'wardrobe' = 'character') => ({ ref: path(`p${i}.jpg`), role });
const video = (over: Record<string, unknown> = {}) => ({ path: path('v.mp4'), durationSec: 12, sizeBytes: 9_000_000, ...over });
const codes = (raw: unknown): IssueCode[] => {
  const r = parseGenjutsuRequest(raw);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

test('a preset alone is a complete scene request — nothing typed, no photos', () => {
  const r = parseGenjutsuRequest({ op: 'scene', preset: 'fire' });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toMatchObject({ op: 'scene', preset: 'fire', prompt: '', aspect: '16:9', quality: 'fast', video: null, references: [], referencesTotal: 0 });
});

test('a typed line alone is enough too; neither is not', () => {
  expect(parseGenjutsuRequest({ op: 'scene', prompt: 'a dragon over the sea' }).ok).toBe(true);
  expect(codes({ op: 'scene' })).toContain('preset_or_prompt');
  expect(codes({ op: 'scene', prompt: '   ' })).toContain('preset_or_prompt');
});

test('an unknown preset, op, aspect or quality is refused', () => {
  expect(codes({ op: 'scene', preset: 'not-a-preset' })).toContain('unknown_preset');
  expect(codes({ op: 'teleport', preset: 'fire' })).toEqual(['bad_op']);
  expect(codes({ op: 'scene', preset: 'fire', aspect: '1:1' })).toContain('bad_aspect');
  expect(codes({ op: 'scene', preset: 'fire', quality: 'pro' })).toContain('bad_quality'); // Veo has no "pro" tier
  expect(parseGenjutsuRequest({ op: 'scene', preset: 'fire', quality: 'standard', aspect: '9:16' }).ok).toBe(true);
});

test('unknown fields are refused — a stray key is never silently sent anywhere', () => {
  expect(codes({ op: 'scene', preset: 'fire', userId: 'someone-else' })).toContain('unknown_field');
  expect(codes({ op: 'scene', preset: 'fire', videoUrl: 'https://evil.example/x.mp4' })).toContain('unknown_field');
});

test('the source video is 3–30 s: shorter, longer or unmeasurable is refused', () => {
  const ok = (sec: number) => parseGenjutsuRequest({ op: 'motion', preset: 'fire', video: video({ durationSec: sec }), references: [photo(1)] }).ok;
  expect(ok(3)).toBe(true);
  expect(ok(30)).toBe(true);
  expect(ok(12.4)).toBe(true);
  expect(ok(2.9)).toBe(false);
  expect(ok(30.1)).toBe(false);
  expect(codes({ op: 'motion', preset: 'fire', video: video({ durationSec: 41 }), references: [photo(1)] })).toContain('video_duration');
  expect(codes({ op: 'motion', preset: 'fire', video: video({ durationSec: Number.NaN }), references: [photo(1)] })).toContain('bad_video');
  expect(codes({ op: 'motion', preset: 'fire', video: video({ durationSec: '12' }), references: [photo(1)] })).toContain('bad_video');
});

test('the source video is bounded in size', () => {
  expect(parseGenjutsuRequest({ op: 'swap', preset: 'anime', video: video({ sizeBytes: SOURCE_VIDEO_MAX_BYTES }), references: [photo(1)] }).ok).toBe(true);
  expect(codes({ op: 'swap', preset: 'anime', video: video({ sizeBytes: SOURCE_VIDEO_MAX_BYTES + 1 }), references: [photo(1)] })).toContain('video_size');
  expect(codes({ op: 'swap', preset: 'anime', video: video({ sizeBytes: 0 }), references: [photo(1)] })).toContain('bad_video');
});

test('motion and swap need a video; a scene must not carry one', () => {
  expect(codes({ op: 'motion', preset: 'fire', references: [photo(1)] })).toContain('video_required');
  expect(codes({ op: 'swap', preset: 'fire', references: [photo(1)] })).toContain('video_required');
  expect(codes({ op: 'scene', preset: 'fire', video: video() })).toContain('video_not_allowed');
});

test('up to 40 reference photos; a 41st is refused', () => {
  const forty = Array.from({ length: MAX_REFERENCES }, (_, i) => photo(i));
  const r = parseGenjutsuRequest({ op: 'scene', preset: 'fire', references: forty });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value.references).toHaveLength(40);
  expect(codes({ op: 'scene', preset: 'fire', references: [...forty, photo(41)] })).toContain('too_many_references');
});

test('motion needs a CHARACTER photo to move; swap needs any photo', () => {
  expect(codes({ op: 'motion', preset: 'fire', video: video(), references: [] })).toContain('reference_required');
  expect(codes({ op: 'motion', preset: 'fire', video: video(), references: [photo(1, 'product')] })).toContain('character_required');
  expect(parseGenjutsuRequest({ op: 'motion', preset: 'fire', video: video(), references: [photo(1, 'product'), photo(2, 'character')] }).ok).toBe(true);
  expect(codes({ op: 'swap', preset: 'anime', video: video(), references: [] })).toContain('reference_required');
  expect(parseGenjutsuRequest({ op: 'swap', preset: 'anime', video: video(), references: [photo(1, 'wardrobe')] }).ok).toBe(true);
});

test('only storage PATHS cross the wire — a URL, a data: URI, a traversal or an absolute path is refused', () => {
  for (const bad of ['https://evil.example/a.jpg', 'http://10.0.0.1/a.jpg', 'data:image/png;base64,AAAA', 'file:///etc/passwd', 'gs://bucket/x', '../etc/passwd', 'omni-uploads/../x', '/omni-uploads/x', 'omni-uploads//x', 'a b.jpg', '']) {
    expect(isStoragePath(bad)).toBe(false);
    expect(codes({ op: 'scene', preset: 'fire', references: [{ ref: bad, role: 'character' }] })).toContain('bad_reference');
    expect(codes({ op: 'motion', preset: 'fire', video: video({ path: bad }), references: [photo(1)] })).toContain('bad_video');
  }
  expect(isStoragePath(path('a-b_c.1.jpg'))).toBe(true);
  expect(isStoragePath(42)).toBe(false);
});

test('a role must be one of the three', () => {
  expect(codes({ op: 'scene', preset: 'fire', references: [{ ref: path('a.jpg'), role: 'villain' }] })).toContain('bad_reference');
  expect(codes({ op: 'scene', preset: 'fire', references: 'nope' })).toContain('bad_reference');
});

test('the upload-prefix owner rule: a path is the caller\'s only under their own omni-uploads/<uid>/', () => {
  expect(ownsUploadPath(path('a.jpg'), UID)).toBe(true);
  expect(ownsUploadPath(`omni-uploads/someone-else/a.jpg`, UID)).toBe(false);
  expect(ownsUploadPath(`other-bucket/${UID}/a.jpg`, UID)).toBe(false);
  expect(ownsUploadPath(path('a.jpg'), '')).toBe(false);
});

test('referencesTotal can never be below what was sent, nor above the dropzone cap', () => {
  const r = parseGenjutsuRequest({ op: 'scene', preset: 'fire', references: [photo(1), photo(2)], referencesTotal: 12 });
  expect(r.ok && r.value.referencesTotal).toBe(12);
  const low = parseGenjutsuRequest({ op: 'scene', preset: 'fire', references: [photo(1), photo(2)], referencesTotal: 1 });
  expect(low.ok && low.value.referencesTotal).toBe(2);
  expect(codes({ op: 'scene', preset: 'fire', referencesTotal: 41 })).toContain('invalid_body');
});

test('expectedCredits and confirmedGel must be sane numbers', () => {
  expect(parseGenjutsuRequest({ op: 'scene', preset: 'fire', expectedCredits: 25 }).ok).toBe(true);
  for (const bad of [0, -5, 2.5, '25', Number.POSITIVE_INFINITY]) expect(codes({ op: 'scene', preset: 'fire', expectedCredits: bad })).toContain('bad_expected_credits');
  for (const bad of [0, -1, '2.5', Number.NaN]) expect(codes({ op: 'motion', preset: 'fire', confirmedGel: bad, video: video(), references: [photo(1)] })).toContain('bad_confirmed_gel');
});

test('the typed line is cleaned and bounded; a megabyte of text is refused, not scanned', () => {
  const r = parseGenjutsuRequest({ op: 'scene', preset: 'fire', prompt: 'a\u0000b   c' });
  expect(r.ok && r.value.prompt).toBe('a b c');
  expect(codes({ op: 'scene', preset: 'fire', prompt: 'x'.repeat(5000) })).toContain('bad_prompt');
  const long = parseGenjutsuRequest({ op: 'scene', preset: 'fire', prompt: 'y'.repeat(800) });
  expect(long.ok && long.value.prompt.length).toBe(500);
});

test('anything that is not an object is an invalid body', () => {
  for (const bad of [null, undefined, 'x', 7, [], true]) expect(codes(bad)).toEqual(['invalid_body']);
});

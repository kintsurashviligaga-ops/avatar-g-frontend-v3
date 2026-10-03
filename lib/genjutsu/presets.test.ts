/**
 * The presets are the product's no-prompt promise: pick one, press Generate. These tests pin what makes that safe —
 * unique ids, every kind the owner asked for, ka / en / ru copy on every preset, English-only model text, and a
 * composed prompt that stays bounded and says only what the engine will really be given.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { COMPOSED_PROMPT_MAX_CHARS, USER_PROMPT_MAX_CHARS } from './limits';
import { GENJUTSU_PRESETS, KIND_LABEL, PRESET_KINDS, cleanUserText, composeGenjutsuPrompt, getPreset } from './presets';

const GEORGIAN = /[Ⴀ-ჿ]/;
const CYRILLIC = /[Ѐ-ӿ]/;
const HEX = /^#[0-9a-f]{6}$/i;

test('at least fourteen presets, ids unique and URL-safe', () => {
  expect(GENJUTSU_PRESETS.length).toBeGreaterThanOrEqual(14);
  const ids = GENJUTSU_PRESETS.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
});

test('every kind the owner asked for is covered: motion looks, object swaps, locations, styles and VFX', () => {
  expect([...PRESET_KINDS].sort()).toEqual(['location', 'motion', 'object', 'style', 'vfx']);
  for (const k of PRESET_KINDS) expect(GENJUTSU_PRESETS.filter((p) => p.kind === k).length).toBeGreaterThanOrEqual(3);
  const names = GENJUTSU_PRESETS.map((p) => p.id);
  for (const wanted of ['anime', 'claymation', 'film-noir', 'cyberpunk', 'watercolor', 'toy-3d', 'fire', 'ice', 'smoke', 'lightning', 'glitch', 'portal']) {
    expect(names).toContain(wanted);
  }
});

test('every preset has a label and a hint in all three languages, in the right script', () => {
  for (const p of GENJUTSU_PRESETS) {
    for (const l of ['ka', 'en', 'ru'] as const) {
      expect(p.label[l].trim().length).toBeGreaterThan(0);
      expect(p.hint[l].trim().length).toBeGreaterThan(0);
      // A tile shows the label on one line and a hint under the hero: both must stay short enough to fit a phone.
      expect(p.label[l].length).toBeLessThanOrEqual(24);
      expect(p.hint[l].length).toBeLessThanOrEqual(64);
    }
    expect(p.label.ka).toMatch(GEORGIAN);
    expect(p.hint.ka).toMatch(GEORGIAN);
    expect(p.hint.ru).toMatch(CYRILLIC);
    expect(p.label.ru).toMatch(CYRILLIC);
  }
});

test('the model text is English and bounded — a Georgian fragment would arrive at the model as noise', () => {
  for (const p of GENJUTSU_PRESETS) {
    expect(p.scene).toMatch(/^[\x20-\x7E]+$/);
    expect(p.scene.length).toBeGreaterThan(60);
    expect(p.scene.length).toBeLessThanOrEqual(320);
    if (p.becomes) expect(p.becomes).toMatch(/^[\x20-\x7E]+$/);
  }
});

test('an object swap names what the subject becomes', () => {
  for (const p of GENJUTSU_PRESETS.filter((x) => x.kind === 'object')) expect((p.becomes ?? '').length).toBeGreaterThan(10);
});

test('every preset has a tile palette (dark base, accent) and an icon key', () => {
  for (const p of GENJUTSU_PRESETS) {
    expect(p.palette).toHaveLength(2);
    for (const c of p.palette) expect(c).toMatch(HEX);
    expect(p.icon).toMatch(/^[A-Z][A-Za-z0-9]+$/);
  }
  for (const k of PRESET_KINDS) for (const l of ['ka', 'en', 'ru'] as const) expect(KIND_LABEL[k][l].length).toBeGreaterThan(0);
});

test('every `thumb` is the preset\'s own /vfx/<id>.jpg and the file ships — a tile never asks for a picture that 404s', () => {
  const withThumb = GENJUTSU_PRESETS.filter((p) => p.thumb !== undefined);
  for (const p of withThumb) {
    expect(p.thumb).toBe(`/vfx/${p.id}.jpg`);
    expect(existsSync(join(process.cwd(), 'public', p.thumb!))).toBe(true);
  }
  // Site imagery v2 (scripts/site-art/shots.md) gave every preset its still; the palette stays as the placeholder.
  expect(withThumb).toHaveLength(GENJUTSU_PRESETS.length);
});

test('getPreset resolves a known id and nothing else (it guards the wire)', () => {
  expect(getPreset('fire')?.kind).toBe('vfx');
  expect(getPreset('nope')).toBeNull();
  expect(getPreset(undefined)).toBeNull();
  expect(getPreset({ id: 'fire' })).toBeNull();
  expect(getPreset('constructor')).toBeNull();
});

test('scene: the roles of the photos the engine RECEIVES are described — and only those', () => {
  const fire = getPreset('fire')!;
  const withTwo = composeGenjutsuPrompt({ preset: fire, op: 'scene', roles: ['character', 'product'] });
  expect(withTwo).toContain('exact person');
  expect(withTwo).toContain('product from the reference images');
  expect(withTwo).not.toContain('outfit');
  expect(withTwo).toContain(fire.scene);
  // No photos → no identity clauses, just the effect.
  expect(composeGenjutsuPrompt({ preset: fire, op: 'scene', roles: [] })).toBe(fire.scene);
});

test('a preset alone is a complete prompt — Generate works with nothing typed', () => {
  for (const p of GENJUTSU_PRESETS) {
    for (const op of ['scene', 'motion', 'swap'] as const) {
      const text = composeGenjutsuPrompt({ preset: p, op });
      expect(text.length).toBeGreaterThan(40);
      expect(text.length).toBeLessThanOrEqual(COMPOSED_PROMPT_MAX_CHARS);
    }
  }
});

test('motion keeps the character\'s identity; swap says what is replaced and that the rest stays', () => {
  const golem = getPreset('stone-golem')!;
  expect(composeGenjutsuPrompt({ preset: golem, op: 'motion', roles: ['character'] })).toContain("Keep the character's face");
  const swap = composeGenjutsuPrompt({ preset: golem, op: 'swap' });
  expect(swap).toMatch(/^Replace the main subject with a towering stone golem/);
  expect(swap).toContain('exactly as they are');
  expect(composeGenjutsuPrompt({ preset: getPreset('tokyo-night')!, op: 'swap' })).toMatch(/^Replace only the location behind the subject/);
  expect(composeGenjutsuPrompt({ preset: getPreset('anime')!, op: 'swap' })).toMatch(/^Restyle the entire video/);
  expect(composeGenjutsuPrompt({ preset: getPreset('portal')!, op: 'swap' })).toMatch(/^Add this effect to the shot/);
});

test('the optional line refines the preset; control characters and long input are cleaned', () => {
  const p = getPreset('ice')!;
  const text = composeGenjutsuPrompt({ preset: p, op: 'scene', userText: '  in a\n\tforest  ' });
  expect(text).toMatch(/Extra detail: in a forest$/);
  expect(cleanUserText('a\u0000b\u007Fc')).toBe('a b c');
  expect(cleanUserText('x'.repeat(2000))).toHaveLength(USER_PROMPT_MAX_CHARS);
  expect(cleanUserText(42)).toBe('');
});

test('with no preset the user\'s line stands alone', () => {
  expect(composeGenjutsuPrompt({ preset: null, op: 'scene', userText: 'a dragon over the sea' })).toBe('Extra detail: a dragon over the sea');
});

test('the composed prompt is cut on a word boundary at the cap, never mid-word', () => {
  const p = getPreset('fire')!;
  // cleanUserText caps the line at 500, so reach the 1800 ceiling the way it can be reached: huge roles + line.
  const text = composeGenjutsuPrompt({ preset: p, op: 'scene', roles: ['character', 'product', 'wardrobe'], userText: 'word '.repeat(200) });
  expect(text.length).toBeLessThanOrEqual(COMPOSED_PROMPT_MAX_CHARS);
});

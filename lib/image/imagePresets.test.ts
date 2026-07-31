/** @jest-environment node */
import { IMAGE_PRESETS, matchImagePreset, imagePresetValues } from './imagePresets';

const ASPECTS = ['1:1', '16:9', '9:16', '4:5', '4:3', '3:4', '3:2', '2:3', '5:4', '21:9'];
const STYLES = ['Auto', 'Photorealistic', 'Cinematic', 'Digital Art', 'Anime', '3D Render', 'Oil Painting', 'Watercolor', 'Cyberpunk', 'Fantasy', 'Minimalist', 'Line Art', 'Pixel Art'];

describe('every preset is reachable through the panel’s own controls', () => {
  it('uses only aspects the panel offers — a preset the chips cannot express would be unrevertable', () => {
    for (const p of IMAGE_PRESETS) expect(ASPECTS).toContain(p.aspect);
  });

  it('uses only styles the panel offers', () => {
    for (const p of IMAGE_PRESETS) expect(STYLES).toContain(p.style);
  });

  it('uses only real quality tiers', () => {
    for (const p of IMAGE_PRESETS) expect(['standard', 'high', 'ultra']).toContain(p.quality);
  });
});

describe('the highlight describes the CURRENT form', () => {
  it('every preset matches its own values', () => {
    for (const p of IMAGE_PRESETS) {
      expect(matchImagePreset({ aspect: p.aspect, quality: p.quality, style: p.style })).toBe(p.id);
    }
  });

  it('THE POINT: changing any one field un-highlights it', () => {
    const v = imagePresetValues('product')!;
    expect(matchImagePreset(v)).toBe('product');
    expect(matchImagePreset({ ...v, aspect: '16:9' })).toBeNull();
    expect(matchImagePreset({ ...v, quality: 'standard' })).toBeNull();
    expect(matchImagePreset({ ...v, style: 'Anime' })).toBeNull();
  });

  it('an arbitrary combination matches nothing rather than the nearest preset', () => {
    expect(matchImagePreset({ aspect: '21:9', quality: 'standard', style: 'Pixel Art' })).toBeNull();
  });
});

describe('the set is coherent', () => {
  it('no two presets share the same three values', () => {
    const keys = IMAGE_PRESETS.map((p) => `${p.aspect}|${p.quality}|${p.style}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ids unique, all three locales filled', () => {
    expect(new Set(IMAGE_PRESETS.map((p) => p.id)).size).toBe(IMAGE_PRESETS.length);
    for (const p of IMAGE_PRESETS) {
      for (const l of ['ka', 'en', 'ru'] as const) {
        expect(p.label[l].trim()).not.toBe('');
        expect(p.hint[l].trim()).not.toBe('');
      }
    }
  });
});

describe('bounds', () => {
  it.each([[null], [undefined]])('matches nothing for %p', (v) => {
    expect(matchImagePreset(v as never)).toBeNull();
  });
  it('unknown id returns null, not a partial object', () => {
    expect(imagePresetValues('nope')).toBeNull();
  });
});

/** @jest-environment node */
import { VIDEO_PRESETS, matchVideoPreset, videoPresetValues } from './videoPresets';

describe('a preset chip is a claim about the CURRENT form', () => {
  it('every preset matches its own values', () => {
    for (const p of VIDEO_PRESETS) {
      expect(matchVideoPreset({ mode: p.mode, duration: p.duration, orientation: p.orientation, style: p.style })).toBe(p.id);
    }
  });

  it('THE POINT: editing any one field un-highlights it — a stale highlight lies about the settings', () => {
    const reel = videoPresetValues('reel')!;
    expect(matchVideoPreset(reel)).toBe('reel');
    expect(matchVideoPreset({ ...reel, duration: 48 })).toBeNull();
    expect(matchVideoPreset({ ...reel, orientation: 'landscape' })).toBeNull();
    expect(matchVideoPreset({ ...reel, style: 'Anime' })).toBeNull();
    expect(matchVideoPreset({ ...reel, mode: 'musicvideo' })).toBeNull();
  });

  it('an arbitrary combination matches nothing rather than the nearest preset', () => {
    expect(matchVideoPreset({ mode: 'documentary', duration: 8, orientation: 'square', style: 'Anime' })).toBeNull();
  });
});

describe('the preset set is coherent', () => {
  it('no two presets share the same four values — they would be indistinguishable once applied', () => {
    const keys = VIDEO_PRESETS.map((p) => `${p.mode}|${p.duration}|${p.orientation}|${p.style}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ids are unique and every preset is translated', () => {
    expect(new Set(VIDEO_PRESETS.map((p) => p.id)).size).toBe(VIDEO_PRESETS.length);
    for (const p of VIDEO_PRESETS) {
      for (const loc of ['ka', 'en', 'ru'] as const) {
        expect(p.label[loc].trim().length).toBeGreaterThan(0);
        expect(p.hint[loc].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('only offers durations the composer actually supports', () => {
    for (const p of VIDEO_PRESETS) expect([8, 24, 48]).toContain(p.duration);
  });

  it('music-video mode is vertical, matching the 9:16 lock the panel enforces', () => {
    for (const p of VIDEO_PRESETS) {
      if (p.mode === 'musicvideo') expect(p.orientation).toBe('vertical');
    }
  });
});

describe('bounds', () => {
  it.each([[null], [undefined]])('matches nothing for %p', (v) => {
    expect(matchVideoPreset(v as never)).toBeNull();
  });

  it('returns null for an unknown id rather than a partial object', () => {
    expect(videoPresetValues('nope')).toBeNull();
  });
});

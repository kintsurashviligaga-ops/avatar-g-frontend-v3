/**
 * Composition tests — per-segment override resolution + lifecycle helpers.
 */
import {
  newComposition,
  newSegment,
  appendSegment,
  removeSegment,
  patchSegment,
  canAssemble,
  resolveSegmentSettings,
} from './composition';
import { DEFAULT_RENDER_SETTINGS } from './render-settings';
import type { VideoSegment } from './types';

const ready = (over?: VideoSegment['overrides']): VideoSegment => ({
  ...newSegment('clip'),
  status: 'ready',
  assetUrl: 'gs://b/x.mp4',
  overrides: over,
});

describe('composition — per-segment overrides', () => {
  test('segment override wins field-by-field; unset falls back to global', () => {
    const global = { ...DEFAULT_RENDER_SETTINGS, transition: 'crossfade' as const, captionTheme: 'minimal' as const };
    const seg = ready({ transition: 'fade_to_black', captionTheme: 'bold_glow' });
    const resolved = resolveSegmentSettings(global, seg);
    expect(resolved.transition).toBe('fade_to_black');   // overridden
    expect(resolved.captionTheme).toBe('bold_glow');     // overridden
    expect(resolved.vocalDuckingPct).toBe(global.vocalDuckingPct); // fallback
    expect(resolved.fps).toBe(global.fps);               // fallback
  });

  test('no overrides → exactly the global settings', () => {
    const global = { ...DEFAULT_RENDER_SETTINGS, fps: 60 as const, vocalDuckingPct: 45 };
    const resolved = resolveSegmentSettings(global, ready());
    expect(resolved).toEqual(global);
  });

  test('override is clamped/normalized (ducking out of range)', () => {
    const resolved = resolveSegmentSettings(DEFAULT_RENDER_SETTINGS, ready({ vocalDuckingPct: 999 }));
    expect(resolved.vocalDuckingPct).toBe(100);
  });
});

describe('composition — lifecycle', () => {
  test('append reindexes; canAssemble needs >=2 ready, none pending', () => {
    let comp = newComposition(ready());
    expect(canAssemble(comp)).toBe(false);          // only 1 ready
    comp = appendSegment(comp, ready());
    expect(comp.segments.map(s => s.index)).toEqual([0, 1]);
    expect(canAssemble(comp)).toBe(true);
    comp = appendSegment(comp, { ...newSegment('q'), status: 'queued' });
    expect(canAssemble(comp)).toBe(false);          // a queued segment blocks assembly
  });

  test('remove reindexes remaining segments', () => {
    let comp = newComposition(ready());
    const second = ready();
    comp = appendSegment(comp, second);
    comp = removeSegment(comp, second.id);
    expect(comp.segments).toHaveLength(1);
    expect(comp.segments[0]?.index).toBe(0);
  });

  test('patchSegment updates only the targeted segment', () => {
    let comp = newComposition(ready());
    const id = comp.segments[0]!.id;
    comp = patchSegment(comp, id, { status: 'failed', errorMessage: 'x' });
    expect(comp.segments[0]?.status).toBe('failed');
    expect(comp.segments[0]?.errorMessage).toBe('x');
  });
});

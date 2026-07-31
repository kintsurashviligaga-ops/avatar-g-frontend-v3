/** @jest-environment node */
import { sceneCountForDuration, VIDEO_DURATIONS, MAX_UI_SCENES, SCENE_SEC } from './sceneGrid';

describe('the three lengths the composer offers', () => {
  it.each([[8, 1], [24, 3], [48, 6]])('%is → %i scenes', (sec, want) => {
    expect(sceneCountForDuration(sec)).toBe(want);
  });

  it('covers every offered duration — a new option cannot slip through untested', () => {
    for (const d of VIDEO_DURATIONS) {
      const n = sceneCountForDuration(d);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(MAX_UI_SCENES);
    }
  });
});

describe('the clamps the six hand-copies disagreed about', () => {
  it('THE LATENT BUG: just over one scene must floor at 2, never 1 — the stitch path needs ≥2', () => {
    // Math.round(9/8) === 1. Without the floor this returned a 1-scene "multi-scene" film,
    // which /api/video/assemble rejects ("at least 2 ready segments required").
    expect(sceneCountForDuration(9)).toBe(2);
    expect(sceneCountForDuration(12)).toBe(2);
  });

  it('a single scene at or under the grid is intentional — the single-clip path', () => {
    expect(sceneCountForDuration(SCENE_SEC)).toBe(1);
    expect(sceneCountForDuration(1)).toBe(1);
  });

  it('caps at the composer ceiling however long the request', () => {
    expect(sceneCountForDuration(600)).toBe(MAX_UI_SCENES);
    expect(sceneCountForDuration(Number.MAX_SAFE_INTEGER)).toBe(MAX_UI_SCENES);
  });

  it('is total on junk rather than returning NaN scenes', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sceneCountForDuration(bad)).toBe(1);
    }
  });
});

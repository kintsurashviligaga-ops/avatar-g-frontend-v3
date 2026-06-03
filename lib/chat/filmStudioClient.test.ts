import {
  buildFilmPrompt,
  estimateFilmCostGel,
  readyClipUrls,
  firstPreviewUrl,
  summarizeProgress,
  canSalvagePartialCut,
  MIN_SALVAGE_CLIPS,
  type FilmStudioMatrix,
} from './filmStudioClient';
import { FILM_SCENE_COUNT } from './filmPipeline';
import { GEL_COST } from '@/lib/billing/gel';

function matrix(partial: Partial<FilmStudioMatrix> = {}): FilmStudioMatrix {
  return {
    sceneCount: 5,
    seed: 1,
    storyboard: 'succeeded',
    clips: [],
    stitch: 'pending',
    audio: 'succeeded',
    ...partial,
  };
}

describe('buildFilmPrompt — guarantees film routing', () => {
  it('keeps a prompt that already matches the 30-second-film trigger', () => {
    const p = 'Warrior in neon Tbilisi, 30-second film';
    expect(buildFilmPrompt(p)).toBe(p);
  });

  it('appends a canonical trigger when the brief lacks one', () => {
    const out = buildFilmPrompt('A dark sci-fi corridor with neon reflections');
    expect(out).toMatch(/30-second cinematic film$/i);
  });

  it('falls back to a default brief for empty input', () => {
    expect(buildFilmPrompt('   ')).toBe('a 30-second cinematic film');
  });
});

describe('estimateFilmCostGel — honest retail forecast from the real matrix', () => {
  it('uses N clips + one score track (storyboard is free)', () => {
    const expected = FILM_SCENE_COUNT * GEL_COST.video_film + GEL_COST.voice_tts;
    expect(estimateFilmCostGel()).toBeCloseTo(expected, 5);
  });

  it('scales linearly with scene count', () => {
    expect(estimateFilmCostGel(3)).toBeCloseTo(3 * GEL_COST.video_film + GEL_COST.voice_tts, 5);
  });

  it('clamps invalid scene counts back to the default', () => {
    expect(estimateFilmCostGel(0)).toBeCloseTo(estimateFilmCostGel(FILM_SCENE_COUNT), 5);
    expect(estimateFilmCostGel(Number.NaN)).toBeCloseTo(estimateFilmCostGel(FILM_SCENE_COUNT), 5);
  });
});

describe('readyClipUrls — only landed clips, ordered + de-duplicated', () => {
  it('returns succeeded clips sorted by ordinal', () => {
    const m = matrix({
      clips: [
        { ordinal: 3, status: 'succeeded', url: 'c3' },
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'pending', url: null },
      ],
    });
    expect(readyClipUrls(m)).toEqual(['c1', 'c3']);
  });

  it('drops failed/skipped/url-less clips and de-dupes', () => {
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'dup' },
        { ordinal: 2, status: 'succeeded', url: 'dup' },
        { ordinal: 3, status: 'failed', url: null },
        { ordinal: 4, status: 'skipped', url: null },
      ],
    });
    expect(readyClipUrls(m)).toEqual(['dup']);
  });

  it('returns [] for a null matrix', () => {
    expect(readyClipUrls(null)).toEqual([]);
  });
});

describe('firstPreviewUrl — graceful fallback while the editor stitches', () => {
  it('picks the lowest-ordinal clip that has a URL', () => {
    const m = matrix({
      clips: [
        { ordinal: 2, status: 'succeeded', url: 'b' },
        { ordinal: 1, status: 'pending', url: 'a' },
      ],
    });
    expect(firstPreviewUrl(m)).toBe('a');
  });

  it('returns null when no clip has landed', () => {
    expect(firstPreviewUrl(matrix({ clips: [{ ordinal: 1, status: 'pending', url: null }] }))).toBeNull();
    expect(firstPreviewUrl(null)).toBeNull();
  });
});

describe('canSalvagePartialCut — keep a 4-of-5 render instead of discarding it', () => {
  it('salvages when ≥2 scenes landed even though a clip failed', () => {
    // The server union reports `failed` the moment ONE clip fails, but four
    // landed clips are still a real film — this is the load-bearing case the
    // old code threw away on terminal failure.
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'succeeded', url: 'c2' },
        { ordinal: 3, status: 'succeeded', url: 'c3' },
        { ordinal: 4, status: 'succeeded', url: 'c4' },
        { ordinal: 5, status: 'failed', url: null },
      ],
    });
    expect(canSalvagePartialCut(m)).toBe(true);
  });

  it('salvages at exactly the minimum (2 landed clips)', () => {
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'succeeded', url: 'c2' },
        { ordinal: 3, status: 'failed', url: null },
      ],
    });
    expect(readyClipUrls(m).length).toBe(MIN_SALVAGE_CLIPS);
    expect(canSalvagePartialCut(m)).toBe(true);
  });

  it('does NOT salvage a single landed clip (a clip is not a cut)', () => {
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'failed', url: null },
        { ordinal: 3, status: 'failed', url: null },
      ],
    });
    expect(canSalvagePartialCut(m)).toBe(false);
  });

  it('does NOT salvage when nothing landed, incl. a null matrix', () => {
    expect(canSalvagePartialCut(matrix({ clips: [] }))).toBe(false);
    expect(canSalvagePartialCut(null)).toBe(false);
  });

  it('counts de-duplicated URLs, so two copies of one clip is not a cut', () => {
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'dup' },
        { ordinal: 2, status: 'succeeded', url: 'dup' },
      ],
    });
    expect(canSalvagePartialCut(m)).toBe(false);
  });
});

describe('summarizeProgress — phase-aware, honest copy', () => {
  it('describes dispatch and terminal phases without a matrix', () => {
    expect(summarizeProgress(null, 'dispatching')).toMatch(/storyboard/i);
    expect(summarizeProgress(null, 'assembled')).toMatch(/ready/i);
    expect(summarizeProgress(null, 'failed')).toMatch(/could not/i);
  });

  it('counts rendered scenes during rendering', () => {
    const m = matrix({
      sceneCount: 5,
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'a' },
        { ordinal: 2, status: 'succeeded', url: 'b' },
        { ordinal: 3, status: 'pending', url: null },
      ],
    });
    expect(summarizeProgress(m, 'rendering')).toMatch(/2\/5/);
  });

  it('reports the editor count during stitching', () => {
    const m = matrix({
      sceneCount: 4,
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'a' },
        { ordinal: 2, status: 'succeeded', url: 'b' },
        { ordinal: 3, status: 'succeeded', url: 'c' },
        { ordinal: 4, status: 'succeeded', url: 'd' },
      ],
    });
    expect(summarizeProgress(m, 'stitching')).toMatch(/4\/4/);
  });

  it('localizes the terminal copy (ka/ru) while defaulting to English', () => {
    // Georgian is the canonical platform language — the studio runs ka by default.
    expect(summarizeProgress(null, 'failed', 'ka')).toMatch(/ვერ დასრულდა/);
    expect(summarizeProgress(null, 'assembled', 'ka')).toMatch(/მზად არის/);
    expect(summarizeProgress(null, 'failed', 'ru')).toMatch(/не удалось/i);
    // Unknown/omitted locale falls back to English.
    expect(summarizeProgress(null, 'failed', 'zz')).toMatch(/could not/i);
    expect(summarizeProgress(null, 'failed')).toMatch(/could not/i);
  });

  it('keeps the scene counter numerics across every locale', () => {
    const m = matrix({
      sceneCount: 5,
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'a' },
        { ordinal: 2, status: 'succeeded', url: 'b' },
        { ordinal: 3, status: 'pending', url: null },
      ],
    });
    // The {done}/{total} substitution must survive in ka + ru, not just en.
    expect(summarizeProgress(m, 'rendering', 'ka')).toMatch(/2\/5/);
    expect(summarizeProgress(m, 'rendering', 'ru')).toMatch(/2\/5/);
  });
});

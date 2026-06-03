import {
  buildFilmPrompt,
  estimateFilmCostGel,
  readyClipUrls,
  firstPreviewUrl,
  summarizeProgress,
  canSalvagePartialCut,
  clipsSettled,
  everyClipLanded,
  filmProgressKey,
  asErrorText,
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

describe('clipsSettled — no clip is still rendering', () => {
  it('is true when every clip reached a terminal state (mix of outcomes)', () => {
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'failed', url: null },
        { ordinal: 3, status: 'skipped', url: null },
      ],
    });
    expect(clipsSettled(m)).toBe(true);
  });

  it('is false while any clip is still pending or queued', () => {
    expect(
      clipsSettled(
        matrix({
          clips: [
            { ordinal: 1, status: 'succeeded', url: 'c1' },
            { ordinal: 2, status: 'pending', url: null },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      clipsSettled(
        matrix({
          clips: [{ ordinal: 1, status: 'queued', url: null }],
        }),
      ),
    ).toBe(false);
  });

  it('is false for an empty clip list or a null matrix (nothing dispatched yet)', () => {
    expect(clipsSettled(matrix({ clips: [] }))).toBe(false);
    expect(clipsSettled(null)).toBe(false);
  });
});

describe('everyClipLanded — a complete cut is still on the table', () => {
  it('is true only when every non-skipped clip succeeded', () => {
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'succeeded', url: 'c2' },
        { ordinal: 3, status: 'skipped', url: null },
      ],
    });
    expect(everyClipLanded(m)).toBe(true);
  });

  it('is false when any active clip failed (salvage, do not keep waiting)', () => {
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'failed', url: null },
      ],
    });
    expect(everyClipLanded(m)).toBe(false);
  });

  it('is false when a clip is still in flight (not yet landed)', () => {
    const m = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'pending', url: null },
      ],
    });
    expect(everyClipLanded(m)).toBe(false);
  });

  it('is false when every clip was skipped, an empty list, or a null matrix', () => {
    expect(everyClipLanded(matrix({ clips: [{ ordinal: 1, status: 'skipped', url: null }] }))).toBe(false);
    expect(everyClipLanded(matrix({ clips: [] }))).toBe(false);
    expect(everyClipLanded(null)).toBe(false);
  });
});

describe('filmProgressKey — stall detection signature', () => {
  it('is stable across polls when nothing advances (the frozen-0/5 stall)', () => {
    const frozen = () =>
      matrix({
        storyboard: 'succeeded',
        audio: 'pending',
        clips: [
          { ordinal: 1, status: 'pending', url: null },
          { ordinal: 2, status: 'pending', url: null },
        ],
      });
    expect(filmProgressKey(frozen())).toBe(filmProgressKey(frozen()));
  });

  it('changes the moment a clip lands (forward progress resets the timer)', () => {
    const before = matrix({
      clips: [
        { ordinal: 1, status: 'pending', url: null },
        { ordinal: 2, status: 'pending', url: null },
      ],
    });
    const after = matrix({
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'c1' },
        { ordinal: 2, status: 'pending', url: null },
      ],
    });
    expect(filmProgressKey(after)).not.toBe(filmProgressKey(before));
  });

  it('changes when a non-clip leg advances (e.g. the score finalizes)', () => {
    const before = matrix({ audio: 'pending', clips: [{ ordinal: 1, status: 'succeeded', url: 'c1' }] });
    const after = matrix({ audio: 'succeeded', clips: [{ ordinal: 1, status: 'succeeded', url: 'c1' }] });
    expect(filmProgressKey(after)).not.toBe(filmProgressKey(before));
  });

  it('changes when a clip flips to a terminal failure (so the loop can react)', () => {
    const before = matrix({ clips: [{ ordinal: 1, status: 'pending', url: null }] });
    const after = matrix({ clips: [{ ordinal: 1, status: 'failed', url: null }] });
    expect(filmProgressKey(after)).not.toBe(filmProgressKey(before));
  });

  it('returns a constant sentinel for a null matrix', () => {
    expect(filmProgressKey(null)).toBe('none');
  });
});

describe('asErrorText — never let a non-string error crash the UI', () => {
  it('passes a string through unchanged', () => {
    expect(asErrorText('Insufficient balance')).toBe('Insufficient balance');
  });

  it('unwraps an Error / object message (the structured provider rejection)', () => {
    expect(asErrorText(new Error('boom'))).toBe('boom');
    // The exact shape that caused "[object Object]" + the `.slice` crash.
    expect(asErrorText({ type: 'insufficient_funds_error', message: 'Insufficient funds. Required: 36 cents' })).toBe(
      'Insufficient funds. Required: 36 cents',
    );
    expect(asErrorText({ error: 'nested error string' })).toBe('nested error string');
  });

  it('JSON-stringifies a message-less object instead of rendering [object Object]', () => {
    expect(asErrorText({ code: 402 })).toBe('{"code":402}');
  });

  it('handles null / undefined / primitives without throwing', () => {
    expect(asErrorText(null)).toBe('');
    expect(asErrorText(undefined)).toBe('');
    expect(asErrorText(402)).toBe('402');
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

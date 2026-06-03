/** @jest-environment node */
import {
  legToStageState,
  deriveFilmStages,
  summarizeFilmPipeline,
} from './filmStudioStages';
import type {
  FilmStudioProgress,
  FilmStudioMatrix,
  FilmLegClientStatus,
} from './filmStudioClient';
import { FILM_SCENE_COUNT } from './filmPipeline';

const ROLE = 'Scene';

function matrix(over: Partial<FilmStudioMatrix> = {}): FilmStudioMatrix {
  const sceneCount = over.sceneCount ?? FILM_SCENE_COUNT;
  return {
    sceneCount,
    seed: 1,
    storyboard: 'pending',
    clips: Array.from({ length: sceneCount }, (_, i) => ({ ordinal: i + 1, status: 'pending' as FilmLegClientStatus })),
    stitch: 'pending',
    audio: 'pending',
    ...over,
  };
}

function progress(over: Partial<FilmStudioProgress> = {}): FilmStudioProgress {
  return { phase: 'idle', matrix: null, message: '', masterUrl: null, previewUrl: null, ...over };
}

describe('legToStageState', () => {
  test('maps every server status to a visual state', () => {
    expect(legToStageState('succeeded', false)).toBe('done');
    expect(legToStageState('failed', true)).toBe('failed');
    expect(legToStageState('skipped', true)).toBe('skipped');
    expect(legToStageState('queued', true)).toBe('active');
    expect(legToStageState('pending', false)).toBe('pending');
    expect(legToStageState(undefined, false)).toBe('pending');
  });
});

describe('deriveFilmStages', () => {
  test('null progress → storyboard + N pending scenes + stitch + score, all pending', () => {
    const stages = deriveFilmStages(null, ROLE);
    expect(stages).toHaveLength(FILM_SCENE_COUNT + 3); // storyboard + clips + stitch + score
    expect(stages[0].key).toBe('storyboard');
    expect(stages.at(-2)?.key).toBe('stitch');
    expect(stages.at(-1)?.key).toBe('score');
    expect(stages.every((s) => s.state === 'pending')).toBe(true);
  });

  test('dispatching with no matrix lights the storyboard as active', () => {
    const stages = deriveFilmStages(progress({ phase: 'dispatching' }), ROLE);
    expect(stages[0].state).toBe('active');
  });

  test('rendering phase marks unstarted scene legs active and surfaces clip previews', () => {
    const stages = deriveFilmStages(
      progress({
        phase: 'rendering',
        matrix: matrix({
          sceneCount: 3,
          storyboard: 'succeeded',
          clips: [
            { ordinal: 1, status: 'succeeded', url: 'https://cdn/clip1.mp4' },
            { ordinal: 2, status: 'queued' },
            { ordinal: 3, status: 'pending' },
          ],
        }),
      }),
      ROLE,
    );
    expect(stages[0].state).toBe('done'); // storyboard
    const clipStages = stages.filter((s) => s.key.startsWith('clip_'));
    expect(clipStages.map((s) => s.state)).toEqual(['done', 'active', 'active']);
    expect(clipStages[0].previewUrl).toBe('https://cdn/clip1.mp4');
    expect(clipStages[0].label).toBe('Scene 1 / 3');
  });

  test('clips are ordered by ordinal regardless of array order', () => {
    const stages = deriveFilmStages(
      progress({
        phase: 'rendering',
        matrix: matrix({
          sceneCount: 3,
          clips: [
            { ordinal: 3, status: 'succeeded', url: 'c3' },
            { ordinal: 1, status: 'succeeded', url: 'c1' },
            { ordinal: 2, status: 'succeeded', url: 'c2' },
          ],
        }),
      }),
      ROLE,
    );
    const previews = stages.filter((s) => s.key.startsWith('clip_')).map((s) => s.previewUrl);
    expect(previews).toEqual(['c1', 'c2', 'c3']);
  });

  test('assembled phase forces the stitch leg done', () => {
    const stages = deriveFilmStages(progress({ phase: 'assembled', matrix: matrix({ stitch: 'pending' }) }), ROLE);
    expect(stages.find((s) => s.key === 'stitch')?.state).toBe('done');
  });

  test('the score leg never shows a false spinner while scenes render (queued → pending)', () => {
    const stages = deriveFilmStages(
      progress({
        phase: 'rendering',
        matrix: matrix({
          sceneCount: 3,
          storyboard: 'succeeded',
          audio: 'queued',
          clips: [
            { ordinal: 1, status: 'succeeded', url: 'c1' },
            { ordinal: 2, status: 'queued' },
            { ordinal: 3, status: 'pending' },
          ],
        }),
      }),
      ROLE,
    );
    // The scenes are the legs actually rendering — a still-queued score must read
    // pending (calm dot), not a misleading "active" spinner.
    expect(stages.find((s) => s.key === 'score')?.state).toBe('pending');
  });

  test('the score leg reflects its own terminal status during rendering', () => {
    const done = deriveFilmStages(progress({ phase: 'rendering', matrix: matrix({ audio: 'succeeded' }) }), ROLE);
    expect(done.find((s) => s.key === 'score')?.state).toBe('done');
    const failed = deriveFilmStages(progress({ phase: 'rendering', matrix: matrix({ audio: 'failed' }) }), ROLE);
    expect(failed.find((s) => s.key === 'score')?.state).toBe('failed');
  });
});

describe('summarizeFilmPipeline', () => {
  test('idle pipeline reports 0% and no scenes rendered', () => {
    const s = summarizeFilmPipeline(null, ROLE);
    expect(s.percent).toBe(0);
    expect(s.totalScenes).toBe(FILM_SCENE_COUNT);
    expect(s.scenesRendered).toBe(0);
    expect(s.done).toBe(false);
    expect(s.failed).toBe(false);
  });

  test('partial render reports an in-range percent, never 100 before assembly', () => {
    const s = summarizeFilmPipeline(
      progress({
        phase: 'rendering',
        matrix: matrix({
          sceneCount: 5,
          storyboard: 'succeeded',
          clips: [
            { ordinal: 1, status: 'succeeded', url: 'c1' },
            { ordinal: 2, status: 'succeeded', url: 'c2' },
            { ordinal: 3, status: 'pending' },
            { ordinal: 4, status: 'pending' },
            { ordinal: 5, status: 'pending' },
          ],
        }),
      }),
      ROLE,
    );
    expect(s.scenesRendered).toBe(2);
    expect(s.totalScenes).toBe(5);
    expect(s.percent).toBeGreaterThan(0);
    expect(s.percent).toBeLessThanOrEqual(99); // capped below 100 until assembled
  });

  test('assembled pipeline is exactly 100% and done', () => {
    const s = summarizeFilmPipeline(
      progress({
        phase: 'assembled',
        matrix: matrix({ storyboard: 'succeeded', stitch: 'succeeded', audio: 'succeeded' }),
      }),
      ROLE,
    );
    expect(s.percent).toBe(100);
    expect(s.done).toBe(true);
  });

  test('a failed leg raises the failed flag', () => {
    const s = summarizeFilmPipeline(
      progress({
        phase: 'rendering',
        matrix: matrix({ sceneCount: 3, clips: [{ ordinal: 1, status: 'failed' }, { ordinal: 2, status: 'pending' }, { ordinal: 3, status: 'pending' }] }),
      }),
      ROLE,
    );
    expect(s.failed).toBe(true);
  });

  test('terminal failure phase raises the failed flag even with no failed leg', () => {
    expect(summarizeFilmPipeline(progress({ phase: 'failed' }), ROLE).failed).toBe(true);
  });
});

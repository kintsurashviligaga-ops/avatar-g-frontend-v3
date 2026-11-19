/**
 * finalCut.ts — the pure half of the final cut: film order, the film's frame, the bed's price, the stable Library id and
 * the "add music to the whole film" detector (en / ka / ru).
 */
import { emptyScene, type DwProject } from './index';
import { cutTarget, dwFilmLibraryId, DW_DEFAULT_MUSIC, filmSeconds, musicBedCredits, orderedCutClips, wholeFilmMusicAsk } from './finalCut';
import { musicCredits } from '@/lib/credits/priceBook';

const board = (over: Partial<DwProject> = {}): DwProject => ({
  id: 'dw_1', title: 'Café', logline: 'Two friends meet', aspect: '16:9', resolution: '720p', characters: [],
  scenes: [
    { ...emptyScene('s2'), order: 2, seconds: 6 },
    { ...emptyScene('s1'), order: 1, seconds: 8 },
    { ...emptyScene('s3'), order: 3, seconds: 4 },
  ],
  status: 'approved', version: 2, ...over,
});

describe('orderedCutClips', () => {
  it('puts the clips in storyboard order, whatever order they arrive in', () => {
    const r = orderedCutClips(board(), [
      { sceneId: 's3', url: 'u3' }, { sceneId: 's1', url: 'u1' }, { sceneId: 's2', url: 'u2' },
    ]);
    expect(r).toEqual({ ok: true, urls: ['u1', 'u2', 'u3'] });
  });
  it('names every scene that has no clip yet', () => {
    expect(orderedCutClips(board(), [{ sceneId: 's2', url: 'u2' }])).toEqual({ ok: false, missing: ['s1', 's3'] });
  });
  it('ignores a clip for a scene that is not on the board', () => {
    const r = orderedCutClips(board(), [{ sceneId: 's1', url: 'u1' }, { sceneId: 's2', url: 'u2' }, { sceneId: 's3', url: 'u3' }, { sceneId: 'x', url: 'ux' }]);
    expect(r).toEqual({ ok: true, urls: ['u1', 'u2', 'u3'] });
  });
});

describe('cutTarget', () => {
  it('one frame for the whole film, in the board orientation', () => {
    expect(cutTarget(board({ resolution: '1080p', aspect: '16:9' }))).toEqual({ width: 1920, height: 1080, fps: 24 });
    expect(cutTarget(board({ resolution: '1080p', aspect: '9:16' }))).toEqual({ width: 1080, height: 1920, fps: 24 });
    expect(cutTarget(board({ resolution: '720p', aspect: '16:9' }))).toEqual({ width: 1280, height: 720, fps: 24 });
    expect(cutTarget(board({ resolution: '720p', aspect: '9:16' }))).toEqual({ width: 720, height: 1280, fps: 24 });
  });
});

it('film length, bed price and the stable Library id', () => {
  expect(filmSeconds(board())).toBe(18);
  expect(musicBedCredits(30)).toBe(musicCredits(30));
  expect(musicBedCredits(95)).toBe(musicCredits(95));
  expect(dwFilmLibraryId(board({ id: 'dw/1 x' }))).toBe('dwfilm_dw_1_x');
  // A re-cut (new version) keeps the same id, so the Library replaces the film.
  expect(dwFilmLibraryId(board({ version: 7 }))).toBe(dwFilmLibraryId(board({ version: 2 })));
});

describe('wholeFilmMusicAsk', () => {
  it('English: keeps the style words', () => {
    expect(wholeFilmMusicAsk('Add cinematic music to the whole film')).toEqual({ prompt: 'cinematic music' });
    expect(wholeFilmMusicAsk('put soft piano music under the entire video please')).toEqual({ prompt: 'soft piano music' });
  });
  it('a bare ask gets the default score', () => {
    expect(wholeFilmMusicAsk('add music to the whole film')).toEqual({ prompt: DW_DEFAULT_MUSIC });
  });
  it('Georgian and Russian', () => {
    expect(wholeFilmMusicAsk('მთელ ფილმს დაადე კინემატოგრაფიული მუსიკა')?.prompt).toContain('კინემატოგრაფიული');
    expect(wholeFilmMusicAsk('добавь музыку на весь фильм')).toEqual({ prompt: DW_DEFAULT_MUSIC });
  });
  it('not a whole-film music ask → null', () => {
    expect(wholeFilmMusicAsk('')).toBeNull();
    expect(wholeFilmMusicAsk('make scene 2 brighter')).toBeNull();
    expect(wholeFilmMusicAsk('add music to scene 3')).toBeNull();
    expect(wholeFilmMusicAsk('re-do the whole film')).toBeNull();
  });
});

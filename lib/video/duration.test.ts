import {
  FILM_MAX_SEC,
  LONGFORM_FROM_SEC,
  VIDEO_DURATION_PRESETS,
  VIDEO_DURATION_STOPS,
  VIDEO_MAX_SEC,
  VIDEO_MIN_SEC,
  clipSecForSeconds,
  durationStopIndex,
  formatVideoDuration,
  isVideoSeconds,
  sceneCountForSeconds,
  snapVideoSeconds,
  spokenVideoDuration,
  videoRoute,
} from './duration';

describe('the owner’s range: 4 seconds to 4 minutes', () => {
  test('the bounds', () => {
    expect(VIDEO_MIN_SEC).toBe(4);
    expect(VIDEO_MAX_SEC).toBe(240);
  });

  test('the stops are 4, 6, 8 then every 8 s up to 240 — 32 of them, ascending, no duplicates', () => {
    expect(VIDEO_DURATION_STOPS.slice(0, 5)).toEqual([4, 6, 8, 16, 24]);
    expect(VIDEO_DURATION_STOPS[VIDEO_DURATION_STOPS.length - 1]).toBe(240);
    expect(VIDEO_DURATION_STOPS).toHaveLength(32);
    expect([...VIDEO_DURATION_STOPS].sort((a, b) => a - b)).toEqual([...VIDEO_DURATION_STOPS]);
    expect(new Set(VIDEO_DURATION_STOPS).size).toBe(VIDEO_DURATION_STOPS.length);
  });

  test('every stop is valid, and every preset is a stop', () => {
    for (const s of VIDEO_DURATION_STOPS) expect(isVideoSeconds(s)).toBe(true);
    for (const p of VIDEO_DURATION_PRESETS) expect(VIDEO_DURATION_STOPS).toContain(p);
  });

  test('nothing outside the grid is valid: 3, 5, 7, 9, 12, 60, 241, 1.5, "8", NaN', () => {
    for (const bad of [0, 1, 3, 5, 7, 9, 12, 15, 60, 100, 241, 480, 1.5, '8', NaN, null, undefined]) {
      expect(isVideoSeconds(bad)).toBe(false);
    }
  });
});

describe('snapVideoSeconds', () => {
  test.each([
    [0, 4], [3, 4], [4, 4], [4.9, 4], [5, 6], [6, 6], [6.9, 6], [7, 8], [8, 8], [9, 8], [11, 8],
    [12, 16], [16, 16], [20, 24], [60, 64], [100, 104], [239, 240], [240, 240], [9999, 240], [-5, 4],
  ])('%s → %s', (input, expected) => {
    expect(snapVideoSeconds(input)).toBe(expected);
  });

  test('garbage becomes the 8 s default clip; a numeric string is read', () => {
    expect(snapVideoSeconds(NaN)).toBe(8);
    expect(snapVideoSeconds('abc')).toBe(8);
    expect(snapVideoSeconds(undefined)).toBe(8);
    expect(snapVideoSeconds('24')).toBe(24);
  });

  test('the result is always a valid length', () => {
    for (let n = -10; n <= 300; n += 0.7) expect(isVideoSeconds(snapVideoSeconds(n))).toBe(true);
  });
});

describe('which pipeline renders a length', () => {
  test('≤ 8 s one clip · ≤ 96 s the film pipeline · beyond that long-form', () => {
    expect(videoRoute(4)).toBe('single');
    expect(videoRoute(8)).toBe('single');
    expect(videoRoute(16)).toBe('film');
    expect(videoRoute(FILM_MAX_SEC)).toBe('film');
    expect(videoRoute(LONGFORM_FROM_SEC)).toBe('longform');
    expect(videoRoute(240)).toBe('longform');
  });

  test('scene counts: 1 up to 8 s, then length / 8 — 96 s is the 12-scene film ceiling, 240 s is 30 scenes', () => {
    expect(sceneCountForSeconds(4)).toBe(1);
    expect(sceneCountForSeconds(6)).toBe(1);
    expect(sceneCountForSeconds(8)).toBe(1);
    expect(sceneCountForSeconds(24)).toBe(3);
    expect(sceneCountForSeconds(48)).toBe(6);
    expect(sceneCountForSeconds(96)).toBe(12);
    expect(sceneCountForSeconds(240)).toBe(30);
  });

  test('one scene is the clip itself for 4 / 6 / 8 s and 8 s for every longer film', () => {
    expect([4, 6, 8].map(clipSecForSeconds)).toEqual([4, 6, 8]);
    expect([16, 48, 240].map(clipSecForSeconds)).toEqual([8, 8, 8]);
  });

  test('a stop’s index round-trips', () => {
    for (const [i, s] of VIDEO_DURATION_STOPS.entries()) expect(durationStopIndex(s)).toBe(i);
  });
});

describe('formatting', () => {
  test('under a minute: the number and the unit in the language', () => {
    expect(formatVideoDuration(4, 'en')).toBe('4s');
    expect(formatVideoDuration(48, 'ka')).toBe('48წმ');
    expect(formatVideoDuration(24, 'ru')).toBe('24с');
  });
  test('a minute and over: m:ss in every language', () => {
    expect(formatVideoDuration(96, 'en')).toBe('1:36');
    expect(formatVideoDuration(240, 'ka')).toBe('4:00');
    expect(formatVideoDuration(120, 'ru')).toBe('2:00');
  });
  test('spoken form for screen readers', () => {
    expect(spokenVideoDuration(8, 'en')).toBe('8 s');
    expect(spokenVideoDuration(96, 'en')).toBe('1 min 36 s');
    expect(spokenVideoDuration(240, 'en')).toBe('4 min');
  });
});

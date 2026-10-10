/** @jest-environment node */
/**
 * The one reader of parameters in words (lib/agent/params), used by the chat's intent and by the montage quote alike.
 */
import { hasPlanParams, mineMusicStart, mineMusicStartSec, mineParams, minePlanParams, mineTotalDurationSec } from './params';

describe('mineMusicStart: where the track starts, only when the music is named', () => {
  test.each([
    ['მუსიკა 5 წამიდან დაიწყე', 5],
    ['მუსიკა მე-5 წამიდან დაიწყოს', 5],
    ['სიმღერა 12 წმ-დან', 12],
    ['ტრეკი 0:05-დან დაიწყე', 5],
    ['start the music from 5 seconds', 5],
    ['the song should start at 1:30', 90],
    ['start the track from the 7th second', 7],
    ['музыка с 5 секунды', 5],
    ['трек начиная с 0:20', 20],
    ['песня с 3-й секунды', 3],
  ])('%s → %s s', (text, sec) => {
    expect(mineMusicStartSec(text)).toBe(sec);
  });

  test('no music word, no start: „5 წამიდან" alone is not about the track', () => {
    expect(mineMusicStart('ვიდეო 5 წამიდან დაიწყე')).toBeNull();
    expect(mineMusicStart('start from 5 seconds')).toBeNull();
  });

  test('a pasted huge number is capped at an hour, and the phrase is returned', () => {
    expect(mineMusicStartSec('music from 9999 seconds')).toBe(3600);
    expect(mineMusicStart('მუსიკა 5 წამიდან დაიწყე')?.phrase).toBe('5 წამიდან');
  });
});

describe('mineTotalDurationSec: the length of the result', () => {
  test('a length is read; a music start is not a length', () => {
    expect(mineTotalDurationSec('გააკეთე 20-წამიანი რეკლამა')).toBe(20);
    expect(mineTotalDurationSec('a 30-second reel')).toBe(30);
    expect(mineTotalDurationSec('მუსიკა 5 წამიდან დაიწყე')).toBeUndefined();
    expect(mineTotalDurationSec('a 30-second reel, the music from 5 seconds')).toBe(30);
  });

  test('a per-shot length is not the length of the edit', () => {
    expect(mineTotalDurationSec('each shot 2 seconds')).toBeUndefined();
    expect(mineTotalDurationSec('თითო კადრი 2 წამი')).toBeUndefined();
    expect(mineTotalDurationSec('каждый кадр 2 секунды')).toBeUndefined();
  });
});

test('mineParams sets only what was said', () => {
  expect(mineParams('ვიდეო 9:16-ზე გადაიყვანე')).toEqual({ aspect: '9:16' });
  expect(mineParams('ეს ვიდეო რუსულად გაახმოვანე')).toEqual({ targetLanguage: 'ru' });
  expect(mineParams('hello')).toEqual({});
});

describe('minePlanParams: a later line wins', () => {
  test('one line reads as mineParams does', () => {
    expect(minePlanParams('a 20-second reel 9:16, music from 5 seconds')).toEqual({ aspect: '9:16', durationSec: 20, musicStartSec: 5 });
  });

  test('a change on a later line replaces what the first words said', () => {
    expect(minePlanParams('reel 9:16, 20-second\nmake it 16:9')).toEqual({ aspect: '16:9', durationSec: 20 });
    expect(minePlanParams('cut these 16:9\n9:16')).toEqual({ aspect: '9:16' });
    expect(minePlanParams('a 20-second clip\n30 seconds')).toEqual({ durationSec: 30 });
    expect(minePlanParams('music from 3 seconds\nმუსიკა 5 წამიდან დაიწყე')).toEqual({ musicStartSec: 5 });
  });

  test('what only the first line said is kept', () => {
    expect(minePlanParams('ამ ვიდეოებიდან 20-წამიანი კლიპი\nმუსიკა 5 წამიდან დაიწყე')).toEqual({ durationSec: 20, musicStartSec: 5 });
  });
});

test('hasPlanParams: a frame shape, a length or a music start', () => {
  expect(hasPlanParams({ aspect: '9:16' })).toBe(true);
  expect(hasPlanParams({ durationSec: 20 })).toBe(true);
  expect(hasPlanParams({ musicStartSec: 0 })).toBe(true);
  expect(hasPlanParams({ targetLanguage: 'ru' })).toBe(false);
  expect(hasPlanParams({})).toBe(false);
});

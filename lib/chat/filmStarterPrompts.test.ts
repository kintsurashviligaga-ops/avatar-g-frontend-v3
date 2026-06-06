/** @jest-environment node */
import { filmStarterPrompts } from './filmStarterPrompts';

describe('filmStarterPrompts', () => {
  test('returns the single flagship music-clip starter for each supported locale', () => {
    for (const loc of ['ka', 'en', 'ru']) {
      const list = filmStarterPrompts(loc);
      // Task 4 — exactly ONE flagship template (was 3 competing example scripts).
      expect(list.length).toBe(1);
      expect(list.every((s) => typeof s === 'string' && s.trim().length > 0)).toBe(true);
      // No leading/trailing whitespace — chips render the string verbatim.
      expect(list.every((s) => s === s.trim())).toBe(true);
    }
  });

  test('falls back to Georgian for an unknown or empty locale', () => {
    expect(filmStarterPrompts('zz')).toEqual(filmStarterPrompts('ka'));
    expect(filmStarterPrompts('')).toEqual(filmStarterPrompts('ka'));
  });

  test('every locale exposes the same number of prompts (parity)', () => {
    const ka = filmStarterPrompts('ka').length;
    expect(filmStarterPrompts('en').length).toBe(ka);
    expect(filmStarterPrompts('ru').length).toBe(ka);
  });

  test('prompts are distinct within a locale (no accidental duplicates)', () => {
    for (const loc of ['ka', 'en', 'ru']) {
      const list = filmStarterPrompts(loc);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

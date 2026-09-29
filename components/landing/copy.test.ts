/** @jest-environment node */
import { LANDING_COPY, landingLang } from './copy';

const flat = (o: unknown, p = ''): string[] =>
  o && typeof o === 'object'
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k))
    : [p];

describe('landing copy', () => {
  test('ka, en and ru carry exactly the same keys', () => {
    const ka = flat(LANDING_COPY.ka).sort();
    expect(flat(LANDING_COPY.en).sort()).toEqual(ka);
    expect(flat(LANDING_COPY.ru).sort()).toEqual(ka);
  });
  test('video first in every language: the headline, the CTA and the first service', () => {
    expect(LANDING_COPY.ka.hero.title).toMatch(/ვიდეო/);
    expect(LANDING_COPY.en.hero.title).toMatch(/Video/);
    expect(LANDING_COPY.ru.hero.title).toMatch(/Видео/);
    for (const l of ['ka', 'en', 'ru'] as const) expect(Object.keys(LANDING_COPY[l].services.items)[0]).toBe('video');
  });
  test('the three steps are write → render → publish', () => {
    expect(LANDING_COPY.ka.steps.items.map((s) => s.name)).toEqual(['დაწერე', 'დაარენდერე', 'გამოაქვეყნე']);
  });
  test('no emoji anywhere in the copy (docs/DESIGN.md §6)', () => {
    const all = JSON.stringify(LANDING_COPY);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  test('unknown locales read Georgian', () => {
    expect(landingLang('fr')).toBe('ka');
  });
});

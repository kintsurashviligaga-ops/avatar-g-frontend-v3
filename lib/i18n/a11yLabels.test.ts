/** Phase 8.15: every screen-reader name exists in ka, en and ru, and the Georgian one is really Georgian. */
import { A11Y_KEYS, a11y, a11yLang, a11yTable } from './a11yLabels';

const GEORGIAN = /[ა-ჿ]/;
const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;

test.each(A11Y_KEYS)('%s has a Georgian, an English and a Russian name', (key) => {
  const row = a11yTable[key];
  expect(row.ka).toMatch(GEORGIAN);
  expect(row.ka).not.toMatch(LATIN);
  expect(row.en).toMatch(LATIN);
  expect(row.ru).toMatch(CYRILLIC);
});

test('Georgian is the default for an unknown or missing locale', () => {
  expect(a11yLang(undefined)).toBe('ka');
  expect(a11yLang('de')).toBe('ka');
  expect(a11y('close', null)).toBe('დახურვა');
  expect(a11y('close', 'en')).toBe('Close');
  expect(a11y('close', 'ru')).toBe('Закрыть');
});

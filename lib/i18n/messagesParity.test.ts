/**
 * messages/{ka,en,ru}.json — the same keys in every locale, no empty value, and no Russian value without a Cyrillic
 * letter except the product and plan names that are spelled the same in every language.
 *
 * Until 2026-10-08 the Russian file held 95 English values (a `studio` namespace no code read); this keeps an English
 * placeholder from slipping back into the Russian UI.
 */
import ka from '../../messages/ka.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';

type Tree = { [key: string]: string | Tree };
const flat = (o: Tree, p = ''): Array<[string, string]> =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)] as [string, string]]));

const LOCALES = { ka: flat(ka as Tree), en: flat(en as Tree), ru: flat(ru as Tree) };
/** Names the Russian UI shows in Latin letters on purpose. */
const LATIN_IN_RU = new Set([
  'Agent G', 'Agent G Executive', 'Agent G Voice', 'Starter', 'Pro', 'Premium', 'Empire', 'Enterprise', 'Stripe ID',
  'Orbit Solar System', '5XX XXX XXX',
]);

describe('messages parity', () => {
  it('every locale has exactly the Georgian keys', () => {
    const keys = (l: keyof typeof LOCALES) => LOCALES[l].map(([k]) => k).sort();
    expect(keys('en')).toEqual(keys('ka'));
    expect(keys('ru')).toEqual(keys('ka'));
  });

  it('no value is empty', () => {
    for (const entries of Object.values(LOCALES)) {
      expect(entries.filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([]);
    }
  });

  it('a Russian value without Cyrillic is one of the shared product names', () => {
    const latinOnly = LOCALES.ru.filter(([, v]) => /[A-Za-z]{3,}/.test(v) && !/[Ѐ-ӿ]/.test(v));
    expect(latinOnly.filter(([, v]) => !LATIN_IN_RU.has(v)).map(([k]) => k)).toEqual([]);
  });
});

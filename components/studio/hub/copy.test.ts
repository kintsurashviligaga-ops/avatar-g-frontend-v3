/**
 * The hub's copy: the same keys in ka / en / ru, nothing empty, Georgian by default, no price and no operator detail in any
 * sentence, and no claim of "connected" anywhere (nothing in the hub is connected that the hub did not connect).
 */
import { ALL_HUB_COPY, hubCopy, hubLang, type HubCopy } from './copy';

const langs = ['ka', 'en', 'ru'] as const;

/** Every string in a copy table, nested ones included. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}
/** The key paths, nested ones included — so a missing state or skill in one language fails too. */
function paths(v: unknown, prefix = ''): string[] {
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => paths(x, `${prefix}${k}.`));
  return [prefix];
}

test('ka, en and ru have exactly the same keys (nested too)', () => {
  const keys = (l: (typeof langs)[number]) => paths(ALL_HUB_COPY[l]).sort();
  expect(keys('en')).toEqual(keys('ka'));
  expect(keys('ru')).toEqual(keys('ka'));
});

test('Georgian is the default; en and ru are chosen by name', () => {
  expect(hubLang(undefined)).toBe('ka');
  expect(hubLang('de')).toBe('ka');
  expect(hubLang('en')).toBe('en');
  expect(hubCopy('ru').tabs.plugins).toBe('Плагины');
  expect(hubCopy(null).tabs.skills).toBe('უნარები');
});

test.each(langs)('%s: every entry says something; no price, no env var, no "connected"', (l) => {
  const all = strings(ALL_HUB_COPY[l] as HubCopy);
  expect(all.length).toBeGreaterThanOrEqual(55);
  for (const s of all) {
    expect(s.trim().length).toBeGreaterThan(0);
    expect(s).not.toMatch(/undefined|NaN|\[object/);
    expect(s).not.toMatch(/\d[\d\s.,]*\s*(credits?|კრედიტ|кредит)/i);
    expect(s).not.toMatch(/₾|\$|€|\bGEL\b/);
    // The channels route's notes name env vars (TELEGRAM_BOT_TOKEN …): those are for operators and never copied here.
    expect(s).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
    expect(s).not.toMatch(/\bconnected\b|დაკავშირებულია|подключ[её]н/i);
  }
});

test('Russian addresses the user as «вы»', () => {
  for (const s of strings(ALL_HUB_COPY.ru)) expect(s).not.toMatch(/(^|[\s,.(«])(ты|тебя|тебе|твой|твоя|твои|твоё)(?=$|[\s,.!?»)])/i);
});

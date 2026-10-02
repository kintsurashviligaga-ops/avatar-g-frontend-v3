import { ALL_RESEARCH_COPY, elapsedMinutes, jobFailureText, jobLabel, researchCopy, researchLang, SOON_CONNECTOR_NAMES, type ResearchCopy } from './copy';
import { job, NOW } from './testing';

const langs = ['ka', 'en', 'ru'] as const;
const samples = [0, 1, 2, 5, 11, 21, 120, 1234];

/** Every sentence the UI can say in one language: strings as they are, count-functions at several numbers. */
function sentences(c: ResearchCopy): string[] {
  const out: string[] = [];
  for (const v of Object.values(c)) {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') for (const n of samples) out.push((v as (x: never) => string)(n as never));
  }
  return out;
}

describe('the copy table', () => {
  test('ka, en and ru have exactly the same keys', () => {
    const keys = (l: (typeof langs)[number]) => Object.keys(ALL_RESEARCH_COPY[l]).sort();
    expect(keys('en')).toEqual(keys('ka'));
    expect(keys('en')).toEqual(keys('ru'));
  });

  test.each(langs)('%s: every entry says something (no empty string, no "undefined")', (l) => {
    const all = sentences(ALL_RESEARCH_COPY[l]);
    expect(all.length).toBeGreaterThan(80);
    for (const s of all) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(s).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  test.each(langs)('%s: NO PRICE INSIDE ANY SENTENCE — the price lives on the button only', (l) => {
    for (const s of sentences(ALL_RESEARCH_COPY[l])) {
      expect(s).not.toMatch(/\d[\d\s.,]*\s*(credits?|კრედიტ|кредит)/i);
      expect(s).not.toMatch(/(credits?|კრედიტ\S*|кредит\S*)\s*[:·-]?\s*\d/i);
      expect(s).not.toMatch(/₾|\$|€|\bGEL\b/);
    }
  });

  test('each language is written in its own script', () => {
    expect(ALL_RESEARCH_COPY.ka.startButton).toMatch(/[Ⴀ-ჿ]/);
    expect(ALL_RESEARCH_COPY.ru.startButton).toMatch(/[Ѐ-ӿ]/);
    expect(ALL_RESEARCH_COPY.en.startButton).not.toMatch(/[Ⴀ-ჿЀ-ӿ]/);
  });

  test('the three commands are named exactly as the owner spoke them', () => {
    expect(ALL_RESEARCH_COPY.ka.summarize).toBe('შეაჯამე');
    expect(ALL_RESEARCH_COPY.ka.takeaways).toBe('ამოიღე მთავარი არსი');
    expect(ALL_RESEARCH_COPY.ka.askHint).toContain('წამიკითხე');
  });

  test('plurals: English one/many, Russian one/few/many', () => {
    expect(researchCopy('en').sourcesCount(1)).toBe('1 source');
    expect(researchCopy('en').sourcesCount(3)).toBe('3 sources');
    expect(researchCopy('ru').cardSearches(1)).toBe('1 поиск');
    expect(researchCopy('ru').cardSearches(3)).toBe('3 поиска');
    expect(researchCopy('ru').cardSearches(5)).toBe('5 поисков');
    expect(researchCopy('ru').cardSearches(11)).toBe('11 поисков');
    expect(researchCopy('ru').cardSearches(21)).toBe('21 поиск');
  });

  test('locale fallback is Georgian; the four soon-connectors are brand names', () => {
    expect(researchLang(undefined)).toBe('ka');
    expect(researchLang('de')).toBe('ka');
    expect(researchLang('en')).toBe('en');
    expect([...SOON_CONNECTOR_NAMES]).toEqual(['Google Drive', 'OneDrive', 'Notion', 'Dropbox']);
  });
});

describe('jobFailureText — what happened, and what happened to the money', () => {
  const failed = (over: Parameters<typeof job>[0]) => job({ status: 'failed', ...over });
  test('a refunded provider failure says the credits were returned, in the user\'s language', () => {
    expect(jobFailureText(failed({ errorCode: 'provider_failed', refunded: true }), 'en')).toBe('The research could not be completed on our side. Your credits were returned.');
    expect(jobFailureText(failed({ errorCode: 'provider_failed', refunded: true }), 'ru')).toContain('Кредиты возвращены');
    expect(jobFailureText(failed({ errorCode: 'provider_failed', refunded: true }), 'ka')).toContain('კრედიტი დაგიბრუნდა');
  });
  test('a refund still on its way says so', () => {
    expect(jobFailureText(failed({ errorCode: 'timeout', refundPending: true }), 'en')).toContain('will be returned shortly');
  });
  test('never charged → no refund sentence', () => {
    expect(jobFailureText(failed({ errorCode: 'daily_limit' }), 'en')).not.toMatch(/credits/i);
  });
  test('a cancel is named as a cancel, with the refund state', () => {
    expect(jobFailureText(job({ status: 'canceled', errorCode: 'user_canceled', refunded: true }), 'en')).toBe('Research canceled. Your credits were returned.');
  });
  test('no provider text can appear: only codes are known here', () => {
    const t = jobFailureText(failed({ errorCode: 'provider_unfunded', refunded: true }), 'en');
    expect(t).not.toMatch(/google|gemini|api key|quota|billing/i);
  });
});

describe('small formatters', () => {
  test('elapsedMinutes counts from startedAt, else createdAt, never negative', () => {
    expect(elapsedMinutes({ startedAt: new Date(NOW - 7 * 60_000 - 5_000).toISOString(), createdAt: new Date(NOW).toISOString() }, NOW)).toBe(7);
    expect(elapsedMinutes({ startedAt: null, createdAt: new Date(NOW - 2 * 60_000).toISOString() }, NOW)).toBe(2);
    expect(elapsedMinutes({ startedAt: new Date(NOW + 60_000).toISOString(), createdAt: new Date(NOW).toISOString() }, NOW)).toBe(0);
    expect(elapsedMinutes({ startedAt: 'garbage', createdAt: 'garbage' }, NOW)).toBe(0);
  });
  test('jobLabel prefers the title, collapses whitespace and shortens', () => {
    expect(jobLabel({ title: '  EV   market ', prompt: 'long prompt' })).toBe('EV market');
    expect(jobLabel({ title: null, prompt: 'x'.repeat(200) }, 20)).toBe(`${'x'.repeat(19)}…`);
  });
});

/**
 * lib/chat/platformPrompt — the Google-only platform prompt. Pins the four things the old prompt got wrong
 * (non-Google engines, USD tiers, two Markdown rules, no reliable date) plus the size budget and the locale variants.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { buildPlatformPrompt, PLATFORM_UI_LABELS, type PlatformPromptLocale } from './platformPrompt';
import { ALL_TOOLS, TOOL_META } from '@/lib/studio/tools';
import { CREDIT_COSTS, CREDIT_PACKAGES, CREDIT_VALUE_GEL, creditCostFor, creditsToGel } from '@/lib/credits/pricing';

const LOCALES: PlatformPromptLocale[] = ['ka', 'en', 'ru'];
const NOW = new Date('2026-09-30T08:00:00Z'); // 12:00 in Tbilisi (UTC+4)
const build = (locale: PlatformPromptLocale, now: Date = NOW) => buildPlatformPrompt({ locale, now });

// Every vendor an earlier prompt named, or a fallback leg that could tempt the model. Word-bounded + case-blind.
const BANNED = [
  'Runway', 'FLUX', 'HeyGen', 'Udio', 'ElevenLabs', 'Eleven Labs', 'OpenAI', 'ChatGPT', 'GPT-4', 'Claude', 'Anthropic',
  'DeepSeek', 'Kling', 'LTX', 'Replicate', 'Grok', 'xAI', 'Midjourney', 'Suno', 'NanoBanana', 'WorldLabs', 'Tavily',
];

describe('buildPlatformPrompt — engines', () => {
  it.each(LOCALES)('names no non-Google engine or vendor (%s)', (locale) => {
    const p = build(locale);
    for (const name of BANNED) {
      expect({ name, hit: new RegExp(`\\b${name.replace(/[-]/g, '\\-')}\\b`, 'i').test(p) }).toEqual({ name, hit: false });
    }
  });

  it.each(LOCALES)('names the Google engines that really serve the studio (%s)', (locale) => {
    const p = build(locale);
    for (const engine of ['Gemini', 'Veo', 'Lyria', 'Gemini image', 'Gemini Live', 'Gemini TTS', 'Google Search']) {
      expect(p).toContain(engine);
    }
  });

  it('gives the Image tool NO engine while its route has no Gemini leg (see TOOL_ENGINE)', () => {
    const p = build('en');
    const line = p.split('\n').find((l) => l.startsWith(`- ${TOOL_META.image.name.en} — `));
    expect(line).toBeDefined();
    expect(line).not.toContain('·');
  });
});

describe('buildPlatformPrompt — prices come from lib/credits/pricing.ts', () => {
  const cr = (n: number) => `${n} cr (${creditsToGel(n).toFixed(2)} ₾)`;

  it.each(LOCALES)('quotes every paid action at its pricing.ts value (%s)', (locale) => {
    const p = build(locale);
    for (const [action, credits] of Object.entries(CREDIT_COSTS)) {
      if (credits === 0) continue;
      expect({ action, present: p.includes(cr(credits)) }).toEqual({ action, present: true });
    }
    expect(p).toContain(`1 credit = ${CREDIT_VALUE_GEL.toFixed(2)} ₾`);
    for (const pkg of CREDIT_PACKAGES) expect(p).toContain(`${pkg.gel} ₾ = ${pkg.credits} cr`);
    if (CREDIT_COSTS.chat_message === 0) expect(p).toContain('chat is free');
  });

  it.each(LOCALES)('never quotes dollars or the retired USD tiers (%s)', (locale) => {
    const p = build(locale);
    expect(p).not.toMatch(/USD|dollar|\$\s?\d/i);
    for (const tier of ['Starter', 'Pro Creator', 'Studio Annual']) expect(p).not.toContain(tier);
  });

  it('follows a price change in pricing.ts instead of carrying a literal', () => {
    jest.isolateModules(() => {
      // Relative specifier: jest.doMock strings are not rewritten by the path-alias transform; the resolved file is
      // the same one platformPrompt imports as '@/lib/credits/pricing'.
      jest.doMock('../credits/pricing', () => {
        const actual = jest.requireActual('../credits/pricing');
        return { ...actual, CREDIT_COSTS: { ...actual.CREDIT_COSTS, video_30s: 31, remix_video: 17 } };
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./platformPrompt') as typeof import('./platformPrompt');
      const p = mod.buildPlatformPrompt({ locale: 'en', now: NOW });
      expect(p).toContain('video 31 cr (3.10 ₾) under 60 s');
      expect(p).toContain('remix 17 cr (1.70 ₾)');
      expect(p).not.toContain(cr(CREDIT_COSTS.video_30s) + ' under 60 s');
    });
    jest.dontMock('../credits/pricing');
  });

  it('states the duration bands creditCostFor actually charges (what every route bills through)', () => {
    const p = build('en');
    const C = CREDIT_COSTS;
    expect(p).toContain(`video ${cr(C.video_30s)} under 60 s, ${cr(C.video_60s)} for 60 s or more`);
    expect(p).toContain(`music ${cr(C.music_30s)} under 60 s, ${cr(C.music_60s)} for 60–89 s, ${cr(C.music_90s)} for 90 s or more`);
    // The bands in the sentence above are literals; these pin them to pricing.ts so a moved threshold fails here.
    for (const s of [8, 24, 48, 59]) expect(creditCostFor('video', { seconds: s })).toBe(C.video_30s);
    for (const s of [60, 120]) expect(creditCostFor('video', { seconds: s })).toBe(C.video_60s);
    expect(creditCostFor('music', { seconds: 59 })).toBe(C.music_30s);
    expect(creditCostFor('music', { seconds: 60 })).toBe(C.music_60s);
    expect(creditCostFor('music', { seconds: 89 })).toBe(C.music_60s);
    expect(creditCostFor('music', { seconds: 90 })).toBe(C.music_90s);
    expect(creditCostFor('image', { count: 1 })).toBe(C.image_generate);
    expect(creditCostFor('avatar')).toBe(C.avatar_30s);
    expect(creditCostFor('remix')).toBe(C.remix_video);
    // 3D shares its number with music_30s today, so the loop above cannot tell whether 3D is quoted at all.
    expect(p).toContain(`3D model ${cr(C.model3d)}`);
    expect(creditCostFor('model3d')).toBe(C.model3d);
  });
});

describe('buildPlatformPrompt — date line (Tbilisi, UTC+4)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('states the Tbilisi date and time for the given instant', () => {
    const p = build('ka');
    expect(p).toContain('CURRENT DATE & TIME in Tbilisi, Georgia (UTC+4): Wednesday, 30 September 2026, 12:00.');
  });

  it('rolls over to the next Tbilisi day before UTC does, with a 00-23 clock', () => {
    expect(build('en', new Date('2026-09-30T21:30:00Z'))).toContain(': Thursday, 1 October 2026, 01:30.');
    expect(build('en', new Date('2026-09-30T20:00:00Z'))).toContain(': Thursday, 1 October 2026, 00:00.');
  });

  it('uses the current time when `now` is missing or invalid', () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-02T03:04:00Z'));
    expect(buildPlatformPrompt({ locale: 'en' })).toContain(': Saturday, 2 January 2027, 07:04.');
    const p = buildPlatformPrompt({ locale: 'en', now: new Date('not a date') });
    expect(p).toContain(': Saturday, 2 January 2027, 07:04.');
    expect(p).not.toMatch(/Invalid|NaN|undefined/);
  });

  it('falls back to the fixed +4 offset, byte-identical, where Intl has no time-zone data', () => {
    const viaIntl = build('ru', new Date('2026-12-31T22:15:00Z'));
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('Invalid time zone specified: Asia/Tbilisi');
    });
    const viaOffset = build('ru', new Date('2026-12-31T22:15:00Z'));
    expect(viaOffset).toBe(viaIntl);
    expect(viaOffset).toContain(': Friday, 1 January 2027, 02:15.');
  });
});

describe('buildPlatformPrompt — shape and size', () => {
  it.each(LOCALES)('stays within the 5,000-character budget (%s)', (locale) => {
    // September + Wednesday are the longest month/weekday names, so NOW is the worst case for the date line.
    expect(build(locale).length).toBeLessThanOrEqual(5000);
  });

  it.each(LOCALES)('carries exactly ONE formatting rule (%s)', (locale) => {
    const p = build(locale);
    expect(p.match(/markdown/gi)).toHaveLength(1);
    expect(p.match(/^FORMAT:/gm)).toHaveLength(1);
    expect(p).not.toMatch(/always use (rich )?markdown|markdown: always/i);
  });

  it.each(LOCALES)('keeps the rules that are still true (%s)', (locale) => {
    const p = build(locale);
    expect(p).toContain('Agent G');
    expect(p).toMatch(/Google Search/);
    expect(p).toMatch(/search first/);
    expect(p).toMatch(/Never reply with JSON/);
    expect(p).toMatch(/cannot start, queue or finish a render/);
    expect(p).toMatch(/Mkhedruli/);
  });

  it('is deterministic for the same input', () => {
    for (const locale of LOCALES) expect(build(locale)).toBe(build(locale));
  });
});

describe('buildPlatformPrompt — locale variants', () => {
  it.each([
    ['ka', 'Reply in Georgian (ქართული).'],
    ['en', 'Reply in English.'],
    ['ru', 'Reply in Russian (Русский).'],
  ] as const)('sets the reply language for %s', (locale, line) => {
    const p = build(locale);
    expect(p).toContain(line);
    for (const other of LOCALES.filter((l) => l !== locale)) {
      expect(p).not.toContain(`Reply in ${PLATFORM_UI_LABELS[other].language}.`);
    }
  });

  it.each(LOCALES)('lists every studio tool under its %s UI name and tagline', (locale) => {
    const p = build(locale);
    for (const id of ALL_TOOLS) expect(p).toContain(`- ${TOOL_META[id].name[locale]} — ${TOOL_META[id].sub[locale]}`);
  });

  it.each(LOCALES)('points at the %s labels of the real buttons', (locale) => {
    const p = build(locale);
    const ui = PLATFORM_UI_LABELS[locale];
    for (const label of [ui.toolsSheet, ui.services, ui.liveVoice, ui.topUp]) expect(p).toContain(`"${label}"`);
  });

  it('falls back to Georgian for an unknown locale', () => {
    const p = buildPlatformPrompt({ locale: 'de' as unknown as PlatformPromptLocale, now: NOW });
    expect(p).toBe(build('ka'));
  });

  it('produces three distinct variants', () => {
    expect(new Set(LOCALES.map((l) => build(l))).size).toBe(3);
  });
});

describe('PLATFORM_UI_LABELS stay in sync with the UI', () => {
  // The labels are copied from components (they are not exported there). Scan all of components/ rather than one
  // file so the composer can move (UnifiedComposer, ToolSheet) without breaking this; a RENAMED label must fail.
  const root = join(process.cwd(), 'components');
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) sources.push(readFileSync(full, 'utf8'));
    }
  };
  walk(root);
  const corpus = sources.join('\n');

  it.each(LOCALES)('every %s button label exists verbatim in components/', (locale) => {
    const ui = PLATFORM_UI_LABELS[locale];
    for (const label of [ui.toolsSheet, ui.services, ui.liveVoice, ui.topUp]) {
      expect({ label, found: corpus.includes(`'${label}'`) }).toEqual({ label, found: true });
    }
  });
});

describe('buildPlatformPrompt — search honesty', () => {
  it('promises Google Search only when the turn carries the tool', () => {
    expect(buildPlatformPrompt({ locale: 'en', now: NOW })).toContain('You have Google Search');
    const off = buildPlatformPrompt({ locale: 'en', now: NOW, googleSearch: false });
    expect(off).not.toContain('You have Google Search');
    expect(off).toContain('You cannot search the web');
  });
});

describe('buildPlatformPrompt — the self-introduction is in the reply language', () => {
  it.each([
    ['ka', 'მე ვარ Agent G, MyAvatar.ge-ს AI ასისტენტი.'],
    ['en', "I'm Agent G, MyAvatar.ge's AI assistant."],
    ['ru', 'Я Agent G, ИИ-ассистент MyAvatar.ge.'],
  ] as const)('%s', (locale, intro) => {
    const p = buildPlatformPrompt({ locale });
    expect(p).toContain(`"${intro}"`);
    // A Georgian prompt never quotes the English line (the model copied it into Georgian answers).
    if (locale !== 'en') expect(p).not.toContain("I'm Agent G");
  });
});

/**
 * lib/chat/platformPrompt — the Google-only platform prompt. Pins the four things the old prompt got wrong
 * (non-Google engines, USD tiers, two Markdown rules, no reliable date) plus the size budget and the locale variants.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { buildPlatformPrompt, OUTSIDE_ENGINE_TOOLS, PLATFORM_UI_LABELS, START_QUESTION, VEO_AVATAR_PROMPT_CREDITS, type PlatformPromptLocale } from './platformPrompt';
import { veoAvatarCredits } from '@/lib/avatar/veoAvatar';
import { offeredPrompt } from './offeredPrompt';
import { quoteCredits } from '@/lib/credits/quote';
import { ALL_TOOLS, TOOL_META } from '@/lib/studio/tools';
import { NAV_GROUP_LABEL, toolGroups } from '@/lib/catalog/nav';
import { getService } from '@/lib/catalog/services';
import { CREDIT_COSTS, CREDIT_PACKAGES, CREDIT_VALUE_GEL, creditCostFor, creditsToGel } from '@/lib/credits/pricing';
import { BOG_TOPUP_PACKS_GEL, topupCredits } from '@/lib/billing/bogCatalog';
import { videoCredits } from '@/lib/credits/videoPricing';
import { PRICE_BOOK } from '@/lib/credits/priceBook';
import { MUSIC_VIDEO_SURCHARGE_PCT, tierPriceEffect } from '@/lib/video/createPanel';
import { BUILT_IN_PERSONAS } from '@/lib/services/personas/personas';

const LOCALES: PlatformPromptLocale[] = ['ka', 'en', 'ru'];
const NOW = new Date('2026-09-30T08:00:00Z'); // 12:00 in Tbilisi (UTC+4)
const build = (locale: PlatformPromptLocale, now: Date = NOW) => buildPlatformPrompt({ locale, now });
/** The names on the prompt's NOT AVAILABLE YET line. */
const notYetNames = (p: string): string[] =>
  (p.match(/^NOT AVAILABLE YET: (.*?)\. When asked/m)?.[1] ?? '').split(', ').filter(Boolean);

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

  it('names Gemini image for the Image tool, whose route renders on Google image only (see TOOL_ENGINE)', () => {
    const p = build('en');
    const line = p.split('\n').find((l) => l.startsWith(`- ${TOOL_META.image.name.en} — `));
    expect(line).toBeDefined();
    expect(line).toMatch(/ · Gemini image$/);
  });
});

describe('buildPlatformPrompt — prices come from lib/credits/pricing.ts', () => {
  const cr = (n: number) => `${n} cr (${creditsToGel(n).toFixed(2)} ₾)`;

  it.each(LOCALES)('quotes every paid action at its pricing.ts value (%s)', (locale) => {
    const p = build(locale);
    for (const [action, credits] of Object.entries(CREDIT_COSTS)) {
      if (credits === 0) continue;
      // Not owner-approved yet (lib/billing/paidServiceGate): never quoted — see the test below.
      if (action === 'dubbing_per_minute' || action === 'presentation_deck') continue;
      // No Google engine, so the tool is closed and never priced (MASTER TASK v3.1) — see the closed-tool tests below.
      if (action === 'avatar_30s' || action === 'model3d') continue;
      expect({ action, present: p.includes(cr(credits)) }).toEqual({ action, present: true });
    }
    expect(p).toContain(`1 credit = ${CREDIT_VALUE_GEL.toFixed(2)} ₾`);
    // The packs the Credits window sells (gap C4), not CREDIT_PACKAGES — nothing sells those.
    for (const g of BOG_TOPUP_PACKS_GEL) expect(p).toContain(`${g} ₾ = ${topupCredits(g)} cr`);
    for (const pkg of CREDIT_PACKAGES) expect(p).not.toContain(`${pkg.gel} ₾ = ${pkg.credits} cr`);
    if (CREDIT_COSTS.chat_message === 0) expect(p).toContain('chat is free');
  });

  it('quotes dubbing and decks only once the owner approved their exact price', () => {
    const saved = process.env.OWNER_APPROVED_PRICING;
    delete process.env.OWNER_APPROVED_PRICING;
    const off = build('en');
    expect(off).toContain('dubbing and decks: not yet available');
    expect(off).not.toContain(`dub ${cr(CREDIT_COSTS.dubbing_per_minute)}`);
    process.env.OWNER_APPROVED_PRICING = `dubbing:${CREDIT_COSTS.dubbing_per_minute},presentation:${CREDIT_COSTS.presentation_deck}`;
    const on = build('en');
    expect(on).toContain(`dub ${cr(CREDIT_COSTS.dubbing_per_minute)}/min; deck ${cr(CREDIT_COSTS.presentation_deck)}`);
    expect(on).not.toContain('not yet available');
    if (saved === undefined) delete process.env.OWNER_APPROVED_PRICING; else process.env.OWNER_APPROVED_PRICING = saved;
  });

  it.each(LOCALES)('never quotes dollars or the retired USD tiers (%s)', (locale) => {
    const p = build(locale);
    expect(p).not.toMatch(/USD|dollar|\$\s?\d/i);
    for (const tier of ['Starter', 'Pro Creator', 'Studio Annual']) expect(p).not.toContain(tier);
  });

  it('follows a price change in pricing.ts and the price book instead of carrying a literal', () => {
    jest.isolateModules(() => {
      // Relative specifiers: jest.doMock strings are not rewritten by the path-alias transform; the resolved files are
      // the same ones platformPrompt imports as '@/lib/credits/pricing' and '@/lib/credits/priceBook'.
      jest.doMock('../credits/priceBook', () => {
        const actual = jest.requireActual('../credits/priceBook');
        return { ...actual, PRICE_BOOK: { ...actual.PRICE_BOOK, remixVoiceover: 17, remixMusic: 3 } };
      });
      jest.doMock('../credits/pricing', () => {
        const actual = jest.requireActual('../credits/pricing');
        return { ...actual, CREDIT_COSTS: { ...actual.CREDIT_COSTS, video_30s: 31 } };
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./platformPrompt') as typeof import('./platformPrompt');
      const p = mod.buildPlatformPrompt({ locale: 'en', now: NOW });
      expect(p).toContain('chat clip 31 cr (3.10 ₾)');
      expect(p).toContain('touch-up: voice-over 17 cr (1.70 ₾), own music 3 cr (0.30 ₾)');
      expect(p).not.toContain(`chat clip ${cr(CREDIT_COSTS.video_30s)}`);
    });
    jest.dontMock('../credits/pricing');
    jest.dontMock('../credits/priceBook');
  });

  it('quotes a film at what the film is charged (videoCredits), not the clip table (gap C4)', () => {
    const p = build('en');
    // A 24-second Fast film is 217 credits; the single chat clip's 75 must not be read as the film's price.
    const v = (s: number) => videoCredits({ seconds: s, quality: 'fast', mode: 'documentary' });
    expect(p).toContain(`film: Fast 8 s ${v(8)}, 24 s ${v(24)}, 48 s ${v(48)} cr`);
    expect(videoCredits({ seconds: 24, quality: 'fast', mode: 'documentary' })).toBeGreaterThan(CREDIT_COSTS.video_30s);
    const pct = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
    expect(p).toContain(`Lite ${pct(tierPriceEffect('lite').deltaPct)}, Max ${pct(tierPriceEffect('standard').deltaPct)}, music video ${pct(MUSIC_VIDEO_SURCHARGE_PCT)}`);
    expect(p).toContain('Lite −30%, Max +210%, music video +3%');
    // The lip-sync pass ran on the old avatar engine, which is always refused, so it is never priced.
    expect(p).not.toContain('film lip-sync');
    expect(p).toContain('product ad = a Fast film of its length');
  });

  it('states what creditCostFor actually charges: music by its length bands, a chat clip at 8 s, a video by its length', () => {
    const p = build('en');
    const C = CREDIT_COSTS;
    expect(p).toContain(`chat clip ${cr(C.video_30s)}`);
    expect(p).toContain(`music ${cr(C.music_30s)} <60 s, ${cr(C.music_60s)} 60–89 s, ${cr(C.music_90s)} ≥90 s`);
    // The bands in the sentence above are literals; these pin them to pricing.ts so a moved threshold fails here.
    // A chat clip is the shortest film (8 s on Fast); anything longer is priced by its length, never at the clip's number.
    expect(creditCostFor('video')).toBe(C.video_30s);
    expect(creditCostFor('video', { seconds: 8 })).toBe(C.video_30s);
    for (const s of [24, 48, 60, 120]) expect(creditCostFor('video', { seconds: s })).toBe(videoCredits({ seconds: s, quality: 'fast' }));
    expect(creditCostFor('music', { seconds: 59 })).toBe(C.music_30s);
    expect(creditCostFor('music', { seconds: 60 })).toBe(C.music_60s);
    expect(creditCostFor('music', { seconds: 89 })).toBe(C.music_60s);
    expect(creditCostFor('music', { seconds: 90 })).toBe(C.music_90s);
    expect(creditCostFor('image', { count: 1 })).toBe(C.image_generate);
    expect(creditCostFor('avatar')).toBe(C.avatar_30s);
    expect(creditCostFor('remix')).toBe(C.remix_video);
    // 3D has no Google engine, so it is named as not available and never priced.
    expect(p).not.toContain('3D model');
    expect(creditCostFor('model3d')).toBe(C.model3d);
  });
});

describe('buildPlatformPrompt — a closed tool is named, never offered (sweep 2026-10-16)', () => {
  const cr = (n: number) => `${n} cr (${creditsToGel(n).toFixed(2)} ₾)`;
  const toolLine = (p: string, id: (typeof ALL_TOOLS)[number], locale: PlatformPromptLocale) =>
    p.includes(`- ${TOOL_META[id].name[locale]} — ${TOOL_META[id].sub[locale]}`);

  it.each(LOCALES)('the outside-engine tools are not listed or priced (%s)', (locale) => {
    const p = buildPlatformPrompt({ locale, now: NOW });
    for (const id of OUTSIDE_ENGINE_TOOLS) {
      expect({ id, listed: toolLine(p, id, locale) }).toEqual({ id, listed: false });
      expect(notYetNames(p)).toContain(TOOL_META[id].name[locale]);
    }
    expect(p).not.toContain('talking avatar');
    expect(p).not.toContain('film lip-sync');
    expect(p).not.toContain(`3D model ${cr(CREDIT_COSTS.model3d)}`);
    // The touch-up has no menu row (GG 2026-10-18): it is listed with the way to reach it, says what the route refuses,
    // and its ffmpeg ops stay priced.
    expect(p).toContain(`- ${TOOL_META.remix.name[locale]} — ${TOOL_META.remix.sub[locale]} (attach a video here; no restyle, background or redub)`);
    expect(p).toContain(`touch-up: voice-over ${cr(PRICE_BOOK.remixVoiceover)}, own music ${cr(PRICE_BOOK.remixMusic)}`);
    expect(p).toContain('say plainly it is not available yet (nothing is charged)');
    expect(p.length).toBeLessThanOrEqual(5000);
  });

  it.each([
    { MEDIA_GOOGLE_ONLY: '0' },
    { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-heygen' },
  ])('no env value lists or prices them again (%o)', (env) => {
    const saved = { ...process.env };
    const before = build('en');
    Object.assign(process.env, env);
    const p = build('en');
    process.env = saved;
    expect(p).toBe(before);
    expect(p).not.toContain('talking avatar');
    expect(p).not.toContain(`3D model ${cr(CREDIT_COSTS.model3d)}`);
    expect(p).toContain('(attach a video here; no restyle, background or redub)');
  });

  it.each(LOCALES)('a user who may run the Veo avatar is offered it at the Veo clip price, with Veo named (%s)', (locale) => {
    const p = buildPlatformPrompt({ locale, now: NOW, veoAvatar: true });
    expect(p).toContain(`- ${TOOL_META.avatar.name[locale]} — ${TOOL_META.avatar.sub[locale]} · Veo`);
    expect(p).toContain(`talking avatar ${cr(VEO_AVATAR_PROMPT_CREDITS)} per 8 s clip`);
    expect(notYetNames(p)).not.toContain(TOOL_META.avatar.name[locale]);
    // The film's lip-sync pass was the old engine, which is always refused.
    expect(p).not.toContain('film lip-sync');
    for (const id of OUTSIDE_ENGINE_TOOLS.filter((t) => t !== 'avatar')) expect(notYetNames(p)).toContain(TOOL_META[id].name[locale]);
    expect(p.length).toBeLessThanOrEqual(5000);
  });

  it('prices the Veo avatar as the route charges it', () => {
    expect(VEO_AVATAR_PROMPT_CREDITS).toBe(veoAvatarCredits());
  });

  it('names dubbing and decks as not-yet until the owner approves their price, and never lists them (no menu row since 2026-10-21)', () => {
    const saved = process.env.OWNER_APPROVED_PRICING;
    delete process.env.OWNER_APPROVED_PRICING;
    const off = build('en');
    expect(notYetNames(off)).toEqual(expect.arrayContaining([TOOL_META.dubbing.name.en, TOOL_META.presentation.name.en]));
    expect(toolLine(off, 'dubbing', 'en')).toBe(false);
    process.env.OWNER_APPROVED_PRICING = `dubbing:${CREDIT_COSTS.dubbing_per_minute},presentation:${CREDIT_COSTS.presentation_deck}`;
    const on = build('en');
    // GG's menu clean-up took both out of the side menu (lib/catalog/nav HIDE), so an approved price no longer lists them.
    expect(toolLine(on, 'dubbing', 'en')).toBe(false);
    expect(toolLine(on, 'presentation', 'en')).toBe(false);
    expect(notYetNames(on)).not.toContain(TOOL_META.dubbing.name.en);
    if (saved === undefined) delete process.env.OWNER_APPROVED_PRICING; else process.env.OWNER_APPROVED_PRICING = saved;
  });

  it('closes exactly the tools whose route always refuses them', () => {
    // Read as text: mediaPolicy imports next/server, which needs the node test environment this suite does not use.
    const policy = readFileSync(join(process.cwd(), 'lib/providers/mediaPolicy.ts'), 'utf8');
    const gated = new Set([...policy.matchAll(/\{ file: '([^']+)'/g)].map((m) => m[1]));
    const route: Record<(typeof OUTSIDE_ENGINE_TOOLS)[number], string> = {
      avatar: 'app/api/video/lipsync/route.ts',
      swap: 'app/api/video/remix/route.ts',
      motion: 'app/api/motion-control/route.ts',
      model3d: 'app/api/v2/model3d/create/route.ts',
    } as never;
    for (const id of OUTSIDE_ENGINE_TOOLS) expect({ id, gated: gated.has(route[id]) }).toEqual({ id, gated: true });
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

describe('buildPlatformPrompt — what it cannot do, it says (GG 2026-10-11 PART 7)', () => {
  it.each(LOCALES)('no browser: never claims a click, a sign-in or a screenshot of a site (%s)', (locale) => {
    expect(build(locale)).toContain('BROWSER: none — never claim to click, log in or screenshot a site.');
  });
});

describe('buildPlatformPrompt — the persona list is the catalogue (GG 2026-10-25: asked, it named a list the app does not have)', () => {
  it.each(LOCALES)('names exactly the built-in personas in the reply language, and where the user switches them (%s)', (locale) => {
    const line = build(locale).split('\n\n').find((b) => b.startsWith('PERSONAS'))!;
    expect(line).toContain(BUILT_IN_PERSONAS.map((p) => p.name[locale]).join(', '));
    expect(line).toContain({ ka: '"მოდელი" menu → "პერსონა"', en: '"Model" menu → "Persona"', ru: '"Модель" menu → "Персона"' }[locale]);
    expect(line).toContain('Name no others;');
  });

  it('lists GG\'s characters in Georgian', () => {
    expect(build('ka')).toContain('მეგობრული, სარკასტული, რეჟისორი, ხუმარა, ბიზნესმენი, პროდიუსერი, ახალი ამბების ჟურნალისტი');
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
    // Production 2026-10-16: a text reply told GG the image was "already processing" when nothing had started.
    expect(p).toMatch(/never claim anything is processing/);
    expect(p).toMatch(/Mkhedruli/);
  });

  // Production 2026-10-16 (GG's iPhone): „კი შექმენი სურათი 9:16 ფორმატის" got „I can't generate in the chat — open the
  // Image tool via +, attach the photo, pick 9:16". GG: every service runs in the chat, and a yes starts it.
  it.each(LOCALES)('offers in the chat and asks to start, instead of sending people to a tool (%s)', (locale) => {
    const p = build(locale);
    expect(p).toMatch(/never send them to a tool, a menu or the \+ button/);
    expect(p).toMatch(/never ask them to attach again a file that is already in this chat/);
    expect(p).toContain(`exactly this question: "${START_QUESTION[locale]}"`);
    expect(p).not.toMatch(/Nothing runs until the user taps that tool's Create/);
    expect(p).not.toMatch(/name the tool and how to open it in one sentence, then offer a ready-to-use prompt/);
  });

  it.each(LOCALES)('an offer in the shape it asks for is one the studio starts on a yes, at the price it really costs (%s)', (locale) => {
    const one = quoteCredits({ tool: 'image', count: 1 });
    expect(build(locale)).toContain(`one image is ${one} credits`);
    const reply = `9:16 portrait: "a man in a tailored black suit, studio light, photorealistic" — ${one} credits (0.20 ₾). ${START_QUESTION[locale]}`;
    expect(offeredPrompt(reply)).toEqual({ mode: 'image', prompt: 'a man in a tailored black suit, studio light, photorealistic', credits: one });
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

  it.each(LOCALES)('a spoken call follows the language the user speaks, not "switch only if asked" (%s)', (locale) => {
    // GG 2026-10-25: in a Live call, English and Russian speech got Georgian answers; the text chat's line won.
    const p = buildPlatformPrompt({ locale, now: NOW, spoken: true });
    expect(p).toContain('LANGUAGE: Reply in the language the user is speaking: Georgian, English or Russian.');
    expect(p).toContain('your very next reply is in the new language, without being asked');
    expect(p).toContain(`Only when you cannot tell, use ${PLATFORM_UI_LABELS[locale].language}.`);
    expect(p).not.toContain('Switch only if the user asks');
    expect(p.length).toBeLessThanOrEqual(5000);
    // The text chat keeps its own rule.
    expect(build(locale)).toContain('Switch only if the user asks for another language.');
  });

  it.each(LOCALES)('a spoken call gets no text-chat offer recipe in HANDING OFF (%s)', (locale) => {
    // GG 2026-10-25 (avatar call): the call quoted a price and asked "shall I start?" with nothing prepared.
    const p = buildPlatformPrompt({ locale, now: NOW, spoken: true });
    expect(p).toContain('HANDING OFF: in this voice call a render is ordered and started only the way the LIVE VOICE CALL rule below says');
    expect(p).not.toContain('You cannot start, queue or finish a render yourself');
    expect(build(locale)).toContain('You cannot start, queue or finish a render yourself');
  });

  it('Georgian or Russian typed in Latin letters is answered in its own script', () => {
    expect(build('ka')).toContain('Georgian typed in Latin letters ("gamarjoba", "rogor xar") is still Georgian: answer it in Mkhedruli.');
    expect(build('ru')).toContain('Russian typed in Latin letters ("privet", "kak dela") is still Russian: answer it in Cyrillic.');
    expect(build('en')).not.toMatch(/typed in Latin letters/);
  });

  it.each(LOCALES)('lists every studio tool under its %s UI name and tagline, or names it as not available yet', (locale) => {
    for (const veoAvatar of [false, true]) {
      const p = buildPlatformPrompt({ locale, now: NOW, veoAvatar });
      const closed = notYetNames(p);
      for (const id of ALL_TOOLS) {
        const listed = p.includes(`- ${TOOL_META[id].name[locale]} — ${TOOL_META[id].sub[locale]}`);
        expect({ id, veoAvatar, listed, closed: closed.includes(TOOL_META[id].name[locale]) }).toEqual({ id, veoAvatar, listed, closed: !listed });
      }
    }
  });

  it.each(LOCALES)('points at the %s labels of the real buttons', (locale) => {
    const p = build(locale);
    const ui = PLATFORM_UI_LABELS[locale];
    for (const label of [ui.toolsSheet, ui.attach, ui.liveVoice, ui.topUp]) expect(p).toContain(`"${label}"`);
    // The side menu's headings come from the catalog nav, not a copy.
    for (const g of ['create', 'work'] as const) expect(p).toContain(`"${NAV_GROUP_LABEL[g][locale]}"`);
  });

  it.each(LOCALES)('lists the %s tools under the side menu\'s categories and names what is not available yet', (locale) => {
    const p = build(locale);
    const closed = notYetNames(p);
    for (const g of toolGroups()) {
      const open = g.tools.filter((id) => !closed.includes(TOOL_META[id].name[locale]));
      if (open.length === 0) expect(p).not.toContain(`${g.label[locale]}:\n`);
      else expect(p).toContain(`${g.label[locale]}:\n- ${TOOL_META[open[0]!].name[locale]}`);
    }
    expect(p).toContain('NOT AVAILABLE YET:');
    expect(closed).toContain(getService('music.remix')!.label[locale]);
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
    for (const label of [ui.toolsSheet, ui.attach, ui.liveVoice, ui.topUp]) {
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

/** @jest-environment node */
import { quoteCredits } from '@/lib/credits/quote';
import { MUSIC_VIDEO_MULT, VIDEO_QUALITY_MULT, videoCredits } from '@/lib/credits/videoPricing';
import { TRIAL } from '@/lib/billing/tiers';
import { FILM_MAX_SEC, VIDEO_DURATION_STOPS, VIDEO_MAX_SEC, videoRoute } from './duration';
import {
  CLOSED_CAPABILITIES,
  EXTEND_DIRECTIONS,
  LONGFORM_ORDER_WIRED,
  MUSIC_VIDEO_SURCHARGE_PCT,
  PRICE_TABLE_LENGTHS,
  VIDEO_TIERS,
  VIDEO_TIER_TITLE,
  buildExtendRequest,
  durationOptions,
  effectiveCapabilities,
  freeSlotApplies,
  insertPromptToken,
  isLengthLocked,
  lastOpenStopIndex,
  musicVideoIntroSec,
  openDuration,
  parseVideoCapabilities,
  referenceToken,
  tierPriceEffect,
  videoPriceRows,
  videoQuote,
  videoResolution,
  videoWaitSecs,
} from './createPanel';

describe('the price is the quote, for every length, tier and mode', () => {
  test('videoQuote === quoteCredits === videoCredits on every stop × tier × mode', () => {
    for (const seconds of VIDEO_DURATION_STOPS) {
      for (const tier of VIDEO_TIERS) {
        for (const mode of ['documentary', 'musicvideo'] as const) {
          const want = quoteCredits({ tool: 'video', seconds, quality: tier, mode });
          expect(videoQuote({ seconds, tier, mode })).toBe(want);
          expect(want).toBe(videoCredits({ seconds, quality: tier, mode }));
        }
      }
    }
  });

  test('longer costs more, a better tier costs more, a music video costs more — and nothing is free', () => {
    for (const tier of VIDEO_TIERS) {
      let prev = 0;
      for (const seconds of VIDEO_DURATION_STOPS) {
        const c = videoQuote({ seconds, tier, mode: 'documentary' });
        expect(c).toBeGreaterThan(prev);
        prev = c;
      }
    }
    for (const seconds of VIDEO_DURATION_STOPS) {
      const q = (tier: 'lite' | 'fast' | 'standard') => videoQuote({ seconds, tier, mode: 'documentary' });
      expect(q('lite')).toBeLessThan(q('fast'));
      expect(q('fast')).toBeLessThan(q('standard'));
      expect(videoQuote({ seconds, tier: 'fast', mode: 'musicvideo' })).toBeGreaterThan(q('fast'));
    }
  });

  test('the anchor: Fast = 25 credits per 8 s clip, 75 for 24 s', () => {
    expect(videoQuote({ seconds: 8, tier: 'fast', mode: 'documentary' })).toBe(25);
    expect(videoQuote({ seconds: 24, tier: 'fast', mode: 'documentary' })).toBe(75);
  });

  test('the tier effects shown are the pricing table’s own (Lite 0.6×, Fast 1×, Standard 3.3×)', () => {
    expect(tierPriceEffect('lite')).toEqual({ multiplier: VIDEO_QUALITY_MULT.lite, deltaPct: -40 });
    expect(tierPriceEffect('fast')).toEqual({ multiplier: 1, deltaPct: 0 });
    expect(tierPriceEffect('standard')).toEqual({ multiplier: VIDEO_QUALITY_MULT.standard, deltaPct: 230 });
    expect(MUSIC_VIDEO_SURCHARGE_PCT).toBe(Math.round((MUSIC_VIDEO_MULT - 1) * 100));
  });

  test('the "Models & prices" table: one row per tier, cheapest first, every cell the quote', () => {
    const rows = videoPriceRows('documentary');
    expect(rows.map((r) => r.tier)).toEqual(['lite', 'fast', 'standard']);
    for (const row of rows) {
      expect(row.prices.map((p) => p.seconds)).toEqual([...PRICE_TABLE_LENGTHS]);
      for (const p of row.prices) expect(p.credits).toBe(quoteCredits({ tool: 'video', seconds: p.seconds, quality: row.tier, mode: 'documentary' }));
    }
    const mv = videoPriceRows('musicvideo', [8]);
    expect(mv[1]!.prices[0]!.credits).toBe(quoteCredits({ tool: 'video', seconds: 8, quality: 'fast', mode: 'musicvideo' }));
  });

  test('the hero titles', () => {
    expect(VIDEO_TIER_TITLE).toEqual({ lite: 'VEO 3.1 LITE', fast: 'VEO 3.1 FAST', standard: 'VEO 3.1' });
  });
});

describe('what is open: long-form is locked unless the server says it is open', () => {
  const open = { longform: true, maxSeconds: VIDEO_MAX_SEC };

  test('closed (the default, and the answer when the server cannot be reached): everything up to 1:36 is open, 1:44 and above is locked', () => {
    for (const s of VIDEO_DURATION_STOPS) expect(isLengthLocked(s, CLOSED_CAPABILITIES)).toBe(videoRoute(s) === 'longform');
    expect(isLengthLocked(96, CLOSED_CAPABILITIES)).toBe(false);
    expect(isLengthLocked(104, CLOSED_CAPABILITIES)).toBe(true);
    expect(isLengthLocked(240, CLOSED_CAPABILITIES)).toBe(true);
  });

  test('open: nothing is locked up to the server’s maximum, and a tier ceiling below 240 locks only what is above it', () => {
    for (const s of VIDEO_DURATION_STOPS) expect(isLengthLocked(s, open)).toBe(false);
    expect(isLengthLocked(240, { longform: true, maxSeconds: 120 })).toBe(true);
    expect(isLengthLocked(120, { longform: true, maxSeconds: 120 })).toBe(false);
  });

  test('the slider can never go past the last open stop', () => {
    expect(VIDEO_DURATION_STOPS[lastOpenStopIndex(CLOSED_CAPABILITIES)]).toBe(FILM_MAX_SEC);
    expect(VIDEO_DURATION_STOPS[lastOpenStopIndex(open)]).toBe(VIDEO_MAX_SEC);
    expect(VIDEO_DURATION_STOPS[lastOpenStopIndex({ longform: true, maxSeconds: 120 })]).toBe(120);
  });

  test('durationOptions lists every stop once, with its route, its scene count and its lock', () => {
    const opts = durationOptions(CLOSED_CAPABILITIES);
    expect(opts.map((o) => o.seconds)).toEqual([...VIDEO_DURATION_STOPS]);
    expect(opts.filter((o) => o.locked).map((o) => o.seconds)).toEqual(VIDEO_DURATION_STOPS.filter((s) => s >= 104));
    expect(opts[0]).toEqual({ seconds: 4, route: 'single', scenes: 1, locked: false });
    expect(opts.find((o) => o.seconds === 240)).toEqual({ seconds: 240, route: 'longform', scenes: 30, locked: true });
  });

  test('a stored or typed length is snapped to the grid and pulled back out of a lock', () => {
    expect(openDuration(30, CLOSED_CAPABILITIES)).toBe(32);
    expect(openDuration(5, CLOSED_CAPABILITIES)).toBe(6);
    expect(openDuration(240, CLOSED_CAPABILITIES)).toBe(FILM_MAX_SEC);
    expect(openDuration(240, open)).toBe(240);
    expect(openDuration('garbage', CLOSED_CAPABILITIES)).toBe(8);
  });

  test('the studio cannot order a long-form film yet, so even an OPEN server leaves 1:44 – 4:00 locked until the ordering is wired', () => {
    expect(LONGFORM_ORDER_WIRED).toBe(false);
    const eff = effectiveCapabilities(open);
    expect(eff).toBe(CLOSED_CAPABILITIES);
    expect(isLengthLocked(104, eff)).toBe(true);
    expect(isLengthLocked(240, eff)).toBe(true);
    // …and the gate itself works the moment it is wired: the server's answer then decides, and only the server's.
    expect(effectiveCapabilities(open, true)).toBe(open);
    expect(isLengthLocked(240, effectiveCapabilities(open, true))).toBe(false);
    expect(isLengthLocked(240, effectiveCapabilities(CLOSED_CAPABILITIES, true))).toBe(true);
  });

  test('the capabilities answer is read strictly: only an explicit `longform: true` opens anything', () => {
    expect(parseVideoCapabilities({ longform: true, maxSeconds: 240 })).toEqual({ longform: true, maxSeconds: 240 });
    expect(parseVideoCapabilities({ longform: true, maxSeconds: 9999 })).toEqual({ longform: true, maxSeconds: 240 });
    expect(parseVideoCapabilities({ longform: true, maxSeconds: 3 })).toEqual({ longform: true, maxSeconds: FILM_MAX_SEC });
    expect(parseVideoCapabilities({ longform: true })).toEqual({ longform: true, maxSeconds: 240 });
    for (const bad of [null, undefined, 'yes', 1, [], {}, { longform: 'true' }, { longform: 1 }, { longform: false, maxSeconds: 240 }]) {
      expect(parseVideoCapabilities(bad)).toBe(CLOSED_CAPABILITIES);
    }
  });
});

describe('the render', () => {
  test('a 4 s or 6 s clip renders 720p, from 8 s it renders 1080p', () => {
    expect([4, 6].map(videoResolution)).toEqual(['720p', '720p']);
    expect([8, 16, 96, 240].map(videoResolution)).toEqual(['1080p', '1080p', '1080p', '1080p']);
  });

  test('the wait estimate keeps the three measured points and only ever grows', () => {
    expect(videoWaitSecs(8)).toBe(120);
    expect(videoWaitSecs(24)).toBe(300);
    expect(videoWaitSecs(48)).toBe(440);
    let prev = 0;
    for (const s of VIDEO_DURATION_STOPS) {
      const w = videoWaitSecs(s);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  test('the music video’s intro keeps its three old values for 8 / 24 / 48 s and is defined, and only grows, everywhere between', () => {
    expect([8, 24, 48].map(musicVideoIntroSec)).toEqual([2, 10, 13]);
    expect([4, 6].map(musicVideoIntroSec)).toEqual([2, 2]);
    expect([16, 32, 40].map(musicVideoIntroSec)).toEqual([10, 10, 10]);
    expect([56, 96, 240].map(musicVideoIntroSec)).toEqual([13, 13, 13]);
    let prev = 0;
    for (const s of VIDEO_DURATION_STOPS) { const v = musicVideoIntroSec(s); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });

  test('the free slot pays only for ONE short clip: a slot left AND ≤ 8 s', () => {
    expect(TRIAL.freeFilmMaxSeconds).toBe(8);
    expect(freeSlotApplies(1, 4)).toBe(true);
    expect(freeSlotApplies(3, 8)).toBe(true);
    expect(freeSlotApplies(1, 16)).toBe(false);
    expect(freeSlotApplies(1, 240)).toBe(false);
    expect(freeSlotApplies(0, 8)).toBe(false);
    expect(freeSlotApplies(null, 8)).toBe(false);
    expect(freeSlotApplies(undefined, 8)).toBe(false);
  });
});

describe('inserting an @reference into the prompt', () => {
  test('names are @image1, @image2 …', () => {
    expect([0, 1, 2].map(referenceToken)).toEqual(['@image1', '@image2', '@image3']);
  });

  test('an empty prompt gets the token and a trailing space, caret after it', () => {
    expect(insertPromptToken('', 0, 0, '@image1')).toEqual({ value: '@image1 ', caret: 8 });
  });

  test('at the end of a sentence: one space before, one after, none doubled', () => {
    expect(insertPromptToken('A rider with', 12, 12, '@image1')).toEqual({ value: 'A rider with @image1 ', caret: 21 });
    expect(insertPromptToken('A rider with ', 13, 13, '@image1')).toEqual({ value: 'A rider with @image1 ', caret: 21 });
  });

  test('in the middle: the surrounding words keep their own spacing', () => {
    const r = insertPromptToken('A rider  crosses', 7, 7, '@image2');
    expect(r.value).toBe('A rider @image2  crosses');
    expect(r.value.slice(0, r.caret)).toBe('A rider @image2');
    expect(insertPromptToken('A  crosses', 2, 2, '@image2').value).toBe('A @image2 crosses');
  });

  test('a selection is replaced; a reversed or out-of-range selection is clamped, never thrown on', () => {
    expect(insertPromptToken('A rider crosses', 2, 7, '@image1').value).toBe('A @image1 crosses');
    expect(insertPromptToken('abc', 99, 99, '@image1').value).toBe('abc @image1 ');
    expect(insertPromptToken('abc', -5, -9, '@image1').value).toBe('@image1 abc');
    expect(insertPromptToken('abc def', 7, 4, '@image1').value).toBe('abc @image1 ');
  });
});

describe('the Extend request contract', () => {
  const base = { direction: 'sequel' as const, prompt: 'she turns and walks away', sourceVideoUrl: 'https://cdn.example/clip.mp4', seconds: 8, quality: 'fast' as const };

  test('a complete sequel is built, trimmed, with no price and no credits anywhere in it', () => {
    const v = buildExtendRequest({ ...base, prompt: '  she turns and walks away  ', referenceImageUrls: ['https://cdn.example/a.jpg'], soundtrackUrl: 'https://cdn.example/s.mp3' });
    expect(v).toEqual({
      ok: true,
      request: { direction: 'sequel', prompt: 'she turns and walks away', sourceVideoUrl: base.sourceVideoUrl, seconds: 8, quality: 'fast', referenceImageUrls: ['https://cdn.example/a.jpg'], soundtrackUrl: 'https://cdn.example/s.mp3' },
    });
    expect(JSON.stringify(v)).not.toMatch(/credit|price|cost|gel/i);
  });

  test('a prequel is impossible (Veo has no last-frame-only mode) and is the only thing marked unsupported', () => {
    expect(EXTEND_DIRECTIONS).toEqual([{ id: 'sequel', supported: true }, { id: 'prequel', supported: false }]);
    expect(buildExtendRequest({ ...base, direction: 'prequel' })).toEqual({ ok: false, reasons: ['direction_unsupported'] });
  });

  test('every missing piece is reported at once', () => {
    expect(buildExtendRequest({ ...base, prompt: '   ', sourceVideoUrl: null })).toEqual({ ok: false, reasons: ['prompt_required', 'video_required'] });
    expect(buildExtendRequest({ ...base, seconds: 12 })).toEqual({ ok: false, reasons: ['seconds_invalid'] });
    expect(buildExtendRequest({ ...base, prompt: 'x'.repeat(4001) })).toEqual({ ok: false, reasons: ['prompt_too_long'] });
  });

  test('the new clip is ONE Veo clip (4, 6 or 8 s) and references are capped at Veo’s three', () => {
    for (const seconds of [4, 6, 8]) expect(buildExtendRequest({ ...base, seconds }).ok).toBe(true);
    for (const seconds of [0, 5, 7, 9, 16]) expect(buildExtendRequest({ ...base, seconds }).ok).toBe(false);
    const four = ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg', 'https://a/4.jpg'];
    expect(buildExtendRequest({ ...base, referenceImageUrls: four })).toEqual({ ok: false, reasons: ['too_many_references'] });
  });

  test('only https URLs are accepted — the server fetches them on our behalf', () => {
    expect(buildExtendRequest({ ...base, sourceVideoUrl: 'http://cdn.example/clip.mp4' })).toEqual({ ok: false, reasons: ['url_not_https'] });
    expect(buildExtendRequest({ ...base, referenceImageUrls: ['data:image/png;base64,AAA'] })).toEqual({ ok: false, reasons: ['url_not_https'] });
    expect(buildExtendRequest({ ...base, soundtrackUrl: 'javascript:alert(1)' })).toEqual({ ok: false, reasons: ['url_not_https'] });
  });
});

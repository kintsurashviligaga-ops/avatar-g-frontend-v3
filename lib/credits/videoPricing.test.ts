import { CREDIT_COSTS } from './pricing';
import { VIDEO_DURATION_STOPS } from '@/lib/video/duration';
import { MUSIC_VIDEO_MULT, VIDEO_CREDITS_PER_SEC, filmSecondsFromClips, perSceneCredits, videoCredits } from './videoPricing';
import { quoteCredits, creditsLabel, motionCredits, productAdCredits, productAdSeconds, PRODUCT_AD_PRICING } from './quote';
import { genjutsuCredits } from '../genjutsu/pricing';
import { PRICE_BOOK, clipCredits, filmCredits, sceneCredits } from './priceBook';

describe('video price by the second', () => {
  test('anchored on the price book: the shortest film, 8 s on Fast, is 75 credits — its base, one clip and one scene', () => {
    expect(videoCredits({ seconds: 8 })).toBe(CREDIT_COSTS.video_30s);
    expect(videoCredits({ seconds: 8 })).toBe(PRICE_BOOK.filmBase + PRICE_BOOK.clip.fast + PRICE_BOOK.filmScene);
    expect(videoCredits({ seconds: 8 })).toBe(75);
    // The estimate's unit (the director's plan): one Fast scene's price per second.
    expect(VIDEO_CREDITS_PER_SEC * 8).toBe(sceneCredits('fast'));
  });

  test('the whole ladder, Fast: 4 s 43 · 6 s 59 · 8 s 75 · 16 s 146 · 24 s 217 · 48 s 430 · 96 s 856 · 240 s 2134', () => {
    const stops = [4, 6, 8, 16, 24, 48, 96, 240];
    expect(stops.map((seconds) => videoCredits({ seconds }))).toEqual([43, 59, 75, 146, 217, 430, 856, 2134]);
    expect(stops.map((seconds) => videoCredits({ seconds }))).toEqual(stops.map((seconds) => filmCredits(seconds, 'fast')));
  });

  test('longer always costs more (no stop is cheaper than the one before) and the price is a whole credit', () => {
    let prev = 0;
    for (const s of VIDEO_DURATION_STOPS) {
      const c = videoCredits({ seconds: s });
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  test('the tier sets the clip price: 8 s → Lite 54, Fast 75, Standard 224', () => {
    expect(videoCredits({ seconds: 8, quality: 'lite' })).toBe(54);
    expect(videoCredits({ seconds: 8, quality: 'fast' })).toBe(75);
    expect(videoCredits({ seconds: 8, quality: 'standard' })).toBe(224);
    expect(videoCredits({ seconds: 240, quality: 'standard' })).toBe(filmCredits(240, 'standard'));
  });

  test('a music video adds the sung song to every scene', () => {
    expect(MUSIC_VIDEO_MULT).toBe(sceneCredits('fast', true) / sceneCredits('fast'));
    expect(videoCredits({ seconds: 24, mode: 'musicvideo' })).toBe(videoCredits({ seconds: 24, mode: 'documentary' }) + 3 * PRICE_BOOK.musicVideoSongPerScene);
    expect(videoCredits({ seconds: 24, mode: 'musicvideo' })).toBe(223);
    expect(videoCredits({ seconds: 24, mode: 'documentary' })).toBe(217);
  });

  test('out-of-range or garbage input is clamped to 4 … 240 s, never free and never negative', () => {
    const shortest = filmCredits(4, 'fast');
    expect(videoCredits({ seconds: 0 })).toBe(shortest);
    expect(videoCredits({ seconds: -50 })).toBe(shortest);
    expect(videoCredits({ seconds: 10_000 })).toBe(filmCredits(240, 'fast'));
    expect(videoCredits({ seconds: Number.NaN })).toBe(shortest);
  });
});

describe('the film’s real length from its clips (what the assemble step charges)', () => {
  test('sums the reported clip lengths; a clip with no length counts as the 8 s grid', () => {
    expect(filmSecondsFromClips([{ durationSec: 8 }, { durationSec: 8 }, { durationSec: 8 }])).toBe(24);
    expect(filmSecondsFromClips([{ durationSec: 6 }, {}, { durationSec: null }])).toBe(22);
  });
  test('clamped to the studio’s range', () => {
    expect(filmSecondsFromClips([])).toBe(4);
    expect(filmSecondsFromClips(Array.from({ length: 40 }, () => ({ durationSec: 8 })))).toBe(240);
  });
  test('a refund of one scene is the film price split evenly, rounded DOWN (never refunds more than was taken)', () => {
    expect(perSceneCredits(150, 6)).toBe(25);
    expect(perSceneCredits(100, 3)).toBe(33);
    expect(perSceneCredits(100, 0)).toBe(0);
  });
});

describe('quote — the number on the button', () => {
  test('image × count, music by length, avatar, remix/swap/motion, 3D, chat free — all from creditCostFor', () => {
    expect(quoteCredits({ tool: 'image' })).toBe(CREDIT_COSTS.image_generate);
    expect(quoteCredits({ tool: 'image', count: 4 })).toBe(CREDIT_COSTS.image_generate * 4);
    expect(quoteCredits({ tool: 'music', seconds: 30 })).toBe(CREDIT_COSTS.music_30s);
    expect(quoteCredits({ tool: 'music', seconds: 60 })).toBe(CREDIT_COSTS.music_60s);
    expect(quoteCredits({ tool: 'music', seconds: 90 })).toBe(CREDIT_COSTS.music_90s);
    expect(quoteCredits({ tool: 'avatar' })).toBe(CREDIT_COSTS.avatar_30s);
    for (const tool of ['remix', 'swap', 'motion'] as const) expect(quoteCredits({ tool })).toBe(CREDIT_COSTS.remix_video);
    expect(quoteCredits({ tool: 'model3d' })).toBe(CREDIT_COSTS.model3d);
    expect(quoteCredits({ tool: 'chat' })).toBe(0);
  });

  test('a Motion Control press is the render, plus lip-sync\'s own avatar price when it speaks (the two routes\' reservations)', () => {
    expect(motionCredits()).toBe(CREDIT_COSTS.remix_video);
    expect(motionCredits({ lipsync: true })).toBe(CREDIT_COSTS.remix_video + CREDIT_COSTS.avatar_30s);
  });

  test('video goes through videoCredits; a product ad costs what a Fast film of its length costs (the length rule, live)', () => {
    expect(quoteCredits({ tool: 'video', seconds: 48 })).toBe(videoCredits({ seconds: 48 }));
    expect(quoteCredits({ tool: 'video', seconds: 24, mode: 'musicvideo' })).toBe(videoCredits({ seconds: 24, mode: 'musicvideo' }));
    // 8 / 24 / 48 s render 1 / 3 / 6 Veo Fast clips and cost what a film of that length costs (PRD v2 §1.1, 2026-10-18).
    expect(PRODUCT_AD_PRICING).toBe('length');
    expect([8, 24, 48].map((seconds) => quoteCredits({ tool: 'product', seconds }))).toEqual([75, 217, 430]);
    expect([8, 24, 48].map((seconds) => productAdCredits(seconds, 'length'))).toEqual(
      [8, 24, 48].map((seconds) => quoteCredits({ tool: 'video', seconds })),
    );
    expect(quoteCredits({ tool: 'product' })).toBe(CREDIT_COSTS.video_30s);
    // A length between the offered ones pays for the next one up; nonsense pays for one clip.
    expect([undefined, 0, -5, Number.NaN, 6, 8, 9, 24, 25, 60, 999].map((s) => productAdSeconds(s))).toEqual(
      [8, 8, 8, 8, 8, 8, 24, 24, 48, 48, 48],
    );
  });

  test('a VFX scene is quoted with the price its route charges (one 8 s Veo clip), never as a remix', () => {
    expect(quoteCredits({ tool: 'vfx' })).toBe(genjutsuCredits({ op: 'scene', quality: 'fast' }));
    expect(quoteCredits({ tool: 'vfx', quality: 'standard' })).toBe(genjutsuCredits({ op: 'scene', quality: 'standard' }));
    expect([quoteCredits({ tool: 'vfx' }), quoteCredits({ tool: 'vfx', quality: 'standard' })]).toEqual([clipCredits('fast'), clipCredits('standard')]);
    expect([quoteCredits({ tool: 'vfx' }), quoteCredits({ tool: 'vfx', quality: 'standard' })]).toEqual([64, 213]);
    // A tier the scene does not offer (Lite takes no references) prices as Fast, its default — never cheaper.
    expect(quoteCredits({ tool: 'vfx', quality: 'lite' })).toBe(clipCredits('fast'));
  });

  test('the credits word: English plural, Georgian invariant, Russian 1 / 2-4 / 5+ with the 11-14 exception', () => {
    expect(creditsLabel(1, 'en')).toBe('1 credit');
    expect(creditsLabel(25, 'en')).toBe('25 credits');
    expect(creditsLabel(25, 'ka')).toBe('25 კრედიტი');
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => creditsLabel(n, 'ru'))).toEqual([
      '1 кредит', '2 кредита', '5 кредитов', '11 кредитов', '21 кредит', '22 кредита', '25 кредитов',
    ]);
  });
});

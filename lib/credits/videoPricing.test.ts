import { CREDIT_COSTS } from './pricing';
import { VIDEO_DURATION_STOPS } from '@/lib/video/duration';
import { MUSIC_VIDEO_MULT, VIDEO_CREDITS_PER_SEC, filmSecondsFromClips, perSceneCredits, videoCredits } from './videoPricing';
import { quoteCredits, creditsLabel, PRODUCT_AD_SECONDS } from './quote';

describe('video price by the second', () => {
  test('anchored on the owner’s number: one 8 s clip on Fast is 25 credits — the unit the plan pools are built on', () => {
    expect(VIDEO_CREDITS_PER_SEC * 8).toBe(CREDIT_COSTS.video_30s);
    expect(videoCredits({ seconds: 8 })).toBe(25);
  });

  test('the whole ladder, Fast: 4 s 13 · 6 s 19 · 8 s 25 · 16 s 50 · 24 s 75 · 48 s 150 · 96 s 300 · 240 s 750', () => {
    expect([4, 6, 8, 16, 24, 48, 96, 240].map((seconds) => videoCredits({ seconds }))).toEqual([13, 19, 25, 50, 75, 150, 300, 750]);
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

  test('quality scales it: Lite 0.6×, Standard 3.3× (8 s → 15 and 83)', () => {
    expect(videoCredits({ seconds: 8, quality: 'lite' })).toBe(15);
    expect(videoCredits({ seconds: 8, quality: 'fast' })).toBe(25);
    expect(videoCredits({ seconds: 8, quality: 'standard' })).toBe(83);
    expect(videoCredits({ seconds: 240, quality: 'standard' })).toBe(2475);
  });

  test('a music video is 1.4× the same film', () => {
    expect(MUSIC_VIDEO_MULT).toBe(1.4);
    expect(videoCredits({ seconds: 24, mode: 'musicvideo' })).toBe(105);
    expect(videoCredits({ seconds: 24, mode: 'documentary' })).toBe(75);
  });

  test('out-of-range or garbage input is clamped to 4 … 240 s, never free and never negative', () => {
    expect(videoCredits({ seconds: 0 })).toBe(13);
    expect(videoCredits({ seconds: -50 })).toBe(13);
    expect(videoCredits({ seconds: 10_000 })).toBe(750);
    expect(videoCredits({ seconds: Number.NaN })).toBe(13);
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

  test('video goes through videoCredits; the product ad keeps its flat one-clip price', () => {
    expect(quoteCredits({ tool: 'video', seconds: 48 })).toBe(150);
    expect(quoteCredits({ tool: 'video', seconds: 24, mode: 'musicvideo' })).toBe(105);
    expect(PRODUCT_AD_SECONDS).toBe(6);
    expect(quoteCredits({ tool: 'product' })).toBe(CREDIT_COSTS.video_30s);
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

/**
 * lib/credits/priceBook.test.ts — every number in THE price book is the owner's rule applied to its cost.
 *
 * The rule (PRD v2 §1.1, 2026-10-18): a price earns 100 % profit over the operation's full cost — twice the API cost plus
 * the bank's fee on the price, rounded UP to a whole credit. lib/credits/unitEconomics holds the costs and the formula;
 * this file recomputes every literal in lib/credits/priceBook from them, so a cost change turns it red instead of moving a
 * Production price silently, and no price can fall under the rule. It also pins that the live price functions (the
 * buttons and the routes) read the book, so the number on a button is the book's number.
 */
import {
  PRICE_BOOK,
  clipCredits,
  filmCredits,
  filmScenes,
  FULL_SONG_SEC,
  musicCredits,
  remixSceneCredits,
  sceneCredits,
  veoRenderedSeconds,
  veoSecondsCredits,
  type ClipTier,
} from './priceBook';
import { clipCostGel, deckCostGel, opCostGel, profitOverCostOf, ruleCredits, ruleCreditsForCost, unitOp, videoCostGel } from './unitEconomics';
import { CREDIT_COSTS, creditCostFor } from './pricing';
import { productAdCredits, quoteCredits } from './quote';
import { videoCredits } from './videoPricing';
import { genjutsuCredits } from '@/lib/genjutsu/pricing';
import { remixOpCredits } from '@/lib/video/remixCharge';
import { RESEARCH_CREDITS } from '@/lib/research/pricing';
import { MUSIC_TIER_SEC, musicTierFor } from './musicSettlement';
import { PRODUCE_COST } from '@/lib/orchestrator/produceCost';

const TIERS: readonly ClipTier[] = ['lite', 'fast', 'standard'];
const rule = (id: string): number => ruleCredits(unitOp(id));

describe('every literal is the rule price of its cost', () => {
  it.each(TIERS)('one 8 s %s clip', (tier) => {
    expect(PRICE_BOOK.clip[tier]).toBe(ruleCreditsForCost(clipCostGel(8, tier)));
  });

  it.each(TIERS)('a bare 4 s and 6 s %s clip', (tier) => {
    expect(PRICE_BOOK.shortClip[tier][4]).toBe(ruleCreditsForCost(clipCostGel(4, tier)));
    expect(PRICE_BOOK.shortClip[tier][6]).toBe(ruleCreditsForCost(clipCostGel(6, tier)));
  });

  it('the film parts: scene extras, the film base, the music video song', () => {
    expect(PRICE_BOOK.filmScene).toBe(rule('video.film.scene'));
    expect(PRICE_BOOK.filmBase).toBe(rule('video.film.base'));
    expect(PRICE_BOOK.musicVideoSongPerScene).toBe(rule('video.music-video.song'));
  });

  it('image, interior plan, remix voice-over and own music, research, dubbing', () => {
    expect(PRICE_BOOK.image).toBe(rule('image.one'));
    expect(PRICE_BOOK.interiorPlan).toBe(rule('image.interior.plan3d'));
    expect(PRICE_BOOK.remixVoiceover).toBe(rule('video.remix.voiceover'));
    expect(PRICE_BOOK.remixMusic).toBe(rule('video.remix.music'));
    expect(PRICE_BOOK.research).toBe(rule('research.deep'));
    expect(PRICE_BOOK.dubbingPerMinute).toBe(rule('voice.dubbing.minute'));
  });

  it('music by band: each band pays for its longest track that bills at it', () => {
    expect(PRICE_BOOK.music.under60).toBe(rule('music.track.30'));
    expect(PRICE_BOOK.music.under90).toBe(rule('music.track.60'));
    expect(PRICE_BOOK.music.from90).toBe(rule('music.track.90'));
    expect(PRICE_BOOK.music.fullSong).toBe(rule('music.track.180'));
  });

  it('over 30 s is Lyria 3 Pro at one flat price a song, so 60 s, 90 s and the full song cost the same', () => {
    expect(['music.track.60', 'music.track.90', 'music.track.180'].map((id) => unitOp(id).model)).toEqual(Array(3).fill('lyria-3-pro-preview'));
    expect(unitOp('music.track.30').model).toBe('lyria-3-clip-preview');
    expect(musicCredits(FULL_SONG_SEC)).toBe(PRICE_BOOK.music.fullSong);
  });

  it('a deck of up to 12 illustrated slides', () => {
    expect(PRICE_BOOK.presentationDeck).toBe(ruleCreditsForCost(deckCostGel(12)));
  });
});

describe('no price earns less than 100 % over its cost', () => {
  it('every literal earns at least 100 %, and one credit less would not', () => {
    const lines: Array<[number, number]> = [
      ...TIERS.map((t): [number, number] => [PRICE_BOOK.clip[t], clipCostGel(8, t)]),
      [PRICE_BOOK.filmScene, opCostGel(unitOp('video.film.scene'))],
      [PRICE_BOOK.image, opCostGel(unitOp('image.one'))],
      [PRICE_BOOK.music.under90, opCostGel(unitOp('music.track.60'))],
      [PRICE_BOOK.music.fullSong, opCostGel(unitOp('music.track.180'))],
      [PRICE_BOOK.research, opCostGel(unitOp('research.deep'))],
      [PRICE_BOOK.presentationDeck, deckCostGel(12)],
    ];
    for (const [credits, cost] of lines) {
      expect(profitOverCostOf(credits, cost)).toBeGreaterThanOrEqual(1);
      expect(profitOverCostOf(credits - 1, cost)).toBeLessThan(1);
    }
  });

  it('a track bills at the band the delivered-length settlement uses (lib/credits/musicSettlement)', () => {
    // A full song settles at the 90 s band, so its row may not rise above that band's until musicSettlement has a 180 s tier.
    for (let sec = 1; sec <= 240; sec += 1) expect(musicCredits(sec)).toBe(musicCredits(musicTierFor(sec)));
    expect(MUSIC_TIER_SEC.map((s) => musicCredits(s))).toEqual([PRICE_BOOK.music.under60, PRICE_BOOK.music.under90, PRICE_BOOK.music.from90]);
  });

  it('a film of any length, grid, tier and mode earns 100 % on the seconds Veo really renders', () => {
    for (const tier of TIERS) {
      for (const musicVideo of [false, true]) {
        for (const referenceMode of [false, true]) {
          for (let clipSec = 4; clipSec <= 8; clipSec += 1) {
            for (let n = 1; n <= 30; n += 1) {
              const seconds = n * clipSec;
              const veoSeconds = n * veoRenderedSeconds(clipSec, referenceMode);
              const credits = filmCredits(seconds, tier, musicVideo, n, referenceMode);
              expect(profitOverCostOf(credits, videoCostGel(veoSeconds, tier, musicVideo, undefined, n))).toBeGreaterThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('a film quoted without its grid (the button) still covers the clips it will render', () => {
    for (const tier of TIERS) {
      for (let seconds = 4; seconds <= 240; seconds += 1) {
        const n = filmScenes(seconds);
        const veoSeconds = n * veoRenderedSeconds(seconds / n);
        expect(veoSeconds).toBeGreaterThanOrEqual(seconds);
        expect(profitOverCostOf(filmCredits(seconds, tier), videoCostGel(veoSeconds, tier, false, undefined, n))).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('one scene, and one remixed scene, of any grid earn 100 %', () => {
    for (const tier of TIERS) {
      for (let clipSec = 4; clipSec <= 8; clipSec += 1) {
        const veo = veoRenderedSeconds(clipSec);
        const sceneCost = videoCostGel(veo, tier, false, undefined, 1) - opCostGel(unitOp('video.film.base'));
        expect(profitOverCostOf(sceneCredits(tier, false, clipSec), sceneCost)).toBeGreaterThanOrEqual(1);
        expect(profitOverCostOf(remixSceneCredits(clipSec, tier), clipCostGel(veo, tier))).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('Veo bills the seconds it renders', () => {
  it('rounds a clip up to its 4 / 6 / 8 s grid, and pins reference mode to 8 s', () => {
    expect([4, 5, 6, 7, 8].map((s) => veoRenderedSeconds(s))).toEqual([4, 6, 6, 8, 8]);
    expect([4, 5, 6, 7, 8].map((s) => veoRenderedSeconds(s, true))).toEqual([8, 8, 8, 8, 8]);
  });

  it('a 5 s grid pays 6 s clips; an 8 s grid pays exactly its seconds', () => {
    expect(filmCredits(25, 'fast', false, 5)).toBe(PRICE_BOOK.filmBase + veoSecondsCredits(30) + 5 * PRICE_BOOK.filmScene);
    expect(filmCredits(24, 'fast', false, 3)).toBe(filmCredits(24));
  });
});

describe('the worked examples in docs/handoffs/pricing/PRICE_BOOK_2026-10-18.md', () => {
  it('films', () => {
    expect([8, 24, 48].map((s) => filmCredits(s))).toEqual([75, 217, 430]);
    expect(filmCredits(8, 'lite')).toBe(54);
    expect(filmCredits(8, 'standard')).toBe(224);
    expect(filmCredits(8, 'fast', true)).toBe(77);
    expect(sceneCredits('fast')).toBe(71);
    expect(TIERS.map((t) => clipCredits(t))).toEqual([43, 64, 213]);
    expect([4, 6, 8].map((s) => remixSceneCredits(s))).toEqual([33, 48, 64]);
  });
});

describe('the live price functions read the book', () => {
  it('creditCostFor and CREDIT_COSTS', () => {
    expect(creditCostFor('image', { count: 3 })).toBe(3 * PRICE_BOOK.image);
    const { under60, under90, from90, fullSong } = PRICE_BOOK.music;
    expect([30, 60, 90, 180].map((s) => creditCostFor('music', { seconds: s }))).toEqual([under60, under90, from90, fullSong]);
    expect(creditCostFor('video', { seconds: 24 })).toBe(filmCredits(24));
    expect(creditCostFor('avatar')).toBe(sceneCredits('fast'));
    expect(creditCostFor('remix')).toBe(PRICE_BOOK.remixVoiceover);
    expect(creditCostFor('dubbing', { seconds: 61 })).toBe(2 * PRICE_BOOK.dubbingPerMinute);
    expect(creditCostFor('presentation')).toBe(PRICE_BOOK.presentationDeck);
    expect(CREDIT_COSTS.video_30s).toBe(filmCredits(8));
  });

  it('the Generate buttons (quoteCredits) and the film quote', () => {
    expect(quoteCredits({ tool: 'video', seconds: 48, quality: 'standard' })).toBe(filmCredits(48, 'standard'));
    expect(quoteCredits({ tool: 'video', seconds: 8, mode: 'musicvideo' })).toBe(filmCredits(8, 'fast', true));
    expect(videoCredits({ seconds: 36, scenes: 6 })).toBe(filmCredits(36, 'fast', false, 6));
    expect(videoCredits({ seconds: 24, scenes: 4, referenceMode: true })).toBe(filmCredits(24, 'fast', false, 4, true));
    expect([8, 24, 48].map((s) => productAdCredits(s))).toEqual([8, 24, 48].map((s) => filmCredits(s)));
    expect(quoteCredits({ tool: 'vfx', quality: 'standard' })).toBe(clipCredits('standard'));
  });

  it('VFX, remix ops, research and Agent G production', () => {
    expect(genjutsuCredits({ op: 'scene', quality: 'fast' })).toBe(clipCredits('fast'));
    expect(remixOpCredits('music')).toBe(PRICE_BOOK.remixMusic);
    expect(remixOpCredits('voiceover')).toBe(PRICE_BOOK.remixVoiceover);
    expect(RESEARCH_CREDITS).toBe(PRICE_BOOK.research);
    expect(PRODUCE_COST).toEqual({
      film: filmCredits(8),
      avatar: sceneCredits('fast'),
      interior: PRICE_BOOK.interiorPlan,
      image: PRICE_BOOK.image,
      music: musicCredits(30),
      voice: PRICE_BOOK.remixVoiceover,
    });
  });
});

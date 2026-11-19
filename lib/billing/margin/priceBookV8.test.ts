/** @jest-environment node */
import { PRICE_BOOK, PRICE_BOOK_TODAY, PRICE_BOOK_V8, pricingV8Active } from '@/lib/credits/priceBook';
import { clipCostGel, deckCostGel, opCostUsd, unitOp, usdToCostGel } from '@/lib/credits/unitEconomics';
import { grossMargin, MARGIN_ECON, minCreditsPerUnit } from './econ';
import { computePriceBookV8 } from './priceBookV8';
import { liveAvatarMaxMs, liveAvatarTicketMs, LIVE_AVATAR_MAX_MS } from '@/lib/voice/liveAvatar';
import { liveAvatarAccess } from '@/lib/voice/liveAudience';
import { rowProblem, type PriceVersion } from '@/lib/billing/v5/priceVersions';

jest.mock('../../auth/adminGuard', () => ({ isAdminIdentity: async (u: { admin?: boolean } | null) => !!u?.admin }));

const leaves = (o: unknown, path = ''): Array<[string, number]> =>
  typeof o === 'number' ? [[path, o]] : Object.entries(o as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));

describe('PRICE_BOOK_V8 (literal numbers in the client-safe book)', () => {
  test('equals the engine: approved list first, else the 65 % rule', () => {
    expect(computePriceBookV8()).toEqual(PRICE_BOOK_V8);
  });

  test('has exactly the fields of today\'s book', () => {
    expect(leaves(PRICE_BOOK_V8).map(([k]) => k).sort()).toEqual(leaves(PRICE_BOOK_TODAY).map(([k]) => k).sort());
  });

  test('never cheaper than today (except the FFmpeg-only music lay-under, which stays 1)', () => {
    const today = new Map(leaves(PRICE_BOOK_TODAY));
    for (const [k, v] of leaves(PRICE_BOOK_V8)) {
      expect([k, v >= (today.get(k) as number)]).toEqual([k, true]);
      if (k !== 'remixMusic') expect([k, v > (today.get(k) as number)]).toEqual([k, true]);
    }
  });

  test('approved headline prices (README §2)', () => {
    expect(PRICE_BOOK_V8.omniClip['720p'][8]).toBe(66);
    expect(PRICE_BOOK_V8.omniClip['1080p'][8]).toBe(98);
    expect(PRICE_BOOK_V8.clip.fast).toBe(111);
    expect(PRICE_BOOK_V8.image).toBe(8);
    expect(PRICE_BOOK_V8.music.fullSong).toBe(11);
  });

  test('every row keeps ≥ 65 % at the 0.08 ₾ floor on the unitEconomics cost too', () => {
    const usd = (gel: number) => gel / usdToCostGel(1);
    const m = (credits: number, costUsd: number) => grossMargin(credits, costUsd, MARGIN_ECON.floorCreditGel);
    const min = MARGIN_ECON.minGrossMargin - 1e-9;
    for (const t of ['lite', 'fast', 'standard'] as const) {
      expect(m(PRICE_BOOK_V8.clip[t], usd(clipCostGel(8, t)))).toBeGreaterThanOrEqual(min);
      expect(m(PRICE_BOOK_V8.shortClip[t][4], usd(clipCostGel(4, t)))).toBeGreaterThanOrEqual(min);
      expect(m(PRICE_BOOK_V8.shortClip[t][6], usd(clipCostGel(6, t)))).toBeGreaterThanOrEqual(min);
    }
    for (const r of ['720p', '1080p'] as const)
      for (const s of [4, 6, 8, 10] as const) {
        expect(m(PRICE_BOOK_V8.omniClip[r][s], opCostUsd(unitOp(`video.omni.${r}.${s}`)))).toBeGreaterThanOrEqual(min);
        expect(m(PRICE_BOOK_V8.omniEdit[r][s], opCostUsd(unitOp(`video.omni-edit.${r}.${s}`)))).toBeGreaterThanOrEqual(min);
      }
    const singles: Array<[number, string]> = [
      [PRICE_BOOK_V8.filmScene, 'video.film.scene'], [PRICE_BOOK_V8.filmBase, 'video.film.base'],
      [PRICE_BOOK_V8.musicVideoSongPerScene, 'video.music-video.song'], [PRICE_BOOK_V8.image, 'image.one'],
      [PRICE_BOOK_V8.interiorPlan, 'image.interior.plan3d'], [PRICE_BOOK_V8.music.under60, 'music.track.30'],
      [PRICE_BOOK_V8.music.under90, 'music.track.60'], [PRICE_BOOK_V8.music.from90, 'music.track.90'],
      [PRICE_BOOK_V8.music.fullSong, 'music.track.180'], [PRICE_BOOK_V8.remixVoiceover, 'video.remix.voiceover'],
      [PRICE_BOOK_V8.remixMusic, 'video.remix.music'], [PRICE_BOOK_V8.research, 'research.deep'],
      [PRICE_BOOK_V8.dubbingPerMinute, 'voice.dubbing.minute'],
    ];
    for (const [c, id] of singles) expect([id, m(c, opCostUsd(unitOp(id))) >= min]).toEqual([id, true]);
    expect(m(PRICE_BOOK_V8.presentationDeck, usd(deckCostGel(12)))).toBeGreaterThanOrEqual(min);
  });
});

describe('the flag', () => {
  test('off unless NEXT_PUBLIC_PRICING_V8 is on / 1 / true', () => {
    for (const v of [undefined, '', '0', 'off', 'yes', 'ON ']) expect(pricingV8Active(v)).toBe(false);
    for (const v of ['on', '1', 'true']) expect(pricingV8Active(v)).toBe(true);
  });
  test('the test run (flag unset) charges today\'s book', () => {
    expect(PRICE_BOOK).toBe(PRICE_BOOK_TODAY);
  });
  test('flag on: every price helper reads the v8 book (and the toast/route numbers follow)', () => {
    const prev = process.env.NEXT_PUBLIC_PRICING_V8;
    process.env.NEXT_PUBLIC_PRICING_V8 = 'on';
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const book = require('../../credits/priceBook') as typeof import('@/lib/credits/priceBook');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pricing = require('../../credits/pricing') as typeof import('@/lib/credits/pricing');
        expect(book.PRICE_BOOK).toBe(book.PRICE_BOOK_V8);
        expect(book.omniClipCredits('720p', 8)).toBe(66);
        expect(pricing.creditCostFor('image')).toBe(8);
        expect(pricing.creditCostFor('music', { seconds: 180 })).toBe(11);
        expect(book.filmCredits(8)).toBe(6 + 111 + 12);
      });
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_PRICING_V8; else process.env.NEXT_PUBLIC_PRICING_V8 = prev;
    }
  });
});

describe('free live avatar: 1 minute a day under v8', () => {
  test('cap by plan', () => {
    expect(liveAvatarMaxMs({ v8: false, admin: false, paid: false })).toBe(LIVE_AVATAR_MAX_MS);
    expect(liveAvatarMaxMs({ v8: true, admin: false, paid: false })).toBe(60_000);
    expect(liveAvatarMaxMs({ v8: true, admin: false, paid: true })).toBe(LIVE_AVATAR_MAX_MS);
    expect(liveAvatarMaxMs({ v8: true, admin: true, paid: false })).toBe(LIVE_AVATAR_MAX_MS);
    expect(liveAvatarTicketMs(60_000)).toBe(120_000);
    expect(liveAvatarTicketMs()).toBe(LIVE_AVATAR_MAX_MS + 60_000);
  });
  test('liveAvatarAccess asks for the plan only under v8, and a failed lookup counts as free', async () => {
    const env = { LIVE_AVATAR_AUDIENCE: 'everyone' };
    const paid = jest.fn(async () => true);
    expect((await liveAvatarAccess({}, env, paid)).maxMs).toBe(LIVE_AVATAR_MAX_MS);
    expect(paid).not.toHaveBeenCalled();
    expect((await liveAvatarAccess({}, { ...env, NEXT_PUBLIC_PRICING_V8: 'on' }, async () => false)).maxMs).toBe(60_000);
    expect((await liveAvatarAccess({}, { ...env, NEXT_PUBLIC_PRICING_V8: 'on' }, paid)).maxMs).toBe(LIVE_AVATAR_MAX_MS);
    expect((await liveAvatarAccess({}, { ...env, NEXT_PUBLIC_PRICING_V8: 'on' }, async () => { throw new Error('db'); })).maxMs).toBe(60_000);
    expect((await liveAvatarAccess({ admin: true } as never, { NEXT_PUBLIC_PRICING_V8: 'on' })).maxMs).toBe(LIVE_AVATAR_MAX_MS);
  });
});

describe('price_versions rows under v8', () => {
  const row = (creditsPerUnit: number): PriceVersion => ({
    id: 'r1', capability: 'image', model: 'gemini-3.1-flash-image', unit: 'image', usdPerUnit: 0.039, creditsPerUnit,
    validFrom: '2026-11-01T00:00:00Z', validTo: null, promo: false, sourceUrl: 'https://cloud.google.com/vertex-ai/pricing',
    fetchedAt: '2026-11-14T00:00:00Z', approvedBy: 'GG',
  } as PriceVersion);
  test('a row at the 100 % rule passes today and fails the 65 % rule under v8', () => {
    const v8Min = minCreditsPerUnit(0.039);
    const r = row(Math.ceil(v8Min) - 1);
    expect(rowProblem(r, undefined, false)).toBeNull();
    expect(rowProblem(r, undefined, true)).toBe('credits below the 65 % margin rule');
    expect(rowProblem(row(v8Min), undefined, true)).toBeNull();
  });
});

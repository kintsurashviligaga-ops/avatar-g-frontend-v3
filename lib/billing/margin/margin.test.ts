/** @jest-environment node */
/** Phase 8.1: the 65 % gross-margin rule is enforced on every price and every package (GG 2026-11-14). */
import { COGS, fullCostUsd } from './cogs';
import { priceList, unpricedActions, USER_FACING_IDS } from './catalog';
import {
  MARGIN_ECON,
  costGelOf,
  creditsPerUsd,
  enforceMargin,
  grossMargin,
  minCredits,
  minCreditsPerUnit,
  netGelPerCredit,
  type MarginEcon,
} from './econ';
import { PLANS, TOPUPS, allPackageProblems, creditGelOf, packageProblems, whatYouGet } from './packages';

const M = MARGIN_ECON.minGrossMargin;

describe('the formula', () => {
  test('GG’s formula: price = cost ÷ (1 − 0.65), on what we keep from a floor credit', () => {
    // $1 → 2.7 × 1.05 = 2.835 ₾; net per floor credit = 0.08 × 0.97 = 0.0776 ₾; 2.835 ÷ 0.35 ÷ 0.0776 = 104.3814
    expect(creditsPerUsd()).toBeCloseTo(104.3814, 4);
    const credits = creditsPerUsd();
    const net = credits * netGelPerCredit(MARGIN_ECON.floorCreditGel);
    expect(net).toBeCloseTo(costGelOf(1) / (1 - M), 9);
  });

  test('minCredits is the smallest whole number at ≥ 65 %: one credit less breaks the rule', () => {
    for (const usd of [0.001, 0.0107, 0.04, 0.067, 0.3144, 0.6289, 1, 3.5248, 12.5]) {
      const c = minCredits(usd);
      expect(grossMargin(c, usd)).toBeGreaterThanOrEqual(M - 1e-9);
      if (c > 1) expect(grossMargin(c - 1, usd)).toBeLessThan(M);
    }
    expect(minCredits(0)).toBe(0);
    expect(() => minCredits(-1)).toThrow();
    expect(() => minCredits(NaN)).toThrow();
  });

  test('minCreditsPerUnit (price rows, 4 decimals) is the smallest value at ≥ 65 %', () => {
    for (const usd of [0.04, 1, 1.5, 7.5, 12, 18]) {
      const c = minCreditsPerUnit(usd);
      expect(grossMargin(c, usd)).toBeGreaterThanOrEqual(M - 1e-9);
      expect(grossMargin(Math.round((c - 1e-4) * 1e4) / 1e4, usd)).toBeLessThan(M);
    }
  });

  test('enforcement: a price under the rule is raised, a price above it is kept', () => {
    const cost = 0.6289; // 8 s Omni 720p
    expect(enforceMargin(38, cost)).toMatchObject({ credits: minCredits(cost), raised: true }); // today's ✦38 is raised to 66
    expect(enforceMargin(100, cost)).toMatchObject({ credits: 100, raised: false });
    expect(enforceMargin(0, cost).credits).toBe(minCredits(cost)); // never free
    expect(enforceMargin(NaN, cost).credits).toBe(minCredits(cost));
    expect(enforceMargin(65.2, cost).credits).toBe(66); // fractional asks round up
    for (const a of [1, 10, 50, 500]) expect(enforceMargin(a, cost).margin).toBeGreaterThanOrEqual(M - 1e-9);
  });

  test('VAT or a weaker lari raise prices automatically (the rule holds under any econ)', () => {
    const vat: MarginEcon = { ...MARGIN_ECON, vatRate: 0.18 };
    const weak: MarginEcon = { ...MARGIN_ECON, gelPerUsd: 3.1 };
    for (const e of [vat, weak]) {
      expect(creditsPerUsd(e)).toBeGreaterThan(creditsPerUsd());
      const c = minCredits(0.6289, e);
      expect(grossMargin(c, 0.6289, e.floorCreditGel, e)).toBeGreaterThanOrEqual(M - 1e-9);
    }
  });
});

describe('the price list', () => {
  const list = priceList();

  test('every price keeps ≥ 65 % at the cheapest credit and more at the sticker credit', () => {
    for (const r of list) {
      expect([r.id, r.marginFloor >= M - 1e-9]).toEqual([r.id, true]);
      expect(r.marginBase).toBeGreaterThan(r.marginFloor);
    }
  });

  test('every billable COGS action has a price; ids are unique; user-facing rows exist', () => {
    expect(unpricedActions()).toEqual([]);
    expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
    expect(USER_FACING_IDS.has('video.omni.720p.8s')).toBe(true);
    expect(USER_FACING_IDS.has('chat.message')).toBe(false);
  });

  test('the matrix uses full billed Google prices (not the 50 % credits-back promo)', () => {
    const tts = COGS.find((a) => a.id === 'voice.tts.minute')!;
    expect(tts.lines[0]!.usd).toBeCloseTo((1_500 * 18) / 1e6, 9);
    const omni = COGS.find((a) => a.id === 'video.omni.720p.second')!;
    expect(omni.lines[0]!.usd).toBeCloseTo((5_792 * 12) / 1e6, 9);
    for (const a of COGS) for (const l of a.lines) expect(l.url).toMatch(/^https:\/\//);
  });

  test('known anchors (a change here means a Google price or a rule input moved)', () => {
    const by = (id: string) => list.find((r) => r.id === id)!;
    expect(by('video.omni.720p.8s').credits).toBe(66);
    expect(by('image.1k').credits).toBe(8);
    expect(by('music.song').credits).toBe(11);
    expect(by('live.avatar.minute').credits).toBe(44);
    expect(fullCostUsd(COGS.find((a) => a.id === 'video.omni.720p.second')!) * 8).toBeCloseTo(by('video.omni.720p.8s').costUsd, 3);
  });
});

describe('packages', () => {
  test('no plan or top-up sells a credit under the floor, and none is over BOG’s 500 ₾ limit', () => {
    expect(allPackageProblems()).toEqual([]);
    for (const p of [...PLANS, ...TOPUPS]) if (p.priceGel > 0) expect(creditGelOf(p)).toBeGreaterThanOrEqual(MARGIN_ECON.floorCreditGel);
  });

  test('a package cheaper than the floor is refused, and so is one over the BOG limit', () => {
    expect(packageProblems({ id: 'x', priceGel: 100, credits: 1_300 })[0]).toMatch(/under the 0.08 ₾ floor/);
    expect(packageProblems({ id: 'y', priceGel: 600, credits: 6_000 })[0]).toMatch(/BOG/);
    expect(packageProblems({ id: 'free', priceGel: 0, credits: 50 })).toEqual([]);
  });

  test('plans get better per credit as they grow, and every plan is worth more than the same ₾ in top-ups', () => {
    const paid = PLANS.filter((p) => p.priceGel > 0);
    for (let i = 1; i < paid.length; i++) expect(creditGelOf(paid[i]!)).toBeLessThan(creditGelOf(paid[i - 1]!));
    for (const p of paid) expect(creditGelOf(p)).toBeLessThan(MARGIN_ECON.baseCreditGel);
  });

  test('“what you get” is computed from the price list', () => {
    const pro = PLANS.find((p) => p.id === 'pro')!;
    expect(whatYouGet(pro.credits)).toEqual({ videos8s720: 23, images1k: 193, songs: 140, avatarMinutes: 35, ttsMinutes: 516 });
  });

  test('the worst case for the business: every plan spent entirely on its lowest-margin action still keeps ≥ 65 %', () => {
    const worst = priceList().reduce((a, b) => (b.marginFloor < a.marginFloor ? b : a));
    for (const p of PLANS.filter((x) => x.priceGel > 0)) {
      const units = Math.floor(p.credits / worst.credits);
      const net = (p.priceGel * (1 - MARGIN_ECON.cardFee)) / (1 + MARGIN_ECON.vatRate);
      const cost = costGelOf(units * worst.costUsd);
      expect((net - cost) / net).toBeGreaterThanOrEqual(M - 1e-9);
    }
  });
});

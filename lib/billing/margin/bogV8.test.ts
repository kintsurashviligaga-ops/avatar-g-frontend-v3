/**
 * BOG checkout and renewal for the v8 plans (GG 2026-11-14 15:20Z, DRAFT, NEXT_PUBLIC_PRICING_V8 off). Pins: the literal
 * v8 table equals the approved packages, the flag-off catalogue is exactly today's, the flag-on catalogue sells the v8
 * plans and packs, renewals follow the subscription's own amount, and the top-up bonus follows the order row.
 */
import { BOG_PLAN_OFFERS_V8, BOG_TOPUPS_V8, BOG_TOPUP_PACKS_GEL_V8, renewalAllowanceCredits, topupBonusCreditsV8, topupCreditsV8 } from './bogV8';
import { PLANS, TOPUPS } from './packages';
import { BOG_PLAN_OFFERS, BOG_TOPUP_PACKS_GEL, bogPlanOffer, planPriceGel, resolvePlanTier, topupCredits } from '../bogCatalog';
import { grantTopupBonus, topupBonusFor } from '../bogSettlement';
import { monthlyAllowanceCredits } from '../tiers';

jest.mock('../wallet-ledger', () => ({ fulfillBogOrder: jest.fn(), grantPurchasedCredits: jest.fn(), recordBogRenewalFailure: jest.fn() }));

describe('the v8 BOG table is the approved price list', () => {
  test('plans equal packages.ts PLANS (Start 25 / Creator 55 / Pro 129 / Business 299)', () => {
    const paid = PLANS.filter((p) => p.priceGel > 0).map((p) => [p.id, p.priceGel, p.credits]);
    expect(BOG_PLAN_OFFERS_V8.map((o) => [o.planId, o.amountGel, o.credits])).toEqual(paid);
    expect(BOG_PLAN_OFFERS_V8.map((o) => o.tier)).toEqual(['starter', 'creator', 'pro', 'business']);
  });
  test('top-ups equal packages.ts TOPUPS, bonus on top of the 10-per-₾ wallet booking', () => {
    expect(BOG_TOPUPS_V8.map((t) => [t.amountGel, t.credits])).toEqual(TOPUPS.map((t) => [t.priceGel, t.credits]));
    expect(BOG_TOPUP_PACKS_GEL_V8).toEqual([10, 25, 50, 100]);
    expect([10, 25, 50, 100].map(topupCreditsV8)).toEqual([100, 260, 540, 1100]);
    expect([10, 25, 50, 100].map(topupBonusCreditsV8)).toEqual([0, 10, 40, 100]);
    expect(topupCreditsV8(33)).toBe(330);
    expect(topupCreditsV8(-1)).toBe(0);
  });
  test('every v8 plan fits under the BOG single-transaction limit (500 ₾)', () => {
    for (const o of BOG_PLAN_OFFERS_V8) expect(o.amountGel).toBeLessThanOrEqual(500);
  });
});

describe('bogCatalog with the flag OFF (production today) is unchanged', () => {
  test('defaults read the flag, which is off in tests', () => {
    expect(BOG_TOPUP_PACKS_GEL).toEqual([10, 20, 50]);
    expect(BOG_PLAN_OFFERS.map((o) => [o.tier, o.amountGel, o.credits])).toEqual([['starter', 54, 540], ['creator', 108, 1080], ['business', 216, 2160]]);
  });
  test('"pro" is still the pricing page alias of creator, and the Pro tier cannot be bought', () => {
    expect(resolvePlanTier('pro', false)).toBe('creator');
    expect(bogPlanOffer('pro', false)).toEqual({ tier: 'creator', amountGel: 108, credits: 1080 });
    expect(topupCredits(25, false)).toBe(250);
  });
});

describe('bogCatalog with the flag ON', () => {
  test('plans are the v8 offers, Pro included', () => {
    expect(['start', 'basic', 'creator', 'pro', 'business'].map((id) => bogPlanOffer(id, true))).toEqual([
      { tier: 'starter', amountGel: 25, credits: 280 },
      { tier: 'starter', amountGel: 25, credits: 280 },
      { tier: 'creator', amountGel: 55, credits: 650 },
      { tier: 'pro', amountGel: 129, credits: 1550 },
      { tier: 'business', amountGel: 299, credits: 3700 },
    ]);
    expect(planPriceGel('pro', true)).toBe(129);
    expect(bogPlanOffer('free', true)).toBeNull();
    expect(bogPlanOffer('enterprise', true)).toBeNull();
  });
  test('a top-up books its pack credits, bonus included', () => {
    expect([10, 25, 50, 100].map((g) => topupCredits(g, true))).toEqual([100, 260, 540, 1100]);
  });
});

describe('renewals follow the subscription, not the flag', () => {
  test('a v8 amount renews with the v8 allowance; a pre-launch amount keeps today\'s', () => {
    expect(renewalAllowanceCredits('starter', 25)).toBe(280);
    expect(renewalAllowanceCredits('creator', '55.00')).toBe(650);
    expect(renewalAllowanceCredits('pro', 129)).toBe(1550);
    expect(renewalAllowanceCredits('business', 299)).toBe(3700);
    expect(renewalAllowanceCredits('starter', 54)).toBe(monthlyAllowanceCredits('starter'));
    expect(renewalAllowanceCredits('creator', 108)).toBe(1080);
    expect(renewalAllowanceCredits('business', null)).toBe(2160);
    expect(renewalAllowanceCredits('free', 25)).toBe(0);
  });
});

describe('top-up bonus at settlement follows the order row', () => {
  const order = (amount: number, credits: number, kind: 'topup' | 'subscription' = 'topup') =>
    ({ kind, amount_gel: amount, credits, user_id: 'u1', shop_order_id: 'myavatar-topup-ab' });
  test('only a v8 row (credits above floor(amount × 10)) has a bonus', () => {
    expect(topupBonusFor(order(25, 260))).toBe(10);
    expect(topupBonusFor(order(100, 1100))).toBe(100);
    expect(topupBonusFor(order(20, 200))).toBe(0); // today's row
    expect(topupBonusFor(order(10, 100))).toBe(0);
    expect(topupBonusFor(order(129, 1550, 'subscription'))).toBe(0);
    expect(topupBonusFor({ kind: 'topup', amount_gel: '50.00', credits: 540 })).toBe(40);
  });
  test('grants it once under bog-bonus:<order>; no call when none is due; null on failure', async () => {
    const grant = jest.fn(async () => 1234);
    expect(await grantTopupBonus(order(50, 540), grant)).toBe(40);
    expect(grant).toHaveBeenCalledWith('u1', 40, 'bog-bonus:myavatar-topup-ab');
    grant.mockClear();
    expect(await grantTopupBonus(order(20, 200), grant)).toBe(0);
    expect(grant).not.toHaveBeenCalled();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await grantTopupBonus(order(25, 260), async () => null)).toBeNull();
    spy.mockRestore();
  });
});

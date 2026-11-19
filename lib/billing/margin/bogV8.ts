/**
 * lib/billing/margin/bogV8.ts — the approved v8 plans and top-ups (GG 2026-11-14 10:26Z) in the shape BOG checkout uses.
 * LITERALS on purpose: bogCatalog (client-side too) reads them, and importing packages.ts here would pull the whole
 * margin engine into the browser and close an import cycle (packages → bogCatalog). bogV8.test holds every number
 * equal to PLANS / TOPUPS in packages.ts, so the two cannot drift.
 *
 * Only read when NEXT_PUBLIC_PRICING_V8 is on (bogCatalog), except renewalAllowanceCredits, which is safe either way:
 * no pre-v8 subscription renews at a v8 amount.
 */
import type { PaidTierId } from '@/lib/billing/tiers';
import { monthlyAllowanceCredits } from '@/lib/billing/tiers';

export interface BogPlanOfferV8 {
  tier: PaidTierId;
  /** The plan's id in packages.ts PLANS. */
  planId: string;
  amountGel: number;
  credits: number;
}

/** Start → starter, Creator → creator, Pro → pro (new tier, sql/01_pro_tier.sql), Business → business. Ascending. */
export const BOG_PLAN_OFFERS_V8: readonly BogPlanOfferV8[] = [
  { tier: 'starter', planId: 'start', amountGel: 25, credits: 280 },
  { tier: 'creator', planId: 'creator', amountGel: 55, credits: 650 },
  { tier: 'pro', planId: 'pro', amountGel: 129, credits: 1550 },
  { tier: 'business', planId: 'business', amountGel: 299, credits: 3700 },
];

/** The v8 top-up packs: what is charged, and every credit it books (bonus included). */
export const BOG_TOPUPS_V8: readonly { amountGel: number; credits: number }[] = [
  { amountGel: 10, credits: 100 },
  { amountGel: 25, credits: 260 },
  { amountGel: 50, credits: 540 },
  { amountGel: 100, credits: 1100 },
];

export const BOG_TOPUP_PACKS_GEL_V8: readonly number[] = BOG_TOPUPS_V8.map((t) => t.amountGel);

const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

export function bogPlanOfferV8(tier: PaidTierId | null): BogPlanOfferV8 | null {
  return tier ? (BOG_PLAN_OFFERS_V8.find((o) => o.tier === tier) ?? null) : null;
}

/**
 * Credits one renewal grants. BOG renews at the FIRST order's amount (subscriptions.amount_gel), so a subscription bought
 * at a v8 price gets the v8 allowance and one bought before launch keeps today's. No v8 price equals today's price of the
 * same tier (25 / 55 / 299 vs 54 / 108 / 216 ₾; Pro did not exist), so the amount alone says which book it is on.
 */
export function renewalAllowanceCredits(tier: string | null | undefined, amountGel: number | string | null | undefined): number {
  const amount = Number(amountGel);
  const v8 = BOG_PLAN_OFFERS_V8.find((o) => o.tier === tier && Number.isFinite(amount) && same(o.amountGel, amount));
  return v8 ? v8.credits : monthlyAllowanceCredits(tier);
}

/** Credits a v8 top-up books: the pack's credits (bonus included) for a listed pack, else today's 10 per ₾. */
export function topupCreditsV8(amountGel: number): number {
  if (!(Number.isFinite(amountGel) && amountGel > 0)) return 0;
  const pack = BOG_TOPUPS_V8.find((t) => same(t.amountGel, amountGel));
  return pack ? pack.credits : Math.floor(amountGel * 10);
}

/** What credit_wallet_gel books for any top-up (bog_fulfill_order: floor(amount × 10)). */
export function walletBookedCredits(amountGel: number): number {
  return Number.isFinite(amountGel) && amountGel > 0 ? Math.floor(amountGel * 10) : 0;
}

/** The bonus a v8 top-up adds on top of what credit_wallet_gel books (floor(amount × 10)); granted separately. */
export function topupBonusCreditsV8(amountGel: number): number {
  return Math.max(0, topupCreditsV8(amountGel) - walletBookedCredits(amountGel));
}

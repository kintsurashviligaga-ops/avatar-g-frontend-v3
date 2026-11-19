/**
 * lib/billing/margin/bogV8.ts — the approved v8 plans and top-ups (GG 2026-11-14 10:26Z) in the shape BOG checkout uses.
 * Pure DATA for the BOG switch. Nothing in the live BOG path (bogCatalog, bogClient, bogSettlement, the renewal cron)
 * imports this yet: that switch touches live BOG code, so it is its own small PR on GG's word, after the DB-up test.
 *
 * Mapping onto today's paid tiers (subscriptions.tier): Start → starter, Creator → creator, Business → business. Pro
 * (129 ₾ / 1,550) has no tier in the database yet; it needs a 4th tier value before it can be sold.
 */
import type { PaidTierId } from '@/lib/billing/tiers';
import { monthlyAllowanceCredits } from '@/lib/billing/tiers';
import { PLANS, TOPUPS } from './packages';

const V8_PLAN_OF_TIER: Readonly<Record<PaidTierId, string>> = { starter: 'start', creator: 'creator', business: 'business' };

export interface BogPlanOfferV8 {
  tier: PaidTierId;
  planId: string;
  amountGel: number;
  credits: number;
}

export const BOG_PLAN_OFFERS_V8: readonly BogPlanOfferV8[] = (Object.keys(V8_PLAN_OF_TIER) as PaidTierId[]).map((tier) => {
  const p = PLANS.find((x) => x.id === V8_PLAN_OF_TIER[tier]);
  if (!p) throw new Error(`bogV8: no v8 plan for ${tier}`);
  return { tier, planId: p.id, amountGel: p.priceGel, credits: p.credits };
});

/**
 * Credits one renewal grants. BOG renews at the FIRST order's amount (subscriptions.amount_gel), so a subscription bought
 * at a v8 price gets the v8 allowance and one bought before launch keeps today's. No v8 price equals today's price of the
 * same tier (25/55/299 vs 54/108/216 ₾), so the amount alone says which book the subscription is on.
 */
export function renewalAllowanceCredits(tier: string | null | undefined, amountGel: number | string | null | undefined): number {
  const amount = Number(amountGel);
  const v8 = BOG_PLAN_OFFERS_V8.find((o) => o.tier === tier && Number.isFinite(amount) && Math.abs(o.amountGel - amount) < 0.005);
  return v8 ? v8.credits : monthlyAllowanceCredits(tier);
}

export const BOG_TOPUP_PACKS_GEL_V8 = TOPUPS.map((t) => t.priceGel);

/** Credits a v8 top-up books: the pack's credits (bonus included) for a listed pack, else today's 10 per ₾. */
export function topupCreditsV8(amountGel: number): number {
  if (!(Number.isFinite(amountGel) && amountGel > 0)) return 0;
  const pack = TOPUPS.find((t) => Math.abs(t.priceGel - amountGel) < 0.005);
  return pack ? pack.credits : Math.floor(amountGel * 10);
}

/** The bonus a v8 top-up adds on top of what credit_wallet_gel books today (floor(amount × 10)); granted separately. */
export function topupBonusCreditsV8(amountGel: number): number {
  return Math.max(0, topupCreditsV8(amountGel) - Math.floor((Number.isFinite(amountGel) && amountGel > 0 ? amountGel : 0) * 10));
}

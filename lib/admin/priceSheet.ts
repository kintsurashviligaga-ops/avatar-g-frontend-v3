/**
 * lib/admin/priceSheet.ts — the admin "Prices" tab: what one press of each paid button charges, what it costs us,
 * and whether the profit clears the owner's rule (profit ≥ 100 % of cost, i.e. price ≥ 2 × cost incl. bank fees).
 *
 * ⚠️ NO PRICE LIVES HERE. Every number is read from the pricing source of truth at call time: credits from
 * lib/credits/quote.ts (the same functions the buttons show and the routes charge), the credit's lari value and the
 * VAT / card-fee assumptions from lib/credits/unitEconomics.ts ECON, provider costs from its UNIT_OPS, plans from
 * lib/billing/tiers.ts + bogCatalog. When the pricing work changes those files, this tab shows the new prices with no
 * edit here. Pure and client-safe.
 */
import { quoteCredits, type QuoteInput } from '@/lib/credits/quote';
import { ECON, netGelPerCredit, opCostGel, unitOp, videoCostGel } from '@/lib/credits/unitEconomics';
import { PAID_TIER_IDS, TIERS, monthlyAllowanceCredits, type PaidTierId } from '@/lib/billing/tiers';
import { planPriceGel, BOG_CREDITS_PER_GEL } from '@/lib/billing/bogCatalog';

/** The owner's minimum: profit at least equal to cost (100 %). */
export const MIN_MARKUP = 1;

export interface PriceRow {
  id: string;
  label: { ka: string; en: string };
  credits: number;
  priceGel: number;
  /** Lari left after VAT and the card fee. */
  netGel: number;
  /** Full provider cost in lari (FX reserve and retries included); null = no allowed engine / unknown. */
  costGel: number | null;
  /** (net − cost) / cost; null when the cost is unknown or zero. */
  markup: number | null;
  ok: boolean | null;
}

export interface PlanRow {
  tier: PaidTierId;
  name: { ka: string; en: string };
  priceGel: number;
  credits: number;
  /** ₾ per credit inside the plan (top-ups are ECON.creditGel). */
  gelPerCredit: number;
}

interface Spec {
  id: string;
  label: { ka: string; en: string };
  quote: QuoteInput;
  cost: () => number | null;
}

const op = (id: string) => () => {
  const u = unitOp(id);
  return u.status === 'BLOCKED' ? null : opCostGel(u);
};

const SPECS: readonly Spec[] = [
  { id: 'video.8.fast', label: { ka: 'ვიდეო 8 წმ (Fast)', en: 'Video 8 s (Fast)' }, quote: { tool: 'video', seconds: 8, quality: 'fast' }, cost: () => videoCostGel(8, 'fast') },
  { id: 'video.24.fast', label: { ka: 'ვიდეო 24 წმ (Fast)', en: 'Video 24 s (Fast)' }, quote: { tool: 'video', seconds: 24, quality: 'fast' }, cost: () => videoCostGel(24, 'fast') },
  { id: 'video.8.standard', label: { ka: 'ვიდეო 8 წმ (Standard)', en: 'Video 8 s (Standard)' }, quote: { tool: 'video', seconds: 8, quality: 'standard' }, cost: () => videoCostGel(8, 'standard') },
  { id: 'video.24.musicvideo', label: { ka: 'მუსიკალური კლიპი 24 წმ', en: 'Music video 24 s' }, quote: { tool: 'video', seconds: 24, quality: 'fast', mode: 'musicvideo' }, cost: () => videoCostGel(24, 'fast', true) },
  { id: 'product.8', label: { ka: 'პროდუქტის რეკლამა 8 წმ', en: 'Product ad 8 s' }, quote: { tool: 'product', seconds: 8 }, cost: () => videoCostGel(8, 'fast') },
  { id: 'product.24', label: { ka: 'პროდუქტის რეკლამა 24 წმ', en: 'Product ad 24 s' }, quote: { tool: 'product', seconds: 24 }, cost: () => videoCostGel(24, 'fast') },
  { id: 'vfx', label: { ka: 'VFX სცენა 8 წმ', en: 'VFX scene 8 s' }, quote: { tool: 'vfx' }, cost: () => videoCostGel(8, 'fast') },
  { id: 'image.1', label: { ka: 'სურათი', en: 'Image' }, quote: { tool: 'image', count: 1 }, cost: op('image.one') },
  { id: 'photoshoot.4', label: { ka: 'ფოტოსესია, 4 კადრი', en: 'Photoshoot, 4 shots' }, quote: { tool: 'photoshoot', count: 4 }, cost: () => 4 * opCostGel(unitOp('image.one')) },
  { id: 'interior.1', label: { ka: 'ინტერიერი, 1 რენდერი', en: 'Interior, 1 render' }, quote: { tool: 'interior', count: 1 }, cost: op('image.one') },
  { id: 'music.30', label: { ka: 'მუსიკა 30 წმ', en: 'Music 30 s' }, quote: { tool: 'music', seconds: 30 }, cost: op('music.track.30') },
  { id: 'music.60', label: { ka: 'მუსიკა 60 წმ', en: 'Music 60 s' }, quote: { tool: 'music', seconds: 60 }, cost: op('music.track.60') },
  { id: 'music.180', label: { ka: 'სიმღერა 3 წთ', en: 'Song 3 min' }, quote: { tool: 'music', seconds: 180 }, cost: op('music.track.180') },
  { id: 'avatar', label: { ka: 'ავატარი', en: 'Avatar' }, quote: { tool: 'avatar' }, cost: op('avatar.talking') },
  { id: 'model3d', label: { ka: '3D მოდელი', en: '3D model' }, quote: { tool: 'model3d' }, cost: op('design.model3d') },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

function safeCost(fn: () => number | null): number | null {
  try {
    const c = fn();
    return c !== null && Number.isFinite(c) ? c : null;
  } catch {
    return null; // a unit op the pricing work renamed: show "—", never a wrong number
  }
}

export function buildPriceRows(): PriceRow[] {
  const net = netGelPerCredit();
  return SPECS.map((s) => {
    const credits = quoteCredits(s.quote);
    const costGel = safeCost(s.cost);
    const netGel = credits * net;
    const markup = costGel && costGel > 0 ? (netGel - costGel) / costGel : null;
    return {
      id: s.id,
      label: s.label,
      credits,
      priceGel: r2(credits * ECON.creditGel),
      netGel: r2(netGel),
      costGel: costGel === null ? null : r2(costGel),
      markup: markup === null ? null : Math.round(markup * 1000) / 1000,
      ok: markup === null ? null : markup >= MIN_MARKUP,
    };
  });
}

export function buildPlanRows(): PlanRow[] {
  return PAID_TIER_IDS.map((tier) => {
    const priceGel = planPriceGel(tier);
    const credits = monthlyAllowanceCredits(tier);
    return {
      tier,
      name: { ka: TIERS[tier].names.ka, en: TIERS[tier].names.en },
      priceGel,
      credits,
      gelPerCredit: credits > 0 ? Math.round((priceGel / credits) * 1000) / 1000 : 0,
    };
  });
}

export const priceAssumptions = () => ({
  creditGel: ECON.creditGel,
  creditsPerGel: BOG_CREDITS_PER_GEL,
  vatRate: ECON.vatRate,
  paymentFeeRate: ECON.paymentFeeRate,
  fxReserve: ECON.fxReserve,
  gelPerUsd: ECON.gelPerUsd,
  netGelPerCredit: Math.round(netGelPerCredit() * 10000) / 10000,
  minMarkup: MIN_MARKUP,
});

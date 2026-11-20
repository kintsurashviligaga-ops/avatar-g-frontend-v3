/**
 * lib/billing/v5/priceVersions.ts — the versioned price book (v5.1 Phase 5, M-5; PREPARED, NOT WIRED). Pure.
 *
 * Today every price lives in code (lib/credits/priceBook + unitEconomics) and a quote names a digest of those tables
 * (lib/credits/pricingVersion). Phase 5 moves the PROVIDER price of each capability into rows (table price_versions,
 * docs/v5.1-phase5/migrations/20261114a_price_versions.sql), so a Google price change is a new row with a start date,
 * not a deploy, and every quote names the exact rows it was priced from.
 *
 * Rules (docs/architecture/v5.1/08 §3, GG D-06):
 *   - one row = one price of one (capability, model, unit) for a time window [validFrom, validTo);
 *   - a row is usable only when it has an https source (the official pricing page), a fetch time and an approver;
 *   - its credits must satisfy the owner's rule (100 % profit over full cost, lib/credits/unitEconomics) — a row priced
 *     below the rule is refused, never "used at a loss";
 *   - two usable rows for the same key at the same moment = the book is broken: the capability is unavailable (fail
 *     closed), never "pick one";
 *   - no usable row = the capability is unavailable, never free;
 *   - promotional rows end (validTo); an alarm fires PROMO_ALARM_DAYS before, and louder when no row follows.
 */
import { ECON, profitOverCostOf, usdToCostGel, type Econ } from '@/lib/credits/unitEconomics';

export type PriceUnit =
  | 'input_mtok' // one million input tokens
  | 'output_mtok' // one million output tokens (thinking included)
  | 'second' // one second of generated video / audio
  | 'kchar' // one thousand characters (TTS)
  | 'minute' // one minute (Live, sandbox wall time)
  | 'image' // one generated image
  | 'call'; // one flat-priced call

export const PRICE_UNITS: readonly PriceUnit[] = ['input_mtok', 'output_mtok', 'second', 'kchar', 'minute', 'image', 'call'];
export const PROMO_ALARM_DAYS = 7;
const DAY_MS = 86_400_000;

export interface PriceVersion {
  id: string;
  capability: string;
  model: string;
  unit: PriceUnit;
  /** What Google bills us per unit, in USD. */
  usdPerUnit: number;
  /** What the user pays per unit, in credits (1 credit = 0.10 ₾). May be fractional; a quote rounds the total up. */
  creditsPerUnit: number;
  validFrom: string; // ISO time, inclusive
  validTo: string | null; // ISO time, exclusive; null = until replaced
  sourceUrl: string;
  fetchedAt: string;
  approvedBy: string | null;
  promo: boolean;
}

export type PriceKey = { capability: string; model: string; unit: PriceUnit };
export const keyOf = (k: PriceKey) => `${k.capability}|${k.model}|${k.unit}`;

const t = (iso: string | null) => (iso === null ? Infinity : Date.parse(iso));

/** Why a row may not be used (null: it may). */
export function rowProblem(r: PriceVersion, econ: Econ = ECON): string | null {
  if (!r.id || !r.capability || !r.model) return 'id, capability and model';
  if (!PRICE_UNITS.includes(r.unit)) return 'unit';
  if (!(r.usdPerUnit > 0) || !Number.isFinite(r.usdPerUnit)) return 'usdPerUnit must be > 0 (a free provider call is not a price row)';
  if (!(r.creditsPerUnit > 0) || !Number.isFinite(r.creditsPerUnit)) return 'creditsPerUnit must be > 0';
  if (!Number.isFinite(t(r.validFrom))) return 'validFrom';
  if (r.validTo !== null && !(t(r.validTo) > t(r.validFrom))) return 'validTo must be after validFrom';
  if (r.promo && r.validTo === null) return 'a promotional price needs its end date';
  if (!/^https:\/\/[^\s]+$/.test(r.sourceUrl)) return 'sourceUrl: the official https pricing page';
  if (!Number.isFinite(Date.parse(r.fetchedAt))) return 'fetchedAt';
  if (!r.approvedBy || !r.approvedBy.trim()) return 'not approved';
  // The owner's rule, on one unit: credits × 0.10 ₾ must earn 100 % over the full cost (FX reserve and card fee included).
  if (profitOverCostOf(r.creditsPerUnit, usdToCostGel(r.usdPerUnit, econ), econ) < econ.profitOverCost - 1e-9) return 'credits below the 100 % profit rule';
  return null;
}

export type ActiveResult = { ok: true; row: PriceVersion } | { ok: false; error: 'no_price' | 'overlap' };

/** The one usable row for `key` at `atIso`. Unusable rows are ignored; two usable rows at once = 'overlap'. */
export function activeVersion(book: readonly PriceVersion[], key: PriceKey, atIso: string, econ: Econ = ECON): ActiveResult {
  const at = Date.parse(atIso);
  const k = keyOf(key);
  const live = book.filter((r) => keyOf(r) === k && rowProblem(r, econ) === null && t(r.validFrom) <= at && at < t(r.validTo));
  if (live.length === 0) return { ok: false, error: 'no_price' };
  if (live.length > 1) return { ok: false, error: 'overlap' };
  return { ok: true, row: live[0]! };
}

/** Whole-book check before a publish: every usable row's window must not overlap another for the same key. */
export function bookProblems(book: readonly PriceVersion[], econ: Econ = ECON): string[] {
  const problems: string[] = [];
  const byKey = new Map<string, PriceVersion[]>();
  const ids = new Set<string>();
  for (const r of book) {
    if (ids.has(r.id)) problems.push(`${r.id}: duplicate id`);
    ids.add(r.id);
    const p = rowProblem(r, econ);
    if (p) { problems.push(`${r.id}: ${p}`); continue; }
    byKey.set(keyOf(r), [...(byKey.get(keyOf(r)) ?? []), r]);
  }
  for (const rows of byKey.values()) {
    const sorted = [...rows].sort((a, b) => t(a.validFrom) - t(b.validFrom));
    for (let i = 1; i < sorted.length; i++) {
      if (t(sorted[i]!.validFrom) < t(sorted[i - 1]!.validTo)) problems.push(`${sorted[i - 1]!.id} and ${sorted[i]!.id}: overlapping windows`);
    }
  }
  return problems;
}

export interface PromoAlarm { id: string; key: string; endsAt: string; daysLeft: number; successor: string | null; level: 'warn' | 'critical' }

/**
 * Promotional rows ending within PROMO_ALARM_DAYS. 'critical' when no usable row starts exactly when the promo ends:
 * the capability would become unavailable (fail closed) or, worse, be re-priced by hand in a hurry.
 */
export function promoAlarms(book: readonly PriceVersion[], nowIso: string, days = PROMO_ALARM_DAYS, econ: Econ = ECON): PromoAlarm[] {
  const now = Date.parse(nowIso);
  const out: PromoAlarm[] = [];
  for (const r of book) {
    if (!r.promo || r.validTo === null || rowProblem(r, econ)) continue;
    const end = t(r.validTo);
    if (end <= now || end - now > days * DAY_MS) continue;
    const next = book.find((n) => n.id !== r.id && keyOf(n) === keyOf(r) && rowProblem(n, econ) === null && t(n.validFrom) === end);
    out.push({ id: r.id, key: keyOf(r), endsAt: r.validTo, daysLeft: Math.ceil((end - now) / DAY_MS), successor: next?.id ?? null, level: next ? 'warn' : 'critical' });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * AGENT_PRICE_BOOK: 'off' (default; today's code prices only), 'shadow' (also price every quote from the book and log
 * the difference; the user is still charged today's price), 'on' (the book prices; GG's switch after shadow agrees).
 * Anything else reads as 'off'.
 */
export type PriceBookMode = 'off' | 'shadow' | 'on';
export function priceBookMode(raw: string | undefined | null): PriceBookMode {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'shadow' || v === 'on' ? v : 'off';
}

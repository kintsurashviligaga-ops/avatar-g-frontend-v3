/**
 * lib/billing/margin/legacy.ts — 30-day honoured pricing for existing balances (GG 2026-11-14 10:26Z). Pure.
 *
 * At the v8 switch-over (`launchAt`) each user's existing balance becomes a "legacy pool". For LEGACY_DAYS after
 * launch, an action paid from that pool is charged at TODAY's (pre-v8) price. Credits bought after launch, any action
 * that does not fit in what is left of the pool, and every action after the window are charged the v8 (65 %) price.
 *
 * This is the ONLY place a price under the 65 % rule is allowed, and only for credits the user already owned before
 * launch, only inside the window. The pool can only shrink: it is never topped up, and it is zero after the window.
 */
export const LEGACY_DAYS = 30;
const DAY_MS = 86_400_000;

export interface LegacyState {
  /** Credits the user still holds from before launch (snapshot at launch, minus legacy spends since). */
  legacyPool: number;
  /** When v8 pricing went live (ISO). */
  launchAt: string;
}

export type ChargeBasis = 'legacy' | 'v8';

export interface Charge {
  /** Credits to take from the wallet. */
  credits: number;
  basis: ChargeBasis;
  /** How much of `credits` comes out of the legacy pool (0 for a v8 charge). */
  fromLegacyPool: number;
  /** The pool after this charge. */
  legacyPoolAfter: number;
}

/** True while existing balances still get the old prices. */
export function legacyWindowOpen(launchAt: string, now: Date = new Date()): boolean {
  const t = Date.parse(launchAt);
  if (!Number.isFinite(t)) return false;
  const elapsed = now.getTime() - t;
  return elapsed >= 0 && elapsed < LEGACY_DAYS * DAY_MS;
}

/** When the window closes (ISO), for the "your old prices run until …" note. */
export function legacyEndsAt(launchAt: string): string | null {
  const t = Date.parse(launchAt);
  return Number.isFinite(t) ? new Date(t + LEGACY_DAYS * DAY_MS).toISOString() : null;
}

/**
 * What to charge for one action.
 * @param v8Credits     the v8 price (already through enforceMargin)
 * @param legacyCredits today's price for the same action, or null when it was not sold per unit before v8
 */
export function chargeFor(v8Credits: number, legacyCredits: number | null, state: LegacyState | null, now: Date = new Date()): Charge {
  const pool = state && legacyWindowOpen(state.launchAt, now) ? Math.max(0, Math.floor(state.legacyPool)) : 0;
  const legacy = legacyCredits !== null && Number.isFinite(legacyCredits) && legacyCredits > 0 ? Math.ceil(legacyCredits) : null;
  // The old price applies only when it is the cheaper one and fits entirely in the pool (no half-legacy charges).
  if (legacy !== null && legacy < v8Credits && legacy <= pool) {
    return { credits: legacy, basis: 'legacy', fromLegacyPool: legacy, legacyPoolAfter: pool - legacy };
  }
  return { credits: v8Credits, basis: 'v8', fromLegacyPool: 0, legacyPoolAfter: state && legacyWindowOpen(state.launchAt, now) ? pool : 0 };
}

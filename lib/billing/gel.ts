/**
 * GEL (Georgian Lari ₾) fiat pricing layer — the typed source of truth for the
 * in-app wallet display, the fixed per-action cost matrix, and the pre-flight
 * balance interceptor.
 *
 * NOTE: this is the presentation + pricing contract. The durable balance still
 * lives in the existing credit ledger; GEL is the denominated surface shown to
 * users and used for affordability checks. True Stripe GEL settlement and
 * server-side per-tool GEL metering are backend/console activations.
 */

import { GEL_PER_USD } from '@/lib/billing/pricingConfig';

export type MeteredAction = 'chat' | 'voice_tts' | 'geometry_3d' | 'video_film' | 'avatar';

/** Fixed production cost matrix, in GEL (₾). */
export const GEL_COST: Record<MeteredAction, number> = {
  chat: 0.0,        // free fallback tier
  voice_tts: 0.2,   // premium Georgian TTS / generation
  geometry_3d: 0.5, // Agent N — 3D geometry extraction / estimation
  video_film: 2.0,  // cinematic video swarm — 30s film assembly
  avatar: 2.0,      // interactive avatar video response
};

/** Quick-charge refill tiers (₾). 5 ₾ is the minimum boundary; 500 ₾ is the
 *  power-user top tier. Server-side validation accepts only these exact values
 *  (see app/api/billing/wallet-topup/route.ts). 9/29/89 are the CreditsModal
 *  packages (must be present here or wallet-topup 400s on those amounts); the
 *  legacy 5/10/20/50 tiers stay valid for back-compat. */
export const REFILL_TIERS_GEL = [5, 9, 10, 20, 29, 50, 89, 500] as const;
export type RefillTier = (typeof REFILL_TIERS_GEL)[number];
export const MIN_REFILL_GEL = 5;

/** Format a GEL amount as `0.00 ₾` (always 2 decimals, ₾ suffix). */
export function formatGEL(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toFixed(2)} ₾`;
}

/** The GEL wallet balance as a bare USD amount string, `XX.XX` (render with a leading `$`). Master Contract
 *  V10 — the wallet is GEL internally, but the balance is DISPLAYED in USD to match the Phase-39 USD pricing;
 *  uses the single FX constant (GEL_PER_USD) so display never drifts. */
export function usdFromGel(gel: number | null | undefined): string {
  const g = typeof gel === 'number' && Number.isFinite(gel) ? gel : 0;
  return (g / GEL_PER_USD).toFixed(2);
}

/**
 * Locale-aware wallet-balance display (Iteration 4 — currency honesty). The wallet is denominated in
 * GEL internally (₾ is what the top-up rails — BOG + Stripe wallet-topup — actually charge), so:
 *   • local (ka)          → show ₾ directly (`X.XX ₾`), matching the ₾ refill tiers the user pays.
 *   • international (en/ru)→ show the USD equivalent (`$X.XX`) via the single FX constant.
 * Returns the full display string INCLUDING the symbol (leading `$` or trailing ` ₾`) so callers don't
 * re-prefix. Keeps display in lockstep with the charged currency instead of always showing `$`.
 */
export function formatWalletBalance(gel: number | null | undefined, locale: string): string {
  if (locale === 'ka') return formatGEL(typeof gel === 'number' && Number.isFinite(gel) ? gel : 0);
  return `$${usdFromGel(gel)}`;
}

/** Cost of a metered action in GEL. Unknown actions are free (0). */
export function costOf(action: MeteredAction): number {
  return GEL_COST[action] ?? 0;
}

/** True when `balance` (₾) covers `action`'s cost. Free actions always pass. */
export function canAfford(balance: number, action: MeteredAction): boolean {
  const b = Number.isFinite(balance) ? balance : 0;
  return b >= costOf(action);
}

/** Localized "insufficient balance" copy for the pre-flight guardrail modal. */
export function insufficientBalanceMessage(required: number, locale: string): string {
  const amt = formatGEL(required);
  if (locale === 'en') return `This operation needs at least ${amt}. Please top up your wallet to continue.`;
  if (locale === 'ru') return `Для операции требуется минимум ${amt}. Пополните кошелёк, чтобы продолжить.`;
  return `ოპერაციისთვის საჭიროა მინიმუმ ${amt}. გთხოვთ, შეავსოთ საფულე მუშაობის გასაგრძელებლად.`;
}

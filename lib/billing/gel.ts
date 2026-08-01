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
 * Wallet-balance display. ALWAYS USD, in every locale and on every device.
 *
 * ⚠️ THIS USED TO SWITCH ON LOCALE — `ka` got `X.XX ₾`, everyone else `$X.XX` — and that is the actual
 * source of the "balance differs between mobile and desktop" report. It was never about the device: the
 * two views were resolving different locales (a `/ka/` path in one, a default in the other), so the
 * SAME wallet rendered as two different numbers in two different currencies with nothing on screen
 * saying which was real. Seeing 12.00 ₾ in one place and $4.44 in another is indistinguishable from a
 * balance bug, and correct arithmetic underneath does not make it any less alarming.
 *
 * One currency everywhere is worth more than per-locale familiarity. The pricing surface is already USD
 * (Phase 39), so USD is also the number the user was quoted before spending. The wallet stays
 * GEL-denominated internally — the top-up rails genuinely charge in ₾ — and the conversion goes through
 * the single FX constant, so display can never drift from the ledger.
 *
 * `locale` stays in the signature on purpose: every call site already passes it, rewriting them all
 * would be churn for no behavioural gain, and keeping it leaves room for a per-region currency later
 * without a second sweep. It simply no longer selects the currency.
 */
export function formatWalletBalance(gel: number | null | undefined, _locale?: string): string {
  return `$${usdFromGel(gel)}`;
}

/**
 * The SPENDABLE balance, rendered in the unit the generation routes actually move: CREDITS.
 *
 * `profiles.credits_balance` is debited in whole credits by every produce route
 * (deductCredits(user, creditCostFor('image')=2, ...)) and granted in whole credits by the Stripe
 * tier webhook. It is NOT a GEL amount, so `formatWalletBalance` — which divides by the FX rate and
 * prefixes `$` — states a currency the column does not carry, and overstates it by 10x.
 *
 * Use THIS for the wallet chip / balance readouts. Keep `formatWalletBalance` for the call sites that
 * genuinely hold GEL (e.g. `formatWalletBalance(creditsToGel(n))` in the spend toast and settings ledger).
 */
export function formatCreditBalance(credits: number | null | undefined, locale?: string): string {
  const n = typeof credits === 'number' && Number.isFinite(credits) ? Math.max(0, Math.round(credits)) : 0;
  const unit = locale === 'en' ? 'credits' : locale === 'ru' ? 'кред.' : 'კრედიტი';
  return `${n} ${unit}`;
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

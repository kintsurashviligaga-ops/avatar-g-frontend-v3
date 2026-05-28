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
 *  (see app/api/billing/wallet-topup/route.ts). */
export const REFILL_TIERS_GEL = [5, 10, 20, 50, 500] as const;
export type RefillTier = (typeof REFILL_TIERS_GEL)[number];
export const MIN_REFILL_GEL = 5;

/** Format a GEL amount as `0.00 ₾` (always 2 decimals, ₾ suffix). */
export function formatGEL(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toFixed(2)} ₾`;
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

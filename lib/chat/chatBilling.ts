/**
 * DAY-6 — CHAT-generation billing (pure, dependency-light so it is unit-testable).
 *
 * Standalone image / avatar / music generations via the chat orchestrator previously produced assets for FREE
 * (only the film-composite + assemble paths debited). This maps an intent → its credit cost so those legs charge
 * the balance-of-record (profiles.credits_balance) via the SAME proven, idempotent deduct_credits RPC the
 * assemble saga uses. Video is 0 here — real video renders through the film-composite pipeline (already debits
 * per clip). Unknown/text → 0 (never over-charge on a guess). Type-only imports keep this jest-importable.
 */
import { creditCostFor } from '@/lib/credits/pricing';
import type { IntentCategory } from './intentDetector';
import type { ChatResponse } from './providerRouter';

/** Credit cost to charge for a standalone chat generation of this intent (0 = not separately billed here). */
export function billableCreditCost(intent: IntentCategory): number {
  switch (intent) {
    case 'image_generation':
    case 'photo_edit':
      return creditCostFor('image');       // 2 credits (0.20 GEL)
    case 'avatar_generation':
      return creditCostFor('avatar');       // 20 credits
    case 'music_generation':
      return creditCostFor('music');        // 5 credits (30s)
    default:
      return 0;                              // video → film-composite already charges; text/other → free
  }
}

/** Friendly, localized "top up needed" response when a paid chat generation can't be covered by the balance. */
export function insufficientCreditsResponse(intent: IntentCategory, cost: number, locale?: string): ChatResponse {
  const msg = locale === 'en'
    ? `You don't have enough credits for this (needs ${cost}). Please top up to continue.`
    : locale === 'ru'
      ? `Недостаточно кредитов (нужно ${cost}). Пополните баланс, чтобы продолжить.`
      : `არასაკმარისი კრედიტია (საჭიროა ${cost}). შეავსე ბალანსი გასაგრძელებლად.`;
  return {
    success: false,
    intent,
    responseType: 'text',
    message: msg,
    metadata: { provider: 'billing', insufficientCredits: true, requiredCredits: cost },
  };
}

/**
 * lib/api/billingCopy.ts — the words a PAID route says about money when a generation cannot go ahead or did not
 * finish. Pure (no server imports) so every route test can load it without mocking anything.
 *
 * Two situations, one rule: never promise what the ledger did not do.
 *   · The ledger DEFINITIVELY failed before anything ran (deductCredits → reason 'error') → 503
 *     `billing_unavailable`: nothing was charged, nothing was rendered, try again.
 *   · A generation failed AFTER a charge → the route says `refunded: true` ONLY when the refund actually landed.
 *     The studio turns that flag into one localized notice (components/studio/ui/serviceError → generation_refunded).
 */
import type { NextRequest } from 'next/server';

export type BillingLocale = 'ka' | 'en' | 'ru';

/** The caller's UI language from the NEXT_LOCALE cookie — ka when absent, like the rest of the shell. */
export function billingLocale(req: Pick<NextRequest, 'cookies'> | null | undefined): BillingLocale {
  let c: string | undefined;
  try { c = req?.cookies?.get('NEXT_LOCALE')?.value; } catch { c = undefined; }
  return c === 'en' || c === 'ru' ? c : 'ka';
}

/**
 * ⚠️ A LEDGER WE CANNOT WRITE IS NOT A REASON TO RENDER FOR FREE. Several routes answered this case by proceeding
 * unbilled ("a ledger blip never blocks a paid render"), so for as long as the ledger was unreachable every paid
 * provider call was free to everyone who asked. A blip now costs the user one retry, never us an unpaid render.
 */
export function ledgerUnavailableMessage(locale: BillingLocale): string {
  if (locale === 'en') return 'We could not reach billing — nothing was charged. Please try again in a moment.';
  if (locale === 'ru') return 'Не удалось связаться с биллингом — ничего не списано. Попробуйте ещё раз через минуту.';
  return 'ბილინგს ვერ დავუკავშირდით — კრედიტი არ ჩამოგეჭრა. სცადე ცოტა ხანში.';
}

/** The 503 body for that case — `billing_unavailable` is the code the studio's error mapper already translates. */
export function ledgerUnavailableBody(locale: BillingLocale): {
  success: false;
  error: 'billing_unavailable';
  code: 'billing_unavailable';
  message: string;
} {
  return { success: false, error: 'billing_unavailable', code: 'billing_unavailable', message: ledgerUnavailableMessage(locale) };
}

/**
 * The 409 body for a REPLAYED charge ref (lib/orchestrator/ledger debitExistsForRef): the exact request was already
 * charged once. Refused before anything is charged or rendered — the replay neither pays twice nor renders free.
 */
export function replayRefusedBody(): { success: false; error: 'duplicate_request'; code: 'duplicate_request' } {
  return { success: false, error: 'duplicate_request', code: 'duplicate_request' };
}

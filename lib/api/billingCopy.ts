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
import { paidWritesBlockedOnPreview, PREVIEW_NOT_ISOLATED } from '@/lib/env/previewIsolation';

export type BillingLocale = 'ka' | 'en' | 'ru';

/**
 * The caller's UI language from the NEXT_LOCALE cookie — ka when absent, like the rest of the shell. Accepts a
 * NextRequest (parsed cookies) or a plain Request (raw `cookie` header), since some paid routes take the latter.
 */
export function billingLocale(req: Pick<NextRequest, 'cookies'> | Pick<Request, 'headers'> | null | undefined): BillingLocale {
  let c: string | undefined;
  try {
    c = (req as Partial<Pick<NextRequest, 'cookies'>> | null | undefined)?.cookies?.get('NEXT_LOCALE')?.value;
    if (c === undefined) {
      const raw = (req as Partial<Pick<Request, 'headers'>> | null | undefined)?.headers?.get('cookie') ?? '';
      c = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(raw)?.[1];
    }
  } catch { c = undefined; }
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

/**
 * A Preview that shares the Production database refuses every debit BY DESIGN (lib/env/previewIsolation), so on the
 * test link the ledger answers like an outage. Said as an outage („we could not check your balance") it was retold by
 * a Live call as „you have no balance" (GG 2026-10-25 19:11Z): the test link now says what it is.
 */
export function previewTestLinkMessage(locale: BillingLocale): string {
  if (locale === 'en') return 'This is a test link: paid generation is off here and no credits are spent. Real creation works on myavatar.ge.';
  if (locale === 'ru') return 'Это тестовая ссылка: платная генерация здесь выключена, кредиты не списываются. Создавать можно на myavatar.ge.';
  return 'ეს სატესტო ბმულია: აქ ფასიანი გენერაცია გამორთულია და კრედიტი არ იხარჯება. ნამდვილად შექმნა myavatar.ge-ზე შეიძლება.';
}

/** The 503 body for that case — `billing_unavailable` is the code the studio's error mapper already translates. */
export function ledgerUnavailableBody(locale: BillingLocale): {
  success: false;
  error: 'billing_unavailable' | typeof PREVIEW_NOT_ISOLATED;
  code: 'billing_unavailable' | typeof PREVIEW_NOT_ISOLATED;
  message: string;
} {
  if (paidWritesBlockedOnPreview()) {
    return { success: false, error: PREVIEW_NOT_ISOLATED, code: PREVIEW_NOT_ISOLATED, message: previewTestLinkMessage(locale) };
  }
  return { success: false, error: 'billing_unavailable', code: 'billing_unavailable', message: ledgerUnavailableMessage(locale) };
}

/**
 * The 409 body for a REPLAYED charge ref (lib/orchestrator/ledger debitExistsForRef): the exact request was already
 * charged once. Refused before anything is charged or rendered — the replay neither pays twice nor renders free.
 */
export function replayRefusedBody(): { success: false; error: 'duplicate_request'; code: 'duplicate_request' } {
  return { success: false, error: 'duplicate_request', code: 'duplicate_request' };
}

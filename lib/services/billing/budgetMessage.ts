/**
 * lib/services/billing/budgetMessage.ts
 * =====================================
 * What a person reads when the PLATFORM budget (BillingGuard, not their own credits) refuses a call.
 *
 * WHY ONE MODULE: on 2026-10-16 the site's daily AI limit was used up and every surface said something different
 * and wrong — the video studio "could not reach the video service", the live call "stopped, no answer", the
 * storyboard "will draw the frame automatically" (it never did) and chat fell back to a canned reply. Nobody could
 * tell that one limit was the cause, or when it would lift. Every surface now says the same true thing: which limit,
 * and when the service comes back.
 *
 * Pure and client-safe: no server imports, so a React component can render the same copy a route returns.
 */

/** BudgetExceededError messages look like `budget_exceeded:<reason>` (guardedCall.ts). */
export const BUDGET_ERROR_PREFIX = 'budget_exceeded:';

export type BudgetLocale = 'ka' | 'en' | 'ru';

function loc(locale: string | null | undefined): BudgetLocale {
  return locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
}

/**
 * Georgia keeps UTC+4 all year (no daylight saving since 2005), and the guard's day is the UTC day
 * (BillingGuard.windowStarts), so the daily limit lifts at 00:00 UTC = 04:00 in Tbilisi.
 */
export const DAILY_RESET_TBILISI = '04:00';
export const DAILY_RESET_UTC = '00:00';

/** True for anything that carries a budget refusal: the error, its message, or a `budget_exceeded:` string. */
export function isBudgetRefusal(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === 'string') return value.startsWith(BUDGET_ERROR_PREFIX);
  if (value instanceof Error) return value.name === 'BudgetExceededError' || value.message.startsWith(BUDGET_ERROR_PREFIX);
  return false;
}

/** The reason inside a `budget_exceeded:<reason>` string, else undefined. */
export function budgetReasonOf(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
  return text.startsWith(BUDGET_ERROR_PREFIX) ? text.slice(BUDGET_ERROR_PREFIX.length) || undefined : undefined;
}

/**
 * The refusal, in the person's language. `reason` is the guard's (`daily_limit`, `monthly_limit`,
 * `service_suspended`, `full_stop`); anything else reads as the daily limit, the common case.
 */
export function budgetRefusalMessage(locale: string | null | undefined, reason?: string | null): string {
  const l = loc(locale);
  if (reason === 'monthly_limit' || reason === 'full_stop') {
    if (l === 'en') return "The platform's AI budget for this month is used up, so new generations are paused. Nothing was taken from your balance.";
    if (l === 'ru') return 'Бюджет ИИ платформы на этот месяц исчерпан, новые генерации приостановлены. С баланса ничего не списано.';
    return 'პლატფორმის ამ თვის AI ბიუჯეტი ამოიწურა, ამიტომ ახალი გენერაცია შეჩერებულია. ბალანსიდან არაფერი ჩამოგეჭრა.';
  }
  if (reason === 'service_suspended') {
    if (l === 'en') return "This service is paused for the rest of the month to keep the platform's AI budget. Chat and images still work. Nothing was taken from your balance.";
    if (l === 'ru') return 'Этот сервис приостановлен до конца месяца, чтобы сохранить бюджет ИИ платформы. Чат и изображения работают. С баланса ничего не списано.';
    return 'ეს სერვისი თვის ბოლომდე შეჩერებულია პლატფორმის AI ბიუჯეტის დასაცავად. ჩატი და სურათები მუშაობს. ბალანსიდან არაფერი ჩამოგეჭრა.';
  }
  if (l === 'en') return `Today's AI limit for the platform is used up. It comes back at ${DAILY_RESET_TBILISI} Tbilisi time (${DAILY_RESET_UTC} UTC). Nothing was taken from your balance.`;
  if (l === 'ru') return `Дневной лимит ИИ платформы исчерпан. Он восстановится в ${DAILY_RESET_TBILISI} по Тбилиси (${DAILY_RESET_UTC} UTC). С баланса ничего не списано.`;
  return `პლატფორმის დღევანდელი AI ლიმიტი ამოიწურა. ისევ ჩაირთვება ${DAILY_RESET_TBILISI}-ზე (თბილისის დროით). ბალანსიდან არაფერი ჩამოგეჭრა.`;
}

/** A few words for a small slot (an empty storyboard tile); the full message goes next to it. */
export function budgetShortLabel(locale: string | null | undefined): string {
  const l = loc(locale);
  if (l === 'en') return 'Daily AI limit reached';
  if (l === 'ru') return 'Дневной лимит ИИ исчерпан';
  return 'დღის AI ლიმიტი ამოიწურა';
}

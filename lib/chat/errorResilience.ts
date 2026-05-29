/**
 * lib/chat/errorResilience.ts
 * ===========================
 * Intelligent Error Resilience (PHASE 38 §3a).
 *
 * Backend providers (image / video / avatar / interior / TTS engines) and the
 * auth layer occasionally suffer micro-downtime: a 5xx, a rate-limit, a dropped
 * socket, a request timeout. The raw error strings these surface are technical
 * and often English-only — a poor experience for a Georgian-first audience.
 *
 * This pure helper classifies an arbitrary thrown error into a stable category
 * and returns a friendly, fully-localized troubleshooting message the UI can
 * show instantly (the client already auto-retries transient 5xx/network faults
 * inside `postOrchestrate`, so this messaging complements the silent retry).
 *
 * Framework-free + pure → trivially unit-testable.
 */

export type ChatErrorCategory =
  | 'timeout'
  | 'network'
  | 'rate'
  | 'server'
  | 'auth'
  | 'generic';

type Locale = 'en' | 'ka' | 'ru';

const COPY: Record<ChatErrorCategory, Record<Locale, string>> = {
  timeout: {
    en: 'That took longer than expected. The provider may be busy — please try again in a moment.',
    ka: 'მოთხოვნამ მოსალოდნელზე მეტი დრო წაიღო. სერვისი შესაძლოა დატვირთულია — სცადეთ ცოტა ხანში.',
    ru: 'Это заняло больше времени, чем ожидалось. Провайдер может быть занят — попробуйте через мгновение.',
  },
  network: {
    en: 'Connection interrupted. Check your internet and try again — your prompt is safe.',
    ka: 'კავშირი შეწყდა. შეამოწმეთ ინტერნეტი და სცადეთ ხელახლა — თქვენი მოთხოვნა დაცულია.',
    ru: 'Соединение прервано. Проверьте интернет и повторите — ваш запрос сохранён.',
  },
  rate: {
    en: 'High demand right now. Please wait a few seconds and try again.',
    ka: 'ამჟამად მაღალი დატვირთვაა. დაელოდეთ რამდენიმე წამს და სცადეთ ხელახლა.',
    ru: 'Сейчас высокая нагрузка. Подождите несколько секунд и повторите.',
  },
  server: {
    en: 'The generation service had a brief hiccup. We retried automatically — please try once more.',
    ka: 'გენერაციის სერვისს მცირე შეფერხება ჰქონდა. ავტომატურად ვცადეთ ხელახლა — სცადეთ კიდევ ერთხელ.',
    ru: 'Сервис генерации кратко сбоил. Мы повторили автоматически — попробуйте ещё раз.',
  },
  auth: {
    en: 'Your session expired. Please sign in again to continue.',
    ka: 'თქვენი სესია ამოიწურა. გასაგრძელებლად გთხოვთ თავიდან შეხვიდეთ.',
    ru: 'Ваша сессия истекла. Пожалуйста, войдите снова, чтобы продолжить.',
  },
  generic: {
    en: 'Something went wrong. Please try again.',
    ka: 'რაღაც ვერ გამოვიდა. გთხოვთ სცადოთ ხელახლა.',
    ru: 'Что-то пошло не так. Пожалуйста, попробуйте ещё раз.',
  },
};

/** Inspect a raw error string + numeric hints and bucket it. */
export function categorizeChatError(err: unknown): ChatErrorCategory {
  const raw =
    err instanceof Error ? `${err.name} ${err.message}` : typeof err === 'string' ? err : '';
  const s = raw.toLowerCase();
  if (!s) return 'generic';

  if (/\btime(d)?\s?out\b|timeout|etimedout|deadline/.test(s)) return 'timeout';
  if (
    /failed to fetch|networkerror|network error|load failed|err_internet|err_network|connection (refused|reset|closed)|fetch failed|socket/.test(
      s,
    )
  ) {
    return 'network';
  }
  if (/\b429\b|rate.?limit|too many requests|quota|overloaded|capacity/.test(s)) return 'rate';
  if (/\b401\b|\b403\b|unauthor|forbidden|not signed in|sign in again|session expired|auth/.test(s)) {
    return 'auth';
  }
  if (/\b5\d\d\b|server error|internal error|service unavailable|bad gateway|gateway timeout|upstream/.test(s)) {
    return 'server';
  }
  return 'generic';
}

/**
 * Produce a friendly, localized troubleshooting message for a thrown error.
 *
 * @param err      The caught error (Error | string | unknown).
 * @param locale   Surface locale.
 * @param fallback Optional backend-supplied message used only when the error is
 *                 unrecognized (`generic`) and is short/human enough to show.
 */
export function classifyChatError(
  err: unknown,
  locale: Locale,
  fallback?: string,
): { category: ChatErrorCategory; message: string } {
  const category = categorizeChatError(err);
  if (category === 'generic') {
    const trimmed = (fallback ?? '').trim();
    // Keep a meaningful, concise backend message (e.g. business-rule errors)
    // but never surface a giant stack/JSON blob to the user.
    if (trimmed && trimmed.length <= 160 && !/[<{]/.test(trimmed)) {
      return { category, message: trimmed };
    }
    return { category, message: COPY.generic[locale] };
  }
  return { category, message: COPY[category][locale] };
}

import 'server-only';

/**
 * Turn anything a provider threw into something a user should read.
 *
 * ⚠️ WE WERE SHOWING PEOPLE OUR SUPPLIER'S BILLING PAGE. lib/replicate/client.ts throws
 * `Replicate API ${status}: ${body}` with the provider's raw response embedded, and several routes
 * answer with `err.message` verbatim. So a Georgian user pressing Generate was shown, in English:
 *
 *     Replicate API 402: {"title":"Insufficient credit","detail":"You have insufficient credit to run
 *     this model. Go to https://replicate.com/account/billing …"}
 *
 * Three separate failures in one bubble. It is untranslated. It is JSON. And it invites the customer to
 * go and top up OUR vendor account — naming a supplier they have no relationship with, on a screen where
 * they were trying to give US money. Nobody should ever learn who our providers are from an error.
 *
 * ⚠️ THE STATUS BELONGS TO THE PROVIDER, NOT TO THE USER. A 402 from Replicate does not mean the user is
 * out of credit — the app checks the user's balance separately and returns its own 402 with
 * `insufficient_credits` long before this. A provider 402 means WE are out of credit, which is an
 * outage from where the user sits, and must read as one. Telling them to top up would be a lie that
 * costs them money.
 *
 * Callers pass the caught error and get back a code + a message already in the user's language. The
 * original is never returned; log it server-side if you need it.
 */

export type ProviderFailure = 'provider_unfunded' | 'provider_rate_limited' | 'provider_unavailable' | 'provider_rejected';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<ProviderFailure, Record<Lang, string>> = {
  // OUR account, not theirs. Worded as the temporary outage it is, with no suggestion that the user pay.
  provider_unfunded: {
    ka: 'გენერაციის სერვისი დროებით მიუწვდომელია ჩვენი მხრიდან. კრედიტი არ ჩამოგეჭრა — სცადე ცოტა ხანში ან დაგვიკავშირდი.',
    en: 'The generation service is temporarily unavailable on our side. You have not been charged — please try again shortly or contact support.',
    ru: 'Сервис генерации временно недоступен с нашей стороны. Средства не списаны — попробуйте позже или напишите в поддержку.',
  },
  provider_rate_limited: {
    ka: 'ამჟამად ბევრი მოთხოვნაა. დაელოდე წუთს და სცადე თავიდან — კრედიტი არ ჩამოგეჭრა.',
    en: 'It is busy right now. Give it a minute and try again — you have not been charged.',
    ru: 'Сейчас много запросов. Подождите минуту и попробуйте снова — средства не списаны.',
  },
  provider_unavailable: {
    ka: 'გენერაცია ვერ დასრულდა — სერვისი დროებით მიუწვდომელია. კრედიტი არ ჩამოგეჭრა.',
    en: 'The generation could not finish — the service is temporarily unavailable. You have not been charged.',
    ru: 'Генерация не завершилась — сервис временно недоступен. Средства не списаны.',
  },
  // The only class that is about the REQUEST rather than the supplier, so the only one that suggests editing it.
  provider_rejected: {
    ka: 'ამ მოთხოვნის დამუშავება ვერ მოხერხდა. სცადე პრომპტის შეცვლა — კრედიტი არ ჩამოგეჭრა.',
    en: 'That request could not be processed. Try rewording the prompt — you have not been charged.',
    ru: 'Этот запрос не удалось обработать. Попробуйте переформулировать — средства не списаны.',
  },
};

/** Pull an HTTP status out of a thrown provider error without trusting its shape. */
function statusOf(err: unknown): number {
  const s = (err as { status?: unknown })?.status;
  if (typeof s === 'number') return s;
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const m = /\b(4\d{2}|5\d{2})\b/.exec(raw);
  return m?.[1] ? Number(m[1]) : 0;
}

const CODES = new Set<string>(['provider_unfunded', 'provider_rate_limited', 'provider_unavailable', 'provider_rejected']);

/**
 * Build the error a provider client should THROW.
 *
 * ⚠️ THE MESSAGE IS THE CODE, DELIBERATELY, AND THE RESPONSE BODY IS NOT IN IT. Clients used to throw
 * `Replicate API ${status}: ${body}`, and any route that answered with `err.message` — several did —
 * republished our supplier's name, their JSON, and a link to their billing page straight into a Georgian
 * user's chat. Keeping the body out of `.message` means a route that has NOT been taught about this
 * module still cannot leak: the worst it can now print is a machine code, which the client's
 * `describeOpFailure` already recognises and replaces with its own translated string.
 *
 * The real body is kept on a NON-ENUMERABLE `detail`, so it reaches logs and Sentry but never
 * `JSON.stringify(err)` — which is how this sort of thing escapes in the first place.
 */
export function providerError(status: number, body?: string): Error & { status: number } {
  const code = classifyProviderError({ status, message: body ?? '' });
  const err = new Error(code) as Error & { status: number };
  err.status = status;
  Object.defineProperty(err, 'detail', { value: body ?? '', enumerable: false });
  return err;
}

export function classifyProviderError(err: unknown): ProviderFailure {
  // Already classified (e.g. rethrown through a cascade) — don't re-derive and risk a different answer.
  const msg = err instanceof Error ? err.message : typeof (err as { message?: unknown })?.message === 'string' ? String((err as { message: string }).message) : '';
  if (CODES.has(msg)) return msg as ProviderFailure;

  const status = statusOf(err);
  const raw = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  // 402 / "insufficient credit" / "quota" / "billing" all mean the same thing: OUR account is empty.
  if (status === 402 || /insufficient credit|quota|billing|payment required|depleted/.test(raw)) return 'provider_unfunded';
  if (status === 429 || /rate limit|too many requests/.test(raw)) return 'provider_rate_limited';
  if (status === 400 || status === 422 || /invalid|unsupported|nsfw|safety|rejected/.test(raw)) return 'provider_rejected';
  return 'provider_unavailable';
}

/**
 * The JSON body a route should return. `message` is safe to render as-is.
 *
 * `status` is deliberately 503 for every supplier-side class: from the caller's perspective this is our
 * service being unavailable, and echoing the provider's own 402 would make the client's
 * insufficient-credit handling fire and tell the user to top up a balance that is fine.
 */
export function providerErrorBody(err: unknown, locale?: string): { error: ProviderFailure; message: string; status: number } {
  const code = classifyProviderError(err);
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  return {
    error: code,
    message: COPY[code][lang],
    status: code === 'provider_rejected' ? 422 : 503,
  };
}

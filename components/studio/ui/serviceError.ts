/**
 * One place that turns a service failure into something a person can act on.
 *
 * ⚠️ MACHINE CODES AND ENGLISH PROVIDER PROSE WERE REACHING A GEORGIAN SCREEN. The pattern
 * `setError(j.error || t.failed)` renders whatever the server said — so a user saw `duplicate_request`,
 * or `insufficient_credits`, or a sentence from an American API, inside an otherwise Georgian panel.
 * LipsyncStudio had already been hardened against exactly this on its START path and then printed the
 * raw string anyway on its POLL path twenty lines below; MusicStudio never had the guard at all.
 *
 * ⚠️ AN UNRECOGNISED ERROR FALLS BACK — IT IS NEVER ECHOED. A string this table does not know is, by
 * definition, not written for a user: it is a stack fragment, a provider's internal wording, or a code.
 * Showing it looks like transparency and reads as a crash. The caller's own `failed` copy is used
 * instead, and the raw value goes to the console where a developer can still find it.
 *
 * Every message says what happened AND what to do next, because "something went wrong" leaves the user
 * with nowhere to go.
 */
export type ErrLang = 'ka' | 'en' | 'ru';

type Known =
  | 'insufficient_credits' | 'provider_not_configured' | 'duplicate_request'
  | 'rate_limited' | 'unauthorized' | 'timeout' | 'too_large' | 'unsupported_format';

const COPY: Record<ErrLang, Record<Known, string>> = {
  ka: {
    insufficient_credits: 'კრედიტი არ გყოფნის. შეავსე ბალანსი და სცადე ხელახლა.',
    provider_not_configured: 'ეს ძრავა დროებით გამორთულია. სცადე მოგვიანებით — თანხა არ ჩამოგეჭრა.',
    duplicate_request: 'იგივე მოთხოვნა უკვე მუშავდება. დაელოდე მის დასრულებას.',
    rate_limited: 'ძალიან ბევრი მოთხოვნა მოვიდა. დაისვენე ერთი წუთი და სცადე ხელახლა.',
    unauthorized: 'ჯერ გაიარე ავტორიზაცია და შემდეგ სცადე.',
    timeout: 'რენდერი ძალიან დიდხანს გაგრძელდა და შეწყდა. სცადე უფრო მოკლე ან პატარა ფაილით.',
    too_large: 'ფაილი ძალიან დიდია. სცადე პატარა ან უფრო მოკლე ფაილი.',
    unsupported_format: 'ეს ფორმატი არ იკითხება. სცადე MP4, MP3 ან WAV.',
  },
  en: {
    insufficient_credits: 'Not enough credits. Top up your balance and try again.',
    provider_not_configured: 'This engine is temporarily off. Try later — you were not charged.',
    duplicate_request: 'The same request is already running. Wait for it to finish.',
    rate_limited: 'Too many requests. Wait a minute and try again.',
    unauthorized: 'Sign in first, then try again.',
    timeout: 'The render ran too long and was stopped. Try a shorter or smaller file.',
    too_large: 'The file is too large. Try a smaller or shorter one.',
    unsupported_format: 'That format cannot be read. Try MP4, MP3 or WAV.',
  },
  ru: {
    insufficient_credits: 'Недостаточно кредитов. Пополните баланс и попробуйте снова.',
    provider_not_configured: 'Этот движок временно отключён. Попробуйте позже — списания не было.',
    duplicate_request: 'Такой запрос уже выполняется. Дождитесь его завершения.',
    rate_limited: 'Слишком много запросов. Подождите минуту и попробуйте снова.',
    unauthorized: 'Сначала войдите в аккаунт, затем попробуйте снова.',
    timeout: 'Рендер шёл слишком долго и был остановлен. Попробуйте файл покороче.',
    too_large: 'Файл слишком большой. Попробуйте меньший или более короткий.',
    unsupported_format: 'Этот формат не читается. Попробуйте MP4, MP3 или WAV.',
  },
};

/** Substrings that identify a known failure inside a longer provider string. */
const MATCHERS: ReadonlyArray<readonly [RegExp, Known]> = [
  // 'enough credit' is deliberately loose — providers write "do not have enough credits" as often
  // as "not enough". A false positive here is a slightly-wrong-but-actionable message; a miss is a
  // stack trace on the user's screen.
  [/insufficient[_\s-]?credit|enough credit|no credits|low balance/i, 'insufficient_credits'],
  [/provider[_\s-]?not[_\s-]?configured|not configured|missing[_\s-]?key|no api key/i, 'provider_not_configured'],
  [/duplicate[_\s-]?request|already (running|in progress|processing)/i, 'duplicate_request'],
  [/rate[_\s-]?limit|too many requests|\b429\b/i, 'rate_limited'],
  [/unauthorized|unauthenticated|not signed in|\b401\b/i, 'unauthorized'],
  [/timed?[_\s-]?out|timeout|deadline exceeded/i, 'timeout'],
  [/too[_\s-]?large|payload too large|file size|\b413\b/i, 'too_large'],
  [/unsupported|invalid format|cannot decode|unrecognis/i, 'unsupported_format'],
];

/**
 * @param raw      whatever the server returned (`j.error`, `j.code`, an Error message…)
 * @param locale   ka/en/ru — anything else reads Georgian, like the rest of the shell
 * @param fallback the caller's own localized "it failed" copy, used for anything unrecognised
 */
export function describeServiceError(raw: unknown, locale: string, fallback: string): string {
  const lang: ErrLang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return fallback;
  for (const [rx, key] of MATCHERS) {
    if (rx.test(text)) return COPY[lang][key];
  }
  // Unrecognised — keep it off the screen, but do not lose it.
  // eslint-disable-next-line no-console
  console.warn('[service] unmapped error shown as generic copy:', text.slice(0, 200));
  return fallback;
}

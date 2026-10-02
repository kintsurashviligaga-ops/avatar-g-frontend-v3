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
  | 'rate_limited' | 'unauthorized' | 'timeout' | 'too_large' | 'unsupported_format'
  // The studio saga's codes (lib/studio/saga.ts → /api/estimate, /api/generate).
  | 'price_changed' | 'confirmation_required' | 'model_unavailable' | 'content_rejected'
  | 'generation_failed' | 'invalid_input' | 'provider_unavailable' | 'billing_unavailable' | 'cannot_cancel'
  // A credit-priced generation that failed AFTER its charge was refunded — said only when the route reports
  // `refunded: true` (see describeGenerationFailure).
  | 'generation_refunded';

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
    price_changed: 'ფასი შეიცვალა. გადახედე ახალ ფასს და დაადასტურე ხელახლა.',
    confirmation_required: 'ჯერ დაადასტურე ფასი — დადასტურების გარეშე თანხა არ ჩამოგეჭრება.',
    model_unavailable: 'ეს მოდელი ახლა მიუწვდომელია. აირჩიე სხვა მოდელი — თანხა არ ჩამოგეჭრა.',
    content_rejected: 'მოთხოვნა ან შედეგი უსაფრთხოების ფილტრმა შეაჩერა. შეცვალე აღწერა და სცადე ხელახლა — თანხა დაგიბრუნდა.',
    generation_failed: 'გენერაცია ვერ დასრულდა. თანხა დაგიბრუნდა — სცადე ხელახლა.',
    invalid_input: 'მოდელმა ეს პარამეტრები ვერ მიიღო. შეამოწმე ხანგრძლივობა, ფორმატი და ფაილები და სცადე ხელახლა.',
    provider_unavailable: 'სერვისი დროებით მიუწვდომელია. სცადე რამდენიმე წუთში — ამ მცდელობის თანხა არ დაიკარგება.',
    billing_unavailable: 'ბალანსის შემოწმება ვერ მოხერხდა. სცადე ცოტა ხანში — ზედმეტი თანხა არ ჩამოგეჭრება.',
    cannot_cancel: 'გენერაცია უკვე დაწყებულია და ვეღარ გაუქმდება. შედეგი მალე გამოჩნდება.',
    generation_refunded: 'გენერაცია ვერ შესრულდა — კრედიტები დაგიბრუნდათ.',
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
    price_changed: 'The price changed. Check the new price and confirm again.',
    confirmation_required: 'Confirm the price first — nothing is charged without it.',
    model_unavailable: 'This model is unavailable right now. Pick another one — you were not charged.',
    content_rejected: 'The safety filter stopped this request or its result. Change the description and try again — you were refunded.',
    generation_failed: 'The generation did not finish. You were refunded — try again.',
    invalid_input: 'The model could not accept these settings. Check duration, format and files, then try again.',
    provider_unavailable: 'The service is temporarily unavailable. Try again in a few minutes — you will not lose credits for this attempt.',
    billing_unavailable: 'We could not check your balance. Try again shortly — you will not be overcharged.',
    cannot_cancel: 'The generation has already started and can no longer be canceled. The result will appear soon.',
    generation_refunded: 'Generation failed — your credits were refunded.',
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
    price_changed: 'Цена изменилась. Проверьте новую цену и подтвердите снова.',
    confirmation_required: 'Сначала подтвердите цену — без этого ничего не списывается.',
    model_unavailable: 'Эта модель сейчас недоступна. Выберите другую — списания не было.',
    content_rejected: 'Фильтр безопасности остановил запрос или результат. Измените описание и попробуйте снова — средства возвращены.',
    generation_failed: 'Генерация не завершилась. Средства возвращены — попробуйте снова.',
    invalid_input: 'Модель не приняла эти параметры. Проверьте длительность, формат и файлы и попробуйте снова.',
    provider_unavailable: 'Сервис временно недоступен. Попробуйте через несколько минут — кредиты за эту попытку не пропадут.',
    billing_unavailable: 'Не удалось проверить баланс. Попробуйте чуть позже — лишнего не спишем.',
    cannot_cancel: 'Генерация уже началась и не может быть отменена. Результат скоро появится.',
    generation_refunded: 'Не удалось сгенерировать — кредиты возвращены.',
  },
};

/** Substrings that identify a known failure inside a longer provider string. */
const MATCHERS: ReadonlyArray<readonly [RegExp, Known]> = [
  // The studio saga's codes are exact machine codes — matched whole and FIRST, so a loose pattern below
  // (e.g. `timeout` inside a longer word) can never claim them.
  [/^price_changed$/, 'price_changed'],
  [/^confirmation_required$/, 'confirmation_required'],
  [/^model_unavailable$/, 'model_unavailable'],
  [/^content_rejected$/, 'content_rejected'],
  [/^generation_failed$/, 'generation_failed'],
  [/^generation_refunded$/, 'generation_refunded'],
  [/^invalid_input$/, 'invalid_input'],
  [/^provider_unavailable$/, 'provider_unavailable'],
  [/^billing_unavailable$/, 'billing_unavailable'],
  [/^cannot_cancel$/, 'cannot_cancel'],
  [/^not_configured$/, 'provider_not_configured'],
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
  const key = knownFor(text);
  if (key) return COPY[lang][key];
  // Unrecognised — keep it off the screen, but do not lose it.
  // eslint-disable-next-line no-console
  console.warn('[service] unmapped error shown as generic copy:', text.slice(0, 200));
  return fallback;
}

/** The known failure a string names, or null — no fallback, no logging. */
function knownFor(text: string): Known | null {
  for (const [rx, key] of MATCHERS) {
    if (rx.test(text)) return key;
  }
  return null;
}

/**
 * A failed generation's RESPONSE BODY → the one line the user reads in the result bubble/tile.
 *
 * ⚠️ ONLY THE SERVER MAY SAY "REFUNDED". A paid route reports `refunded: true` only after refund_credits confirmed the
 * credit-back (app/api/ai/music, app/api/nanobanana/image, the avatar / motion / 3D polls). That flag — never a guess
 * from a status code, never "a credit had been reserved" — is what selects the refund notice. Without it the line is
 * the neutral mapped failure, so a refund that did not land is never promised.
 *
 * A route's own MACHINE CODE (`code`, then `error`) is read before its prose: a sentence the table does not know
 * falls back to generic copy, and `billing_unavailable` / `duplicate_request` arrive as codes beside a sentence.
 */
export function describeGenerationFailure(body: unknown, locale: string, fallback: string): string {
  const lang: ErrLang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const b = (body && typeof body === 'object' ? body : {}) as { success?: unknown; refunded?: unknown; code?: unknown; error?: unknown; message?: unknown };
  if (b.refunded === true && b.success !== true) return COPY[lang].generation_refunded;
  for (const field of [b.code, b.error]) {
    const key = typeof field === 'string' && field.trim() ? knownFor(field.trim()) : null;
    if (key) return COPY[lang][key];
  }
  const message = typeof b.message === 'string' && b.message.trim() ? b.message : b.error;
  return describeServiceError(message, locale, fallback);
}

/**
 * lib/agent/media/audioChat.ts — the studio chat's side of Agent G's "take the audio out of this as an MP3": when a
 * message asks for it (a link, or one attached video or audio file), and what Agent G says at each step, in ka · en · ru.
 * Pure, no network, safe in the browser; the executor is ./audioExtract behind /api/agent/media/audio.
 *
 * WHAT CLAIMS A MESSAGE. It must want the AUDIO as a file: "MP3" said outright, or a take-out verb (extract, rip,
 * convert, download, ამოიღე, გადაიყვანე, извлеки, скачай …) together with a sound word (audio, song, music, ხმა,
 * სიმღერა, звук …). "Add music to this video" (the remix's add_music), "what song is this?" (no take-out verb) and
 * "make music like this" are not this, and neither is a split into vocals and instrumental (stems: a different job,
 * which this one would answer wrongly with the whole mix). And exactly ONE source: one link and no files, or one video
 * or audio file and no link. Anything else stays with the chat as before.
 */
import { findLinks, withoutLinks } from './audioSource';
import type { AudioErrorCode, AudioQuote } from './audioExtract';
import type { AttachmentKind } from './montageChat';

type Lang = 'ka' | 'en' | 'ru';

const MP3 = /(?:^|[^\p{L}\p{N}])(?:mp3|მპ3|мп3)(?:$|[^\p{L}\p{N}])/iu;
const SOUND = /audio|sound|soundtrack|music|song|track|აუდიო|ხმ[აისე]|სიმღერ|მუსიკ|ტრეკ|звук|аудио|музык|песн|трек/iu;
const TAKE = new RegExp([
  '\\bextract|\\brip\\b|\\bpull\\b|\\bconvert|\\bdownload|\\bseparate',
  'ამოიღ|ამომიღ|ამოაღ|ამოჭერ|გამოყავ|გამომიყავ|გამოყოფ|გამოაცალ|გადაიყვან|გადამიყვან|გადააკეთ|ჩამოტვირთ|გადმოწერ|გადმომიწერ',
  'извлеч|извлек|вытащ|выдели|достань|отдели|конверт|переведи в|скача',
].join('|'), 'iu');
/** Vocals apart from the instrumental: stems, not this job. */
const STEMS = /vocal|stems?\b|instrumental|acapella|a cappella|karaoke|ვოკალ|მინუს|ინსტრუმენტ|караоке|вокал|минус|инструментал/iu;

export type AudioAsk = { source: 'link'; url: string } | { source: 'file' };

/** Does the message (its words, without links) want the audio taken out as a file? */
export function wantsAudioFile(words: string): boolean {
  const t = (words || '').trim();
  if (!t || STEMS.test(t)) return false;
  return MP3.test(t) || (TAKE.test(t) && SOUND.test(t));
}

/** Is this message, with these attachments, a request to take the audio out as an MP3? Which source? */
export function audioExtractAsk(text: string, kinds: AttachmentKind[]): AudioAsk | null {
  const links = findLinks(text);
  const words = withoutLinks(text);
  if (!wantsAudioFile(words)) return null;
  if (links.length === 1 && kinds.length === 0) return { source: 'link', url: links[0]! };
  if (links.length === 0 && kinds.length === 1 && (kinds[0] === 'video' || kinds[0] === 'audio')) return { source: 'file' };
  return null;
}

export type AgentAudioPhase = 'checking' | 'quoted' | 'running' | 'done' | 'failed' | 'cancelled' | 'dismissed';

/** One extraction card in the thread. Never persisted: the result is the bubble's own player (Download, Library). */
export interface AgentAudioState {
  phase: AgentAudioPhase;
  quote?: AudioQuote;
  /** The signed plan, sent back verbatim on Start (the server checks it against the token). */
  request?: unknown;
  token?: string;
  /** A link or the user's file: names the card's first step before the plan comes back. */
  source?: 'link' | 'file';
  pct?: number;
  /** The job's last stage: kept through a stop or a failure, so the card marks the step it ended on. */
  stage?: string | null;
  /** Stop was pressed and has not come back yet. */
  stopping?: boolean;
  /** When the current working stretch began (the bubble, then Start) and when the run ended: the card's clock. */
  t0?: number;
  t1?: number;
  error?: string;
  /** The refusal is one the user can answer by uploading their own (or a licensed) file: the card offers it. */
  offerUpload?: boolean;
}

const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');
const q = (lang: Lang, s: string) => (lang === 'ka' ? `„${s}“` : lang === 'ru' ? `«${s}»` : `“${s}”`);

/** 189 → "3:09", 3723 → "1:02:03". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** 4_509_000 → "4.3 MB" (ka "4.3 მბ", ru "4.3 МБ"); under a megabyte in KB. */
export function formatBytes(bytes: number, locale: string): string {
  const lang = pick(locale);
  const n = Math.max(0, Number(bytes) || 0);
  const [mb, kb] = lang === 'ka' ? ['მბ', 'კბ'] : lang === 'ru' ? ['МБ', 'КБ'] : ['MB', 'KB'];
  if (n >= 1024 * 1024) return `${(Math.round((n / (1024 * 1024)) * 10) / 10).toString()} ${mb}`;
  return `${Math.max(1, Math.round(n / 1024))} ${kb}`;
}

/** What Agent G says while it checks the link (or uploads and reads the file). */
export function checkingText(source: 'link' | 'file', locale: string): string {
  const lang = pick(locale);
  if (source === 'file') {
    return lang === 'en' ? 'Uploading your file and reading it…' : lang === 'ru' ? 'Загружаю ваш файл и читаю его…' : 'ვტვირთავ შენს ფაილს და ვკითხულობ…';
  }
  return lang === 'en' ? 'Checking the link: does it open, is it a media file, and may it be used…'
    : lang === 'ru' ? 'Проверяю ссылку: открывается ли, медиафайл ли это и можно ли его использовать…'
      : 'ვამოწმებ ბმულს: იხსნება თუ არა, მედია ფაილია თუ არა და შეიძლება თუ არა მისი გამოყენება…';
}

/** The rights line of a plan. */
export function rightsText(r: AudioQuote['rights'], locale: string): string {
  const lang = pick(locale);
  if (r.status === 'licensed') {
    const by = r.author ? (lang === 'en' ? `, by ${r.author}` : lang === 'ru' ? `, автор: ${r.author}` : `, ავტორი: ${r.author}`) : '';
    const lic = r.license ?? '';
    return lang === 'en' ? `Rights: the source publishes it under ${lic}${by}. Keep that credit when you use it.`
      : lang === 'ru' ? `Права: источник публикует его по лицензии ${lic}${by}. Сохраните это указание при использовании.`
        : `უფლება: წყარო მას ${lic} ლიცენზიით აქვეყნებს${by}. გამოყენებისას ეს მითითება შეინარჩუნე.`;
  }
  if (r.status === 'own') {
    return lang === 'en' ? 'Rights: this is your own upload.' : lang === 'ru' ? 'Права: это ваш собственный файл.' : 'უფლება: ეს შენი ატვირთული ფაილია.';
  }
  return lang === 'en' ? 'Rights: I cannot check who owns this file. Press Start only if it is yours or you have a licence to use it.'
    : lang === 'ru' ? 'Права: я не могу проверить, кому принадлежит файл. Нажимайте «Начать», только если он ваш или у вас есть лицензия.'
      : 'უფლება: ვერ ვამოწმებ, ვისია ეს ფაილი. „დაწყებას“ დააჭირე მხოლოდ მაშინ, თუ ფაილი შენია ან მისი გამოყენების ლიცენზია გაქვს.';
}

/** Agent G's plan, in words: the source, the rights, what it will make, the price, and that nothing starts before Start. */
export function audioQuoteText(quote: AudioQuote, locale: string): string {
  const lang = pick(locale);
  const size = quote.bytes ? `, ${formatBytes(quote.bytes, locale)}` : '';
  const from = quote.source === 'file'
    ? (lang === 'en' ? `Source: your file${size}.` : lang === 'ru' ? `Источник: ваш файл${size}.` : `წყარო: შენი ფაილი${size}.`)
    : (lang === 'en' ? `Source: ${quote.host ?? 'the link'}${size}; it opens and serves a media file.`
      : lang === 'ru' ? `Источник: ${quote.host ?? 'ссылка'}${size}; открывается и отдаёт медиафайл.`
        : `წყარო: ${quote.host ?? 'ბმული'}${size}; იხსნება და მედია ფაილს აბრუნებს.`);
  const plan = lang === 'en' ? `Plan: take out the sound and save it as ${q(lang, quote.name)} (MP3, ${quote.bitrateKbps} kbps).`
    : lang === 'ru' ? `План: извлечь звук и сохранить как ${q(lang, quote.name)} (MP3, ${quote.bitrateKbps} кбит/с).`
      : `გეგმა: ხმას ამოვიღებ და შევინახავ, როგორც ${q(lang, quote.name)} (MP3, ${quote.bitrateKbps} kbps).`;
  const price = quote.credits > 0
    ? (lang === 'en' ? `Price: ✦ ${quote.credits}.` : lang === 'ru' ? `Цена: ✦ ${quote.credits}.` : `ფასი: ✦ ${quote.credits}.`)
    : (lang === 'en' ? 'Free.' : lang === 'ru' ? 'Бесплатно.' : 'უფასოა.');
  const go = lang === 'en' ? 'Nothing starts until you press Start.' : lang === 'ru' ? 'Ничего не начнётся, пока вы не нажмёте «Начать».' : 'არაფერი დაიწყება, სანამ „დაწყებას“ არ დააჭერ.';
  return `${from}\n${rightsText(quote.rights, locale)}\n${plan}\n${price} ${go}`;
}

const STAGE: Record<string, Record<Lang, string>> = {
  queued: { ka: 'რიგშია, მალე დავიწყებ', en: 'Queued, starting shortly', ru: 'В очереди, скоро начну' },
  starting: { ka: 'ვიწყებ', en: 'Starting', ru: 'Начинаю' },
  retrying: { ka: 'სერვერი შეფერხდა, თავიდან ვიწყებ', en: 'The server stalled, so I am starting again', ru: 'Сервер остановился, начинаю заново' },
  extract: { ka: 'ფაილს ვიღებ და ხმას MP3-ად ვაქცევ', en: 'Fetching the file and turning its sound into MP3', ru: 'Получаю файл и перевожу звук в MP3' },
  qc: { ka: 'ვამოწმებ შედეგს', en: 'Checking the result', ru: 'Проверяю результат' },
  upload: { ka: 'ვინახავ', en: 'Saving it', ru: 'Сохраняю' },
  completed: { ka: 'მზადაა', en: 'Ready', ru: 'Готово' },
};

export function audioStageText(stage: string | null | undefined, locale: string): string {
  const lang = pick(locale);
  return (stage && STAGE[stage]?.[lang]) ?? STAGE.starting![lang];
}

export function audioDoneText(r: { name: string; durationSec: number; bytes: number }, locale: string): string {
  const lang = pick(locale);
  const facts = `${formatDuration(r.durationSec)} · ${formatBytes(r.bytes, locale)}`;
  return lang === 'en' ? `Ready: ${q(lang, r.name)}, ${facts}. Play it here, download it, or save it to your Library.`
    : lang === 'ru' ? `Готово: ${q(lang, r.name)}, ${facts}. Слушайте здесь, скачайте или сохраните в Библиотеку.`
      : `მზადაა: ${q(lang, r.name)}, ${facts}. მოუსმინე აქვე, ჩამოტვირთე ან შეინახე ბიბლიოთეკაში.`;
}

/** The text of the card's upload offer, and the request the composer is filled with when the user takes it. */
export function uploadOfferLabel(locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? 'Upload a file' : lang === 'ru' ? 'Загрузить файл' : 'ფაილის ატვირთვა';
}
export function uploadPrefill(locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? 'Extract the MP3 from this file' : lang === 'ru' ? 'Извлеки MP3 из этого файла' : 'ამ ფაილიდან MP3 ამოიღე';
}

export type AudioChatCode = AudioErrorCode | 'upload_failed' | 'network' | 'closed' | 'unauthenticated' | 'rate_limited' | 'approval_unclear';

const UPLOAD: Record<Lang, string> = {
  ka: ' თუ ვიდეო შენია ან მისი გამოყენების ლიცენზია გაქვს, ატვირთე ფაილი აქ და MP3-ს მაშინვე ამოვიღებ.',
  en: ' If the video is yours or you have a licence for it, upload the file here and I will take the MP3 out right away.',
  ru: ' Если видео ваше или у вас есть лицензия, загрузите файл сюда, и я сразу извлеку MP3.',
};

/** Refusals the user answers best by uploading their own (or a licensed) file. */
export const OFFER_UPLOAD: ReadonlySet<string> = new Set(['platform', 'stream', 'not_media', 'unavailable', 'blocked_host', 'invalid_url', 'refused']);

const ERR: Record<AudioChatCode, Record<Lang, string>> = {
  approval_unclear: { ka: 'შენი „კი“ ვერ გავიგე, ამიტომ არაფერი დამიწყია. თქვი „კი, დაიწყე“ ან დააჭირე Start-ს.', en: 'I did not hear a clear yes from you, so nothing was started. Say "yes, start" or tap Start.', ru: 'Я не услышал от вас чёткого «да», поэтому ничего не запущено. Скажите «да, начинай» или нажмите Start.' },
  bad_input: { ka: 'წყარო ვერ მივიღე. გამომიგზავნე ერთი ბმული ან ერთი ფაილი.', en: 'I did not get a source. Send one link or one file.', ru: 'Источник не получен. Пришлите одну ссылку или один файл.' },
  invalid_url: { ka: 'ეს ბმული ვერ წავიკითხე.', en: 'I could not read this link.', ru: 'Не удалось прочитать ссылку.' },
  platform: { ka: '{p}-ის წესები მისი ვიდეოს ან აუდიოს გადმოწერას საკუთარი პლეერის გარეშე არ უშვებს, ამიტომ ამ ბმულიდან ფაილს არ ავიღებ.', en: '{p} does not allow its videos or audio to be downloaded outside its own player, so I will not take the file from this link.', ru: 'Правила {p} не разрешают скачивать видео и аудио вне его плеера, поэтому я не буду брать файл по этой ссылке.' },
  refused: { ka: 'ეს ბმული ისეთ საიტზე გადადის, საიდანაც ფაილს არ ავიღებ.', en: 'This link leads to a site I do not take files from.', ru: 'Ссылка ведёт на сайт, с которого я не беру файлы.' },
  stream: { ka: 'ეს ბმული სტრიმია (HLS/DASH) და არა ფაილი.', en: 'This link is a stream (HLS/DASH), not a file.', ru: 'Это поток (HLS/DASH), а не файл.' },
  not_media: { ka: 'ეს ბმული ვებგვერდს ხსნის და არა ვიდეო ან აუდიო ფაილს. მომეცი პირდაპირი ბმული ფაილზე (.mp4, .mp3…).', en: 'This link opens a web page, not a video or audio file. Send a direct link to the file (.mp4, .mp3…).', ru: 'Ссылка открывает веб-страницу, а не видео- или аудиофайл. Дайте прямую ссылку на файл (.mp4, .mp3…).' },
  unavailable: { ka: 'ბმული ახლა არ იხსნება.', en: 'The link does not open right now.', ru: 'Ссылка сейчас не открывается.' },
  blocked_host: { ka: 'ეს მისამართი შიდა ან დახურულ ქსელშია და იქიდან ფაილს არ ავიღებ.', en: 'This address is on an internal or closed network, and I do not fetch from there.', ru: 'Адрес во внутренней или закрытой сети, оттуда я не скачиваю.' },
  too_large: { ka: 'ფაილი 200 მბ-ზე დიდია.', en: 'The file is over 200 MB.', ru: 'Файл больше 200 МБ.' },
  too_long: { ka: 'ფაილი 60 წუთზე გრძელია.', en: 'The file is longer than 60 minutes.', ru: 'Файл длиннее 60 минут.' },
  media_not_yours: { ka: 'ეს ფაილი შენი ატვირთული არ არის.', en: 'This file is not one of your uploads.', ru: 'Это не ваш файл.' },
  unreadable: { ka: 'ფაილი ვერ წავიკითხე.', en: 'I could not read the file.', ru: 'Не удалось прочитать файл.' },
  no_audio: { ka: 'ამ ფაილში ხმა არ არის, ამოსაღები არაფერია.', en: 'This file has no sound, so there is nothing to take out.', ru: 'В файле нет звука, извлекать нечего.' },
  not_configured: { ka: 'ეს ფუნქცია ამ სერვერზე ჯერ არ არის ჩართული.', en: 'This is not set up on this server yet.', ru: 'На этом сервере это ещё не настроено.' },
  invalid_request: { ka: 'გეგმა დაზიანდა. გამომიგზავნე ბმული ან ფაილი თავიდან.', en: 'The plan was damaged. Send the link or file again.', ru: 'План повреждён. Отправьте ссылку или файл снова.' },
  quote_invalid: { ka: 'გეგმა დაზიანდა. გამომიგზავნე ბმული ან ფაილი თავიდან.', en: 'The plan was damaged. Send the link or file again.', ru: 'План повреждён. Отправьте ссылку или файл снова.' },
  quote_changed: { ka: 'გეგმა შეიცვალა. გამომიგზავნე ბმული ან ფაილი თავიდან.', en: 'The plan changed. Send the link or file again.', ru: 'План изменился. Отправьте ссылку или файл снова.' },
  quote_expired: { ka: 'გეგმას ვადა გაუვიდა (30 წუთი). გამომიგზავნე ბმული ან ფაილი თავიდან.', en: 'This plan expired (30 minutes). Send the link or file again.', ru: 'Срок плана истёк (30 минут). Отправьте ссылку или файл снова.' },
  already_failed: { ka: 'ეს უკვე ერთხელ ჩავარდა. გამომიგზავნე ბმული ან ფაილი თავიდან.', en: 'This already failed once. Send the link or file again.', ru: 'Это уже не удалось. Отправьте ссылку или файл снова.' },
  jobs_unavailable: { ka: 'რიგი ახლა მიუწვდომელია. სცადე ცოტა ხანში.', en: 'The queue is unavailable right now. Try again shortly.', ru: 'Очередь сейчас недоступна. Попробуйте чуть позже.' },
  extract_failed: { ka: 'ხმის ამოღება ვერ მოხერხდა. არაფერი ჩამოგეჭრა.', en: 'The sound could not be taken out. Nothing was charged.', ru: 'Извлечь звук не удалось. Ничего не списано.' },
  qc_failed: { ka: 'შედეგმა შემოწმება ვერ გაიარა, ამიტომ არ გაჩვენებ.', en: 'The result failed its check, so I am not showing it.', ru: 'Результат не прошёл проверку, поэтому я его не показываю.' },
  upload_failed: { ka: 'ფაილი ვერ შევინახე ან ვერ ავტვირთე. სცადე თავიდან.', en: 'The file could not be stored or uploaded. Try again.', ru: 'Файл не удалось сохранить или загрузить. Попробуйте снова.' },
  cancelled: { ka: 'გავაჩერე.', en: 'Stopped.', ru: 'Остановлено.' },
  not_found: { ka: 'ეს დავალება ვერ ვიპოვე.', en: 'I could not find this job.', ru: 'Задача не найдена.' },
  not_running: { ka: 'ეს უკვე აღარ მიმდინარეობს.', en: 'This is no longer running.', ru: 'Это уже не выполняется.' },
  network: { ka: 'კავშირი გაწყდა. სცადე თავიდან.', en: 'The connection dropped. Try again.', ru: 'Соединение прервалось. Попробуйте снова.' },
  closed: { ka: 'Agent G-ის ეს ფუნქცია შენთვის ჯერ არ არის ჩართული.', en: 'This Agent G feature is not open to you yet.', ru: 'Эта функция Agent G для вас пока не открыта.' },
  unauthenticated: { ka: 'ჯერ შედი ანგარიშზე.', en: 'Sign in first.', ru: 'Сначала войдите.' },
  rate_limited: { ka: 'ძალიან ბევრი მოთხოვნაა ერთად. სცადე ერთ წუთში.', en: 'Too many requests at once. Try again in a minute.', ru: 'Слишком много запросов. Попробуйте через минуту.' },
};

/** Agent G's words for a refusal; `platform` names the site for a platform refusal. Offers the upload when it helps. */
export function audioErrorText(code: string | undefined, locale: string, platform?: string): string {
  const lang = pick(locale);
  const row = (code && (ERR as Record<string, Record<Lang, string>>)[code]) || ERR.extract_failed;
  const text = platform ? row[lang].replace('{p}', platform)
    : row[lang].replace('{p}-ის', 'ამ პლატფორმის').replace('{p}', lang === 'en' ? 'This platform' : 'этой платформы');
  return code && OFFER_UPLOAD.has(code) ? text + UPLOAD[lang] : text;
}

/** The code a refused response carries, or what its HTTP status means when it carries none. */
export function audioCodeOf(status: number, body: unknown): AudioChatCode {
  const e = (body as { error?: unknown } | null)?.error;
  if (typeof e === 'string' && e in ERR && e !== 'not_found') return e as AudioChatCode;
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate_limited';
  if (status === 404) return typeof (body as { message?: unknown } | null)?.message === 'string' ? 'not_found' : 'closed';
  return 'extract_failed';
}

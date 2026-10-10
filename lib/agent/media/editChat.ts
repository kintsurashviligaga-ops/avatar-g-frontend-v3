/**
 * lib/agent/media/editChat.ts — the studio chat's side of Agent G's edit (./editExec behind /api/agent/media/edit): the
 * edits of a plan in words, what Agent G says at each stage, its refusals, in ka · en · ru. Pure, no network, safe in the
 * browser. ./editWords reads the user's words into asks; the server resolves them against the file, and this module says
 * back what it resolved („keeps 0:05–0:12 · 9:16 cropped") before anyone presses Start.
 */
import { formatDuration } from './audioChat';
import type { EditErrorCode, EditQuote } from './editExec';
import type { MediaEdit } from './editPlan';
import type { EditAsk } from './editWords';

type Lang = 'ka' | 'en' | 'ru';
const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');
const q = (lang: Lang, s: string) => (lang === 'ka' ? `„${s}“` : lang === 'ru' ? `«${s}»` : `“${s}”`);
/** 0.5 → „0.5", 2 → „2", 1.25 → „1.25". */
const num = (n: number): string => String(Math.round(n * 100) / 100);
/** A point in the video: „0:05", or „0:05.5" when it falls between seconds. */
function at(sec: number): string {
  const whole = Math.floor(sec + 1e-6);
  const frac = Math.round((sec - whole) * 10);
  return frac > 0 && frac < 10 ? `${formatDuration(whole)}.${frac}` : formatDuration(Math.round(sec));
}

export type AgentEditPhase = 'reading' | 'quoted' | 'running' | 'done' | 'failed' | 'cancelled' | 'dismissed';

/** One edit card in the thread. Never persisted: the result is the bubble's own player or picture (Download, Library). */
export interface AgentEditState {
  phase: AgentEditPhase;
  quote?: EditQuote;
  /** The signed plan, sent back verbatim on Start (the server checks it against the token). */
  request?: unknown;
  token?: string;
  /** The user's attached file, or the result Agent G made last in this thread. */
  source?: 'file' | 'previous';
  /** What was asked: the edits, and the link of Agent G's own result when that is the video. Retry asks again with it. */
  ask?: { edits: EditAsk[]; url?: string };
  pct?: number;
  /** The job's last stage: kept through a stop or a failure, so the card marks the step it ended on. */
  stage?: string | null;
  stopping?: boolean;
  t0?: number;
  t1?: number;
  error?: string;
}

const GRADE: Record<string, Record<Lang, string>> = {
  noir: { ka: 'შავ-თეთრი', en: 'black and white', ru: 'чёрно-белый' },
  vintage: { ka: 'ვინტაჟი', en: 'vintage', ru: 'винтаж' },
  neon: { ka: 'ნეონი', en: 'neon', ru: 'неон' },
  dramatic: { ka: 'დრამატული', en: 'dramatic', ru: 'драматичный' },
  cinematic: { ka: 'კინემატოგრაფიული', en: 'cinematic', ru: 'кинематографичный' },
};

/** One resolved edit in a few words: „keeps 0:05–0:12", „2× faster", „9:16, cropped", „sound off". */
export function editLine(e: MediaEdit, locale: string): string {
  const lang = pick(locale);
  const s = lang === 'en' ? 's' : lang === 'ru' ? 'с' : 'წმ';
  switch (e.op) {
    case 'trim':
      return lang === 'en' ? `keeps ${at(e.fromSec)}–${at(e.toSec)}` : lang === 'ru' ? `оставляю ${at(e.fromSec)}–${at(e.toSec)}` : `ვტოვებ ${at(e.fromSec)}–${at(e.toSec)}`;
    case 'speed':
      return e.factor >= 1
        ? (lang === 'en' ? `${num(e.factor)}× faster` : lang === 'ru' ? `быстрее в ${num(e.factor)}×` : `${num(e.factor)}×-ით აჩქარება`)
        : (lang === 'en' ? `${num(e.factor)}× speed (slower)` : lang === 'ru' ? `скорость ${num(e.factor)}× (медленнее)` : `${num(e.factor)}× სიჩქარე (შენელება)`);
    case 'aspect': {
      const fit = e.fit === 'pad'
        ? (lang === 'en' ? 'with bars, nothing cut' : lang === 'ru' ? 'с полями, без обрезки' : 'ზოლებით, არაფერი იჭრება')
        : (lang === 'en' ? 'cropped to fill' : lang === 'ru' ? 'с обрезкой по краям' : 'კიდეების ჩამოჭრით');
      return lang === 'en' ? `frame ${e.to}, ${fit}` : lang === 'ru' ? `кадр ${e.to}, ${fit}` : `კადრი ${e.to}, ${fit}`;
    }
    case 'grade': {
      const name = GRADE[e.style]?.[lang] ?? e.style;
      return lang === 'en' ? `${name} colour` : lang === 'ru' ? `цвет: ${name}` : `ფერი: ${name}`;
    }
    case 'fade': {
      const parts: string[] = [];
      if (e.inSec > 0) parts.push(lang === 'en' ? `fade in ${num(e.inSec)} ${s}` : lang === 'ru' ? `появление ${num(e.inSec)} ${s}` : `გამოჩენა ${num(e.inSec)} ${s}`);
      if (e.outSec > 0) parts.push(lang === 'en' ? `fade out ${num(e.outSec)} ${s}` : lang === 'ru' ? `затухание ${num(e.outSec)} ${s}` : `ჩაქრობა ${num(e.outSec)} ${s}`);
      return parts.join(', ');
    }
    case 'volume': {
      const db = `${e.db > 0 ? '+' : ''}${num(e.db)} ${lang === 'ru' ? 'дБ' : 'dB'}`;
      return lang === 'en' ? `sound ${db}` : lang === 'ru' ? `звук ${db}` : `ხმა ${db}`;
    }
    case 'mute':
      return lang === 'en' ? 'sound off' : lang === 'ru' ? 'без звука' : 'ხმის გარეშე';
    case 'caption':
      return lang === 'en' ? `caption ${q(lang, e.text)}` : lang === 'ru' ? `подпись ${q(lang, e.text)}` : `წარწერა ${q(lang, e.text)}`;
    case 'thumbnail':
      return lang === 'en' ? `a still from ${at(e.atSec)}` : lang === 'ru' ? `кадр с ${at(e.atSec)}` : `კადრი ${at(e.atSec)}-დან`;
  }
}

/** The plan's edits on one line: „keeps 0:05–0:12 · 2× faster · frame 9:16, cropped to fill". */
export function editsLine(edits: readonly MediaEdit[], locale: string): string {
  return edits.map((e) => editLine(e, locale)).join(' · ');
}

/** What comes out: „MP4 · 0:05 · 1080×1920" or „JPEG · 1080×1920". */
export function outputLine(plan: EditQuote['plan'], locale: string): string {
  const lang = pick(locale);
  const size = `${plan.width}×${plan.height}`;
  if (plan.output === 'jpg') return `JPEG · ${size}`;
  const sound = plan.hasAudio ? '' : lang === 'en' ? ' · no sound' : lang === 'ru' ? ' · без звука' : ' · უხმოდ';
  return `MP4 · ${formatDuration(plan.durationSec)} · ${size}${sound}`;
}

/** Agent G's plan, in words: what it will do, what comes out, the price, and that nothing starts before Start. */
export function editQuoteText(quote: EditQuote, locale: string, source: 'file' | 'previous' = 'file'): string {
  const lang = pick(locale);
  const from = source === 'previous'
    ? (lang === 'en' ? 'Source: the result I made last here.' : lang === 'ru' ? 'Источник: мой последний результат здесь.' : 'წყარო: ჩემი ბოლო შედეგი აქ.')
    : (lang === 'en' ? 'Source: your video.' : lang === 'ru' ? 'Источник: ваше видео.' : 'წყარო: შენი ვიდეო.');
  const plan = lang === 'en' ? `Plan: ${editsLine(quote.edits, locale)}.` : lang === 'ru' ? `План: ${editsLine(quote.edits, locale)}.` : `გეგმა: ${editsLine(quote.edits, locale)}.`;
  const out = lang === 'en' ? `Result: ${q(lang, quote.name)}, ${outputLine(quote.plan, locale)}.`
    : lang === 'ru' ? `Результат: ${q(lang, quote.name)}, ${outputLine(quote.plan, locale)}.`
      : `შედეგი: ${q(lang, quote.name)}, ${outputLine(quote.plan, locale)}.`;
  const price = quote.credits > 0
    ? (lang === 'en' ? `Price: ✦ ${quote.credits}.` : lang === 'ru' ? `Цена: ✦ ${quote.credits}.` : `ფასი: ✦ ${quote.credits}.`)
    : (lang === 'en' ? 'Free.' : lang === 'ru' ? 'Бесплатно.' : 'უფასოა.');
  const go = lang === 'en' ? 'Nothing starts until you press Start.' : lang === 'ru' ? 'Ничего не начнётся, пока вы не нажмёте «Начать».' : 'არაფერი დაიწყება, სანამ „დაწყებას“ არ დააჭერ.';
  return `${from}\n${plan}\n${out}\n${price} ${go}`;
}

/** What Agent G says while it uploads and reads the file (or opens its own last result). */
export function readingText(source: 'file' | 'previous', locale: string): string {
  const lang = pick(locale);
  if (source === 'previous') {
    return lang === 'en' ? 'Opening my last result and planning the edit…' : lang === 'ru' ? 'Открываю мой последний результат и планирую правку…' : 'ვხსნი ჩემს ბოლო შედეგს და ვგეგმავ ცვლილებას…';
  }
  return lang === 'en' ? 'Uploading your video and planning the edit…' : lang === 'ru' ? 'Загружаю ваше видео и планирую правку…' : 'ვტვირთავ შენს ვიდეოს და ვგეგმავ ცვლილებას…';
}

const STAGE: Record<string, Record<Lang, string>> = {
  queued: { ka: 'რიგშია, მალე დავიწყებ', en: 'Queued, starting shortly', ru: 'В очереди, скоро начну' },
  starting: { ka: 'ვიწყებ', en: 'Starting', ru: 'Начинаю' },
  retrying: { ka: 'სერვერი შეფერხდა, თავიდან ვიწყებ', en: 'The server stalled, so I am starting again', ru: 'Сервер остановился, начинаю заново' },
  render: { ka: 'ვიდეოს ვამუშავებ', en: 'Editing the video', ru: 'Обрабатываю видео' },
  qc: { ka: 'ვამოწმებ შედეგს', en: 'Checking the result', ru: 'Проверяю результат' },
  upload: { ka: 'ვინახავ', en: 'Saving it', ru: 'Сохраняю' },
  completed: { ka: 'მზადაა', en: 'Ready', ru: 'Готово' },
};

export function editStageText(stage: string | null | undefined, locale: string): string {
  const lang = pick(locale);
  return (stage && STAGE[stage]?.[lang]) ?? STAGE.starting![lang];
}

export function editDoneText(r: { output: 'mp4' | 'jpg'; name: string; durationSec: number; width: number; height: number }, locale: string): string {
  const lang = pick(locale);
  const size = `${r.width}×${r.height}`;
  if (r.output === 'jpg') {
    return lang === 'en' ? `Ready: ${q(lang, r.name)}, ${size}. Download it or find it in your Library.`
      : lang === 'ru' ? `Готово: ${q(lang, r.name)}, ${size}. Скачайте или найдите в Библиотеке.`
        : `მზადაა: ${q(lang, r.name)}, ${size}. ჩამოტვირთე ან ნახე ბიბლიოთეკაში.`;
  }
  const facts = `${formatDuration(r.durationSec)} · ${size}`;
  return lang === 'en' ? `Ready: ${q(lang, r.name)}, ${facts}. Watch it here, download it, or find it in your Library.`
    : lang === 'ru' ? `Готово: ${q(lang, r.name)}, ${facts}. Смотрите здесь, скачайте или найдите в Библиотеке.`
      : `მზადაა: ${q(lang, r.name)}, ${facts}. ნახე აქვე, ჩამოტვირთე ან იპოვე ბიბლიოთეკაში.`;
}

export type EditChatCode = EditErrorCode | 'upload_failed' | 'network' | 'closed' | 'unauthenticated' | 'rate_limited' | 'no_previous' | 'caption_text'
  | 'cut_middle' | 'approval_unclear';

const AGAIN: Record<Lang, string> = { ka: ' მითხარი თავიდან, რა შევცვალო.', en: ' Tell me again what to change.', ru: ' Скажите ещё раз, что изменить.' };

const ERR: Record<EditChatCode, Record<Lang, string>> = {
  approval_unclear: { ka: 'შენი „კი“ ვერ გავიგე, ამიტომ არაფერი დამიწყია. თქვი „კი, დაიწყე“ ან დააჭირე Start-ს.', en: 'I did not hear a clear yes from you, so nothing was started. Say "yes, start" or tap Start.', ru: 'Я не услышал от вас чёткого «да», поэтому ничего не запущено. Скажите «да, начинай» или нажмите Start.' },
  bad_input: { ka: 'ვიდეო ვერ მივიღე. მიამაგრე ერთი შენი ვიდეო.', en: 'I did not get a video. Attach one of your videos.', ru: 'Видео не получено. Прикрепите одно ваше видео.' },
  bad_edits: { ka: 'ეს ცვლილება ვერ გავიგე.', en: 'I could not read this edit.', ru: 'Не удалось понять правку.' },
  nothing_to_do: { ka: 'ვერ გავიგე, რა შევცვალო: მაგალითად „დატოვე 5-დან 12 წამამდე", „გახადე 9:16" ან „ხმა გათიშე".', en: 'I could not tell what to change: for example "keep 5 to 12 seconds", "make it 9:16" or "mute it".', ru: 'Не понял, что изменить: например «оставь с 5 по 12 секунду», «сделай 9:16» или «убери звук».' },
  out_of_range: { ka: 'ეს დრო ვიდეოს გარეთაა.', en: 'That time is outside the video.', ru: 'Это время за пределами видео.' },
  too_long: { ka: 'შედეგი 5 წუთზე გრძელი გამოვა. აირჩიე უფრო მოკლე მონაკვეთი.', en: 'The result would be longer than 5 minutes. Pick a shorter stretch.', ru: 'Результат длиннее 5 минут. Выберите отрезок короче.' },
  too_short: { ka: 'შედეგი ნახევარ წამზე მოკლე გამოვა.', en: 'The result would be shorter than half a second.', ru: 'Результат короче полсекунды.' },
  conflict: { ka: 'ეს ცვლილებები ერთად არ გამოდის (მაგალითად კადრი და ხმა, ან გათიშვა და ხმამაღლა).', en: 'These edits do not go together (for example a still and a sound change, or mute and louder).', ru: 'Эти правки несовместимы (например, кадр и звук, или без звука и громче).' },
  no_video: { ka: 'ამ ფაილში გამოსახულება არ არის.', en: 'This file has no picture.', ru: 'В файле нет изображения.' },
  media_not_yours: { ka: 'ეს ფაილი შენი არ არის.', en: 'This file is not one of yours.', ru: 'Это не ваш файл.' },
  unreadable: { ka: 'ფაილი ვერ წავიკითხე.', en: 'I could not read the file.', ru: 'Не удалось прочитать файл.' },
  not_configured: { ka: 'ეს ფუნქცია ამ სერვერზე ჯერ არ არის ჩართული.', en: 'This is not set up on this server yet.', ru: 'На этом сервере это ещё не настроено.' },
  invalid_request: { ka: 'გეგმა დაზიანდა.', en: 'The plan was damaged.', ru: 'План повреждён.' },
  quote_invalid: { ka: 'გეგმა დაზიანდა.', en: 'The plan was damaged.', ru: 'План повреждён.' },
  quote_changed: { ka: 'გეგმა შეიცვალა.', en: 'The plan changed.', ru: 'План изменился.' },
  quote_expired: { ka: 'გეგმას ვადა გაუვიდა (30 წუთი).', en: 'This plan expired (30 minutes).', ru: 'Срок плана истёк (30 минут).' },
  already_failed: { ka: 'ეს უკვე ერთხელ ჩავარდა.', en: 'This already failed once.', ru: 'Это уже не удалось.' },
  jobs_unavailable: { ka: 'რიგი ახლა მიუწვდომელია. სცადე ცოტა ხანში.', en: 'The queue is unavailable right now. Try again shortly.', ru: 'Очередь сейчас недоступна. Попробуйте чуть позже.' },
  source_changed: { ka: 'ფაილი შეიცვალა გეგმის შემდეგ.', en: 'The file changed after the plan.', ru: 'Файл изменился после плана.' },
  render_failed: { ka: 'ვიდეო ვერ დავამუშავე. არაფერი ჩამოგეჭრა.', en: 'The video could not be edited. Nothing was charged.', ru: 'Видео обработать не удалось. Ничего не списано.' },
  unavailable: { ka: 'ფაილი ახლა არ იხსნება.', en: 'The file does not open right now.', ru: 'Файл сейчас не открывается.' },
  too_large: { ka: 'ფაილი ძალიან დიდია.', en: 'The file is too large.', ru: 'Файл слишком большой.' },
  qc_failed: { ka: 'შედეგმა შემოწმება ვერ გაიარა, ამიტომ არ გაჩვენებ.', en: 'The result failed its check, so I am not showing it.', ru: 'Результат не прошёл проверку, поэтому я его не показываю.' },
  upload_failed: { ka: 'ფაილი ვერ შევინახე ან ვერ ავტვირთე. სცადე თავიდან.', en: 'The file could not be stored or uploaded. Try again.', ru: 'Файл не удалось сохранить или загрузить. Попробуйте снова.' },
  cancelled: { ka: 'გავაჩერე.', en: 'Stopped.', ru: 'Остановлено.' },
  not_found: { ka: 'ეს დავალება ვერ ვიპოვე.', en: 'I could not find this job.', ru: 'Задача не найдена.' },
  not_running: { ka: 'ეს უკვე აღარ მიმდინარეობს.', en: 'This is no longer running.', ru: 'Это уже не выполняется.' },
  network: { ka: 'კავშირი გაწყდა. სცადე თავიდან.', en: 'The connection dropped. Try again.', ru: 'Соединение прервалось. Попробуйте снова.' },
  closed: { ka: 'Agent G-ის ეს ფუნქცია შენთვის ჯერ არ არის ჩართული.', en: 'This Agent G feature is not open to you yet.', ru: 'Эта функция Agent G для вас пока не открыта.' },
  unauthenticated: { ka: 'ჯერ შედი ანგარიშზე.', en: 'Sign in first.', ru: 'Сначала войдите.' },
  rate_limited: { ka: 'ძალიან ბევრი მოთხოვნაა ერთად. სცადე ერთ წუთში.', en: 'Too many requests at once. Try again in a minute.', ru: 'Слишком много запросов. Попробуйте через минуту.' },
  no_previous: { ka: 'ამ საუბარში ჯერ ვიდეო არ გამიკეთებია. მიამაგრე ვიდეო, რომელიც შევცვალო.', en: 'I have not made a video in this chat yet. Attach the video to change.', ru: 'В этом чате я ещё не делал видео. Прикрепите видео, которое изменить.' },
  caption_text: { ka: 'რა ეწეროს? დაწერე ტექსტი ბრჭყალებში, მაგალითად: წარწერა „ზაფხული 2026".', en: 'What should it say? Put the text in quotes, for example: caption "Summer 2026".', ru: 'Что написать? Дайте текст в кавычках, например: подпись «Лето 2026».' },
  cut_middle: { ka: 'შუიდან მონაკვეთის ამოჭრა ერთ ცვლილებად ჯერ არ შემიძლია. შემიძლია დავტოვო ერთი მონაკვეთი ან მოვაჭრა დასაწყისი ან ბოლო.', en: 'I cannot cut a stretch out of the middle in one edit yet. I can keep one stretch, or cut off the start or the end.', ru: 'Вырезать отрезок из середины одной правкой я пока не могу. Могу оставить один отрезок или обрезать начало или конец.' },
};

/** Refusals where the user's next move is to say the edit again. */
const SAY_AGAIN: ReadonlySet<string> = new Set(['invalid_request', 'quote_invalid', 'quote_changed', 'quote_expired', 'already_failed', 'source_changed']);

/** Agent G's words for a refusal; the server's own message (a range, a length) follows a plan error when it has one. */
export function editErrorText(code: string | undefined, locale: string, detail?: string): string {
  const lang = pick(locale);
  const row = (code && (ERR as Record<string, Record<Lang, string>>)[code]) || ERR.render_failed;
  const text = row[lang];
  // The plan's own message names the numbers („The video is 30 s long.") in English; only the English card repeats it.
  const more = lang === 'en' && detail && (code === 'out_of_range' || code === 'conflict' || code === 'too_long') ? ` ${detail}` : '';
  return text + more + (code && SAY_AGAIN.has(code) ? AGAIN[lang] : '');
}

/** The code a refused response carries, or what its HTTP status means when it carries none. */
export function editCodeOf(status: number, body: unknown): EditChatCode {
  const e = (body as { error?: unknown } | null)?.error;
  if (typeof e === 'string' && e in ERR && e !== 'not_found') return e as EditChatCode;
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate_limited';
  if (status === 404) return typeof (body as { message?: unknown } | null)?.message === 'string' ? 'not_found' : 'closed';
  return 'render_failed';
}

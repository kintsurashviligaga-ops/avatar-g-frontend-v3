/**
 * lib/agent/media/montageChat.ts — the studio chat's side of Agent G's montage (slice 1): when a message is a request to
 * cut the attached clips to the attached track, and what Agent G says at each step, in ka · en · ru. Pure, no network,
 * safe in the browser; the executor is lib/agent/media/montageExec behind /api/agent/media/montage.
 *
 * ⚠️ WHY THE CHAT NEEDS ITS OWN TEST. Before this, clips + a song + „cut these to the music" went to the video REMIX
 * branch (components/studio/OmniStudio.tsx): it took the FIRST video only, laid the song under it as `add_music`,
 * charged for it, and dropped every other clip without a word. The rule here claims exactly those messages and nothing
 * the remix or the editor does better:
 *   · the files are video clips and ONE audio track, nothing else (a photo or a second track is not this edit);
 *   · the words are not a question („what song is this?" stays a question about the video);
 *   · with two or more clips, any music / beat / cut / montage word is enough: the remix could only ever use one clip;
 *   · with ONE clip, only a cut / montage word: „add music to this video" wants the whole clip with a song under it
 *     (the remix's add_music), not the clip chopped into shots — and a trim („cut the first 10 seconds") stays a trim.
 */
import { detectStudioIntent } from '@/lib/chat/studioIntent';
import { isVideoQuestion } from '@/lib/chat/videoIntent';
import type { MontageAspect } from '@/lib/services/montage/montagePlan';
import type { MontageErrorCode, MontageQuote } from './montageExec';
import { MAX_CLIPS } from './montageAsk';

export type AttachmentKind = 'video' | 'audio' | 'image' | 'other';
type Lang = 'ka' | 'en' | 'ru';

const MUSIC = /მუსიკ|ბიტ|რიტმ|სიმღერ|ტაქტ|music|song|track|beat|rhythm|tempo|музык|песн|трек|бит(?![а-яё])|ритм|такт/iu;
const CUT = new RegExp([
  'მონტაჟ|დაამონტაჟ|გააერთიან|შეაერთ|გადააბ|დაჭერ|დაჭრ|ააწყ',
  'montage|\\bedit\\b|\\bcut\\b|stitch|splice|combine|merge|\\bjoin\\b|\\breel\\b|tiktok|shorts',
  'монтаж|смонтир|склей|соедини|нарежь|нарез|рилс',
].join('|'), 'iu');
/** A trim of one clip is the remix's job, never a montage. */
const TRIM = /\btrim\b|\bcut\s+(?:the\s+)?(?:first|last|off|out|beginning|end)\b|მოჭერ|შემოკლ|обрез|обрежь/iu;

/** Is this message, with these attachments, a request to cut the clips to the track? */
export function beatMontageAsk(text: string, kinds: AttachmentKind[]): boolean {
  const t = (text || '').trim();
  if (!t || isVideoQuestion(t)) return false;
  const videos = kinds.filter((k) => k === 'video').length;
  const audios = kinds.filter((k) => k === 'audio').length;
  if (videos < 1 || videos > MAX_CLIPS || audios !== 1 || videos + audios !== kinds.length) return false;
  const montageWords = CUT.test(t) || detectStudioIntent(t)?.service === 'montage';
  if (videos === 1) return montageWords && !TRIM.test(t);
  return montageWords || MUSIC.test(t);
}

export type AgentMontagePhase = 'reading' | 'quoted' | 'running' | 'done' | 'failed' | 'cancelled' | 'dismissed';

/** One montage card in the thread. Never persisted: a reload keeps the result (the Library), not the buttons. */
export interface AgentMontageState {
  phase: AgentMontagePhase;
  quote?: MontageQuote;
  /** The signed plan, sent back verbatim on Confirm (the server checks it against the token). */
  request?: unknown;
  token?: string;
  /** The user's words: kept on the job for the Library card. */
  prompt?: string;
  /** The attachments' names, in the order sent: the quote names unused files by index. */
  names?: string[];
  pct?: number;
  stage?: string | null;
  error?: string;
}

const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');
const quoted = (lang: Lang, s: string) => (lang === 'ka' ? `„${s}“` : lang === 'ru' ? `«${s}»` : `“${s}”`);
const fileName = (names: string[] | undefined, i: number, lang: Lang) =>
  names?.[i] ? quoted(lang, names[i]!) : lang === 'en' ? `file ${i + 1}` : lang === 'ru' ? `файл ${i + 1}` : `ფაილი ${i + 1}`;
const sec = (n: number) => (Math.round(n * 10) / 10).toString();

export function orientationOf(aspect: MontageAspect | string | undefined): 'vertical' | 'square' | 'landscape' {
  return aspect === '9:16' ? 'vertical' : aspect === '1:1' ? 'square' : 'landscape';
}

export function priceLabel(credits: number, locale: string): string {
  const lang = pick(locale);
  if (credits > 0) return `✦ ${credits}`;
  return lang === 'en' ? 'Free' : lang === 'ru' ? 'Бесплатно' : 'უფასო';
}

/** What Agent G says while it uploads and reads the files. */
export function readingText(locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? 'Reading your clips and the track: lengths, format and the beat…'
    : lang === 'ru' ? 'Читаю клипы и трек: длительность, формат и бит…'
      : 'ვკითხულობ კლიპებს და მუსიკას: ხანგრძლივობას, ფორმატს და ბითს…';
}

/** Agent G's plan, in words: what it found, what it will make, what it costs, and that nothing starts before Confirm. */
export function quoteText(q: MontageQuote, names: string[] | undefined, locale: string): string {
  const lang = pick(locale);
  const found = q.beatSynced && q.bpm
    ? (lang === 'en' ? `The track is ${Math.round(q.bpm)} BPM; every cut lands on a beat.`
      : lang === 'ru' ? `Темп трека ${Math.round(q.bpm)} BPM; каждая склейка попадает в бит.`
        : `მუსიკის ტემპი ${Math.round(q.bpm)} BPM-ია; ყოველი ჭრა ბითზე მოდის.`)
    : (lang === 'en' ? 'I could not find a steady beat, so the cuts sit on an even half-second grid.'
      : lang === 'ru' ? 'Чёткого бита нет, поэтому склейки идут по ровной сетке в полсекунды.'
        : 'მკაფიო ბითი ვერ ვიპოვე, ამიტომ კადრებს თანაბარ, ნახევარწამიან ბადეზე ვჭრი.');
  const plan = lang === 'en'
    ? `Plan: ${q.shots} shots from ${q.clips} clip${q.clips === 1 ? '' : 's'}, ${sec(q.totalSec)} s, ${q.aspect}, with your track as the only sound.`
    : lang === 'ru'
      ? `План: ${q.shots} кадров из клипов (${q.clips}), ${sec(q.totalSec)} с, ${q.aspect}, звук — только ваш трек.`
      : `გეგმა: ${q.shots} კადრი ${q.clips} კლიპიდან, ${sec(q.totalSec)} წმ, ${q.aspect}, ხმად მხოლოდ შენი მუსიკა.`;
  const unused = q.unusedFiles.length
    ? ' ' + (lang === 'en'
      ? `${q.unusedFiles.map((i) => fileName(names, i, lang)).join(', ')} ${q.unusedFiles.length === 1 ? 'is' : 'are'} too short for one shot and stay out.`
      : lang === 'ru'
        ? `${q.unusedFiles.map((i) => fileName(names, i, lang)).join(', ')} — короче одного кадра, не вошли.`
        : `${q.unusedFiles.map((i) => fileName(names, i, lang)).join(', ')} ერთ კადრზე მოკლეა და არ შევიდა.`)
    : '';
  const price = q.credits > 0
    ? (lang === 'en' ? `Price: ✦ ${q.credits}.` : lang === 'ru' ? `Цена: ✦ ${q.credits}.` : `ფასი: ✦ ${q.credits}.`)
    : (lang === 'en' ? 'Free.' : lang === 'ru' ? 'Бесплатно.' : 'უფასოა.');
  const go = lang === 'en' ? 'Nothing starts until you press Start.' : lang === 'ru' ? 'Ничего не начнётся, пока вы не нажмёте «Начать».' : 'არაფერი დაიწყება, სანამ „დაწყებას“ არ დააჭერ.';
  return `${found}\n${plan}${unused}\n${price} ${go}`;
}

const STAGE: Record<string, Record<Lang, string>> = {
  resolve: { ka: 'ფაილებს ვამზადებ', en: 'Preparing the files', ru: 'Готовлю файлы' },
  bridge: { ka: 'ფაილებს ვამზადებ', en: 'Preparing the files', ru: 'Готовлю файлы' },
  normalize: { ka: 'კადრებს ვჭრი და ერთ ფორმატში მოვყავარ', en: 'Cutting the shots to one format', ru: 'Нарезаю кадры в один формат' },
  stitch: { ka: 'კადრებს ვაერთებ', en: 'Joining the shots', ru: 'Склеиваю кадры' },
  music: { ka: 'მუსიკას ვამატებ', en: 'Laying the track under it', ru: 'Накладываю трек' },
  completed: { ka: 'ვამოწმებ შედეგს', en: 'Checking the result', ru: 'Проверяю результат' },
};

export function stageText(stage: string | null | undefined, locale: string): string {
  const lang = pick(locale);
  return (stage && STAGE[stage]?.[lang]) ?? (lang === 'en' ? 'Starting the edit' : lang === 'ru' ? 'Запускаю монтаж' : 'მონტაჟს ვიწყებ');
}

/** A song too big for the chat's request body (let in only for the montage) sent with words that are not a montage. */
export function trackTooBigText(locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? 'This track is too big to send to the chat (over 4 MB). Attach your clips with it and say, for example, “cut these to the music”.'
    : lang === 'ru' ? 'Этот трек слишком большой для чата (больше 4 МБ). Прикрепите к нему клипы и напишите, например: «смонтируй под музыку».'
      : 'ეს მუსიკა ჩატში გასაგზავნად ძალიან დიდია (4 მბ-ზე მეტი). მიამაგრე მასთან კლიპები და დაწერე, მაგალითად: „დაამონტაჟე მუსიკაზე“.';
}

export function doneText(durationSec: number, locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? `Ready: ${sec(durationSec)} s, cut to your track. It is also in your Library.`
    : lang === 'ru' ? `Готово: ${sec(durationSec)} с, смонтировано под ваш трек. Видео есть и в Библиотеке.`
      : `მზადაა: ${sec(durationSec)} წმ, შენს მუსიკაზე დამონტაჟებული. ბიბლიოთეკაშიც შევინახე.`;
}

export type ChatErrorCode = MontageErrorCode | 'upload_failed' | 'network' | 'closed' | 'unauthenticated' | 'rate_limited';

const ERR: Record<ChatErrorCode, Record<Lang, string>> = {
  bad_input: { ka: 'ფაილები ვერ მივიღე. მიამაგრე კლიპები და ერთი მუსიკა თავიდან.', en: 'The files did not come through. Attach the clips and one track again.', ru: 'Файлы не дошли. Прикрепите клипы и один трек снова.' },
  too_many_files: { ka: `ერთ მონტაჟში მაქსიმუმ ${MAX_CLIPS} კლიპი და ერთი მუსიკაა.`, en: `One edit takes up to ${MAX_CLIPS} clips and one track.`, ru: `В один монтаж — до ${MAX_CLIPS} клипов и один трек.` },
  media_not_yours: { ka: '{f} შენი ატვირთული არ არის, ამიტომ მას ვერ გამოვიყენებ.', en: '{f} is not one of your uploads, so I cannot use it.', ru: '{f} — не ваш файл, его нельзя использовать.' },
  unreadable: { ka: '{f} ვერ წავიკითხე ვიდეოდ ან აუდიოდ. სცადე MP4 (H.264) ან MP3.', en: 'I could not read {f} as video or audio. Try MP4 (H.264) or MP3.', ru: 'Не удалось прочитать {f} как видео или аудио. Попробуйте MP4 (H.264) или MP3.' },
  no_clip: { ka: 'ვიდეო კლიპი ვერ ვიპოვე. მიამაგრე მინიმუმ ერთი.', en: 'I found no video clip. Attach at least one.', ru: 'Видеоклипа нет. Прикрепите хотя бы один.' },
  no_track: { ka: 'მუსიკა ვერ ვიპოვე. მიამაგრე ერთი აუდიო ფაილი.', en: 'I found no music track. Attach one audio file.', ru: 'Трека нет. Прикрепите один аудиофайл.' },
  several_tracks: { ka: 'ერთზე მეტი მუსიკაა. დატოვე მხოლოდ ერთი.', en: 'There is more than one track. Keep just one.', ru: 'Треков больше одного. Оставьте один.' },
  too_many_clips: { ka: `ერთ მონტაჟში მაქსიმუმ ${MAX_CLIPS} კლიპია.`, en: `One edit takes up to ${MAX_CLIPS} clips.`, ru: `В один монтаж — до ${MAX_CLIPS} клипов.` },
  plan_failed: { ka: 'ამ ფაილებით მონტაჟი არ გამოდის: კლიპები ან მუსიკა ძალიან მოკლეა.', en: 'No edit fits these files: the clips or the track are too short.', ru: 'Из этих файлов монтаж не собрать: клипы или трек слишком короткие.' },
  not_configured: { ka: 'მონტაჟი ამ სერვერზე ჯერ არ არის ჩართული.', en: 'Montage is not set up on this server yet.', ru: 'Монтаж на этом сервере ещё не настроен.' },
  invalid_request: { ka: 'გეგმა დაზიანდა. გამომიგზავნე ფაილები თავიდან.', en: 'The plan was damaged. Send the files again.', ru: 'План повреждён. Отправьте файлы снова.' },
  quote_invalid: { ka: 'გეგმა დაზიანდა. გამომიგზავნე ფაილები თავიდან.', en: 'The plan was damaged. Send the files again.', ru: 'План повреждён. Отправьте файлы снова.' },
  quote_changed: { ka: 'გეგმა შეიცვალა. გამომიგზავნე ფაილები თავიდან.', en: 'The plan changed. Send the files again.', ru: 'План изменился. Отправьте файлы снова.' },
  quote_expired: { ka: 'გეგმას ვადა გაუვიდა (30 წუთი). გამომიგზავნე ფაილები თავიდან.', en: 'This plan expired (30 minutes). Send the files again.', ru: 'Срок плана истёк (30 минут). Отправьте файлы снова.' },
  in_progress: { ka: 'ეს მონტაჟი უკვე მიმდინარეობს.', en: 'This edit is already running.', ru: 'Этот монтаж уже идёт.' },
  already_failed: { ka: 'ეს მონტაჟი უკვე ჩავარდა. გამომიგზავნე ფაილები თავიდან.', en: 'This edit already failed. Send the files again.', ru: 'Этот монтаж уже не удался. Отправьте файлы снова.' },
  jobs_unavailable: { ka: 'მონტაჟის რიგი ახლა მიუწვდომელია. სცადე ცოტა ხანში.', en: 'The edit queue is unavailable right now. Try again shortly.', ru: 'Очередь монтажа сейчас недоступна. Попробуйте чуть позже.' },
  insufficient_credits: { ka: 'კრედიტი არ გყოფნის.', en: 'Not enough credits.', ru: 'Недостаточно кредитов.' },
  billing_unavailable: { ka: 'ბალანსი ახლა ვერ შევამოწმე. არაფერი ჩამოგეჭრა; სცადე ცოტა ხანში.', en: 'I could not check your balance. Nothing was charged; try again shortly.', ru: 'Не удалось проверить баланс. Ничего не списано; попробуйте чуть позже.' },
  render_failed: { ka: 'მონტაჟი ვერ დასრულდა. არაფერი ჩამოგეჭრა.', en: 'The edit did not finish. Nothing was charged.', ru: 'Монтаж не завершился. Ничего не списано.' },
  qc_failed: { ka: 'შედეგმა შემოწმება ვერ გაიარა, ამიტომ არ გაჩვენებ. არაფერი ჩამოგეჭრა.', en: 'The result failed its check, so I am not showing it. Nothing was charged.', ru: 'Результат не прошёл проверку, поэтому я его не показываю. Ничего не списано.' },
  cancelled: { ka: 'მონტაჟი გავაჩერე.', en: 'Edit stopped.', ru: 'Монтаж остановлен.' },
  not_found: { ka: 'ეს მონტაჟი ვერ ვიპოვე.', en: 'I could not find this edit.', ru: 'Монтаж не найден.' },
  not_running: { ka: 'ეს მონტაჟი უკვე აღარ მიმდინარეობს.', en: 'This edit is no longer running.', ru: 'Этот монтаж уже не идёт.' },
  upload_failed: { ka: '{f} ვერ ავტვირთე (მაქს. 50 მბ, ვიდეო ან აუდიო).', en: 'I could not upload {f} (up to 50 MB, video or audio).', ru: 'Не удалось загрузить {f} (до 50 МБ, видео или аудио).' },
  network: { ka: 'კავშირი გაწყდა. სცადე თავიდან.', en: 'The connection dropped. Try again.', ru: 'Соединение прервалось. Попробуйте снова.' },
  closed: { ka: 'Agent G-ის მონტაჟი შენთვის ჯერ არ არის ჩართული.', en: 'Agent G montage is not open to you yet.', ru: 'Монтаж Agent G для вас пока не открыт.' },
  unauthenticated: { ka: 'ჯერ შედი ანგარიშზე.', en: 'Sign in first.', ru: 'Сначала войдите.' },
  rate_limited: { ka: 'ძალიან ბევრი მოთხოვნაა ერთად. სცადე ერთ წუთში.', en: 'Too many requests at once. Try again in a minute.', ru: 'Слишком много запросов. Попробуйте через минуту.' },
};

/** Agent G's words for a refusal; `files` are 0-based indices into `names`. */
export function errorText(code: string | undefined, locale: string, files?: number[], names?: string[]): string {
  const lang = pick(locale);
  const row = (code && (ERR as Record<string, Record<Lang, string>>)[code]) || ERR.render_failed;
  const f = files?.length ? files.map((i) => fileName(names, i, lang)).join(', ') : (lang === 'en' ? 'One file' : lang === 'ru' ? 'Один файл' : 'ერთი ფაილი');
  return row[lang].replace('{f}', f);
}

/** The code a refused response carries, or what its HTTP status means when it carries none. */
export function codeOf(status: number, body: unknown): ChatErrorCode {
  const e = (body as { error?: unknown } | null)?.error;
  if (typeof e === 'string' && e in ERR && e !== 'not_found') return e as ChatErrorCode;
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate_limited';
  // The route answers a bare 404 when the flag is closed to this user; a missing edit says not_found with a message.
  if (status === 404) return typeof (body as { message?: unknown } | null)?.message === 'string' ? 'not_found' : 'closed';
  return 'render_failed';
}

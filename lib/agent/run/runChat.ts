/**
 * lib/agent/run/runChat.ts — the studio chat's side of a multi-step Agent G run (PART 6): which messages ask for two
 * steps chained, the run spec they make, and what Agent G says about the run in ka · en · ru. Pure, no network, safe in
 * the browser; the run itself is ./runExec behind /api/tasks.
 *
 * TWO CHAINS, both asks the one-step cards could not serve:
 *
 *   sound-cut  „take the sound of the first video (or of this link) and cut the other clips to it": the files are only
 *              videos, so the montage has no track. Step 1 takes the sound out (audio_extract: the same source policy
 *              and rights check as the MP3 card, so a platform link is refused by name, never worked around); step 2
 *              cuts the clips to that sound (montage).
 *   cut-edit   clips + one track + „cut these to the music, black and white, with the caption …": the montage card
 *              would cut and drop the rest. Step 1 is the montage; step 2 edits its result (edit) with what a montage
 *              does not do itself: a colour grade, fades, the volume, a caption.
 *
 * Conservative like the one-step detectors: a question about a video, vocals apart from the instrumental, a source
 * that names a file that is not there, or an edit that would undo the montage (speed, mute) is not claimed here. The
 * plan card shows every step and the price before Start, so a misread never runs unseen.
 *
 * ⚠️ NO `\b` NEXT TO GEORGIAN OR CYRILLIC (ASCII-only). Token edges there are Unicode lookarounds.
 */
import { isVideoQuestion } from '@/lib/chat/videoIntent';
import { findLinks, withoutLinks } from '@/lib/agent/media/audioSource';
import { beatMontageAsk, type AttachmentKind } from '@/lib/agent/media/montageChat';
import { MAX_CLIPS } from '@/lib/agent/media/montageAsk';
import { mineEdits, type EditAsk } from '@/lib/agent/media/editWords';
import type { RunSpec } from './runSpec';

type Lang = 'ka' | 'en' | 'ru';
const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

const L0 = '(?<![\\p{L}\\p{N}])';
const L1 = '(?![\\p{L}\\p{N}])';

/** A sound word (lib/agent/media/audioChat SOUND). */
const SOUND = /audio|sound|soundtrack|music|song|track|აუდიო|ხმ[აისე]|სიმღერ|მუსიკ|ტრეკ|звук|аудио|музык|песн|трек/iu;
/** Taking or using it: the MP3 card's take-out verbs, and the plain „take / use" a chained ask is said with. */
const TAKE = new RegExp([
  '\\btake\\b|\\btaking\\b|\\buse\\b|\\busing\\b|\\bgrab\\b|\\bborrow|\\bextract|\\brip\\b|\\bpull\\b|\\bseparate',
  'აიღ|ამოიღ|ამომიღ|ამოაღ|გამოიყენ|გამოყავ|გამომიყავ|გამოყოფ|გამოაცალ|წაიღ',
  'возьм|бери|взять|используй|использу|извлеч|извлек|вытащ|выдели|достань|отдели',
].join('|'), 'iu');
/** Vocals apart from the instrumental: stems, a different job. */
const STEMS = /vocal|stems?\b|instrumental|acapella|a cappella|karaoke|ვოკალ|მინუს|ინსტრუმენტ|караоке|вокал|минус|инструментал/iu;

const FILE_WORD = '(?:videos?|clips?|files?|one|ვიდეო\\p{L}*|კლიპ\\p{L}*|ფაილ\\p{L}*|видео|клип\\p{L}*|ролик\\p{L}*|файл\\p{L}*)';
/** „the first video", „პირველი ვიდეოს", „из первого ролика": an ordinal, at most one word, then a file word. */
const ORDINALS: ReadonlyArray<{ at: number | 'last'; re: RegExp }> = [
  { at: 0, re: new RegExp(`${L0}(?:first|1st|პირველ\\p{L}*|перв\\p{L}*)\\s+(?:\\p{L}+\\s+)?${FILE_WORD}${L1}`, 'giu') },
  { at: 1, re: new RegExp(`${L0}(?:second|2nd|მეორე\\p{L}*|втор\\p{L}*)\\s+(?:\\p{L}+\\s+)?${FILE_WORD}${L1}`, 'giu') },
  { at: 2, re: new RegExp(`${L0}(?:third|3rd|მესამე\\p{L}*|трет\\p{L}*)\\s+(?:\\p{L}+\\s+)?${FILE_WORD}${L1}`, 'giu') },
  { at: 'last', re: new RegExp(`${L0}(?:last|final|ბოლო\\p{L}*|последн\\p{L}*)\\s+(?:\\p{L}+\\s+)?${FILE_WORD}${L1}`, 'giu') },
];
/** „video 2", „ვიდეო 2", „видео №2" (not a frame like „9:16"). */
const NUMBERED = new RegExp(`${L0}(?:video|clip|file|ვიდეო|კლიპ|ფაილ|видео|клип|ролик|файл)\\p{L}*\\s*(?:#|№)?\\s*(\\d{1,2})(?![\\d:x×/])`, 'giu');
/** Every file, the sound's source among the clips too … unless the words say „the other ones". */
const ALL = new RegExp(`${L0}(?:all|every|ყველა|ყველ\\p{L}+|все|всех|всё)${L1}`, 'iu');
const OTHER = /other|rest|remaining|დანარჩენ|სხვა|остальн|другие|других/iu;

/** The edits a montage leaves to an edit step; speed and mute would undo the cut to the beat, a trim or frame it does itself. */
const AFTER_MONTAGE: ReadonlySet<EditAsk['op']> = new Set(['grade', 'fade', 'volume', 'caption']);
/** A fade „between the clips" is a transition, which a whole-video fade is not. */
const TRANSITION = /between|transition|გადასვლ|შორის|между|переход/iu;

export type RunChain =
  /** The sound of a link, or of the attached video at `index`, then the clips (attachment indexes) cut to it. */
  | { kind: 'sound-cut'; source: { url: string } | { index: number }; clips: number[] }
  /** The montage of every attachment, then an edit of its result. */
  | { kind: 'cut-edit'; edits: EditAsk[] };

/** Which attached video the words name as the sound's source: the ordinal nearest the sound word; 0 when none. Null when it names one that is not there. */
function sourceIndex(t: string, videos: number): number | null {
  const sound = SOUND.exec(t);
  const near = sound ? sound.index : 0;
  let best: { at: number; d: number } | null = null;
  const consider = (at: number, pos: number) => {
    const d = Math.abs(pos - near);
    if (!best || d < best.d) best = { at, d };
  };
  for (const o of ORDINALS) {
    for (const m of t.matchAll(o.re)) consider(o.at === 'last' ? videos - 1 : o.at, m.index ?? 0);
  }
  for (const m of t.matchAll(NUMBERED)) consider(parseInt(m[1]!, 10) - 1, m.index ?? 0);
  const found = best as { at: number; d: number } | null;
  if (!found) return 0;
  return found.at >= 0 && found.at < videos ? found.at : null;
}

/**
 * Is this message, with these attachments (their kinds, in order), a request for a chained run? Which chain? Null for
 * anything a one-step card (or the chat) already serves.
 */
export function runChainAsk(text: string, kinds: AttachmentKind[]): RunChain | null {
  const raw = (text || '').trim();
  if (!raw || isVideoQuestion(raw)) return null;
  const links = findLinks(raw);
  const t = withoutLinks(raw);
  if (!t || STEMS.test(t)) return null;

  // ── the sound of one source, the clips cut to it ──
  const videos = kinds.filter((k) => k === 'video').length;
  if (videos === kinds.length && links.length <= 1 && SOUND.test(t) && TAKE.test(t)) {
    const all = ALL.test(t) && !OTHER.test(t);
    if (links.length === 1 && videos >= 1 && videos <= MAX_CLIPS) {
      // The montage's own rule for its words, with the extracted sound standing in for the track.
      if (beatMontageAsk(t, [...kinds, 'audio'])) return { kind: 'sound-cut', source: { url: links[0]! }, clips: kinds.map((_, i) => i) };
    }
    if (links.length === 0 && videos >= 2 && videos <= MAX_CLIPS + 1) {
      const src = sourceIndex(t, videos);
      if (src === null) return null;
      const clips = kinds.map((_, i) => i).filter((i) => all || i !== src);
      if (clips.length > MAX_CLIPS) return null;
      if (beatMontageAsk(t, [...clips.map(() => 'video' as const), 'audio'])) return { kind: 'sound-cut', source: { index: src }, clips };
    }
    return null;
  }

  // ── the montage, then an edit of it ──
  if (links.length === 0 && beatMontageAsk(t, kinds)) {
    const edits = mineEdits(t).edits.filter((e) => AFTER_MONTAGE.has(e.op) && !(e.op === 'fade' && TRANSITION.test(t)));
    if (edits.length) return { kind: 'cut-edit', edits };
  }
  return null;
}

/** The run's title: the user's own words, cut to what a spec carries. */
const titleOf = (text: string): string | undefined => {
  const s = (text || '').replace(/\s+/g, ' ').trim().slice(0, 120).trim();
  return s || undefined;
};

/**
 * The run spec for a chain, with `paths` the attachments' storage paths in the order sent. The montage step keeps the
 * user's words (its frame, its length, a music start are read from them, as on the montage card).
 */
export function chainSpec(chain: RunChain, text: string, paths: readonly string[]): RunSpec {
  const title = titleOf(text);
  const prompt = withoutLinks(text).slice(0, 2000);
  if (chain.kind === 'sound-cut') {
    const source = 'url' in chain.source ? { url: chain.source.url } : { file: paths[chain.source.index]! };
    return {
      ...(title ? { title } : {}),
      steps: [
        { id: 'sound', tool: 'audio_extract', source },
        { id: 'cut', tool: 'montage', files: [...chain.clips.map((i) => paths[i]!), { step: 'sound' }], ...(prompt ? { prompt } : {}) },
      ],
    };
  }
  return {
    ...(title ? { title } : {}),
    steps: [
      { id: 'cut', tool: 'montage', files: [...paths], ...(prompt ? { prompt } : {}) },
      { id: 'edit', tool: 'edit', file: { step: 'cut' }, edits: chain.edits },
    ],
  };
}

// ── words ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const q = (lang: Lang, s: string) => (lang === 'ka' ? `„${s}“` : lang === 'ru' ? `«${s}»` : `“${s}”`);
const fileName = (names: readonly string[] | undefined, i: number, lang: Lang) =>
  names?.[i] ? q(lang, names[i]!) : lang === 'en' ? `video ${i + 1}` : lang === 'ru' ? `видео ${i + 1}` : `ვიდეო ${i + 1}`;

/** What Agent G says while it uploads the files and plans the steps. */
export function runReadingText(locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? 'Uploading your files and planning the steps…'
    : lang === 'ru' ? 'Загружаю файлы и составляю план шагов…'
      : 'ვტვირთავ ფაილებს და ნაბიჯების გეგმას ვადგენ…';
}

/** Where the sound comes from, in words („the sound of “a.mp4”", „the sound of the link"). */
export function sourceLine(chain: RunChain, names: readonly string[] | undefined, locale: string): string {
  const lang = pick(locale);
  if (chain.kind !== 'sound-cut') return '';
  if ('url' in chain.source) {
    let host = '';
    try { host = new URL(chain.source.url).hostname.replace(/^www\./, ''); } catch { /* the server checks the link */ }
    return lang === 'en' ? `the sound of the link${host ? ` (${host})` : ''}` : lang === 'ru' ? `звук по ссылке${host ? ` (${host})` : ''}` : `ბმულის ხმა${host ? ` (${host})` : ''}`;
  }
  const f = fileName(names, chain.source.index, lang);
  return lang === 'en' ? `the sound of ${f}` : lang === 'ru' ? `звук из ${f}` : `${f}-ის ხმა`;
}

/** Agent G's plan in words: the steps in order, the price, and that nothing starts before Start. */
export function runPlanText(chain: RunChain, opts: { names?: readonly string[]; credits: number; editsText?: string }, locale: string): string {
  const lang = pick(locale);
  const lines: string[] = [];
  if (chain.kind === 'sound-cut') {
    const n = chain.clips.length;
    const src = sourceLine(chain, opts.names, locale);
    lines.push(lang === 'en' ? `Two steps: 1. take ${src} out as MP3 (its rights are checked first); 2. cut ${n} clip${n === 1 ? '' : 's'} to it.`
      : lang === 'ru' ? `Два шага: 1. извлечь ${src} в MP3 (сначала проверю права); 2. смонтировать под него клипы (${n}).`
        : `ორი ნაბიჯი: 1. ${src} MP3-ად ამოვიღებ (ჯერ უფლებას შევამოწმებ); 2. ${n} კლიპს ამ ხმაზე დავამონტაჟებ.`);
  } else {
    const what = opts.editsText ?? '';
    lines.push(lang === 'en' ? `Two steps: 1. cut the clips to your track; 2. edit the montage: ${what}.`
      : lang === 'ru' ? `Два шага: 1. смонтировать клипы под ваш трек; 2. правка монтажа: ${what}.`
        : `ორი ნაბიჯი: 1. კლიპებს შენს მუსიკაზე დავამონტაჟებ; 2. მონტაჟს დავამუშავებ: ${what}.`);
  }
  const price = opts.credits > 0
    ? (lang === 'en' ? `Price: up to ✦ ${opts.credits}.` : lang === 'ru' ? `Цена: до ✦ ${opts.credits}.` : `ფასი: მაქსიმუმ ✦ ${opts.credits}.`)
    : (lang === 'en' ? 'Free.' : lang === 'ru' ? 'Бесплатно.' : 'უფასოა.');
  const go = lang === 'en' ? 'Nothing starts until you press Start; a step that would cost more asks you first.'
    : lang === 'ru' ? 'Ничего не начнётся, пока вы не нажмёте «Начать»; шаг, который обойдётся дороже, сначала спросит вас.'
      : 'არაფერი დაიწყება, სანამ „დაწყებას“ არ დააჭერ; თუ რომელიმე ნაბიჯი უფრო ძვირი გამოვა, ჯერ გკითხავ.';
  lines.push(`${price} ${go}`);
  return lines.join('\n');
}

/** The run delivered everything. */
export function runDoneText(locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? 'Ready. Every step is done, and the results are in your Library.'
    : lang === 'ru' ? 'Готово. Все шаги выполнены, результаты есть в Библиотеке.'
      : 'მზადაა. ყველა ნაბიჯი შესრულდა, შედეგები ბიბლიოთეკაშიცაა.';
}

/** Some steps delivered, the rest did not: what was kept, and that Retry carries the run on without redoing them. */
export function runPartialText(locale: string): string {
  const lang = pick(locale);
  return lang === 'en' ? 'Part of it is ready (above, and in your Library). The rest did not finish; Retry carries on from there without redoing what is done.'
    : lang === 'ru' ? 'Часть готова (выше и в Библиотеке). Остальное не завершилось; «Повторить» продолжит с этого места, не переделывая готовое.'
      : 'ნაწილი მზადაა (ზემოთ და ბიბლიოთეკაში). დანარჩენი ვერ დასრულდა; „თავიდან ცდა“ იქიდან გააგრძელებს და მზას არ გაიმეორებს.';
}

/** A chat code for a run that never started, or a follow that lost it. */
export type RunChatCode =
  | 'upload_failed' | 'bad_spec' | 'not_configured' | 'quote_invalid' | 'quote_changed' | 'quote_expired' | 'jobs_unavailable'
  | 'not_found' | 'not_running' | 'not_waiting' | 'not_final' | 'nothing_to_resume' | 'closed' | 'unauthenticated'
  | 'rate_limited' | 'network';

const ERR: Record<RunChatCode, Record<Lang, string>> = {
  upload_failed: { ka: '{f} ვერ ავტვირთე (მაქს. 50 მბ, ვიდეო ან აუდიო).', en: 'I could not upload {f} (up to 50 MB, video or audio).', ru: 'Не удалось загрузить {f} (до 50 МБ, видео или аудио).' },
  bad_spec: { ka: 'ამ ნაბიჯების გეგმა ვერ შევადგინე. გამომიგზავნე ფაილები თავიდან.', en: 'I could not make a plan of these steps. Send the files again.', ru: 'Не удалось составить план шагов. Отправьте файлы снова.' },
  not_configured: { ka: 'მრავალნაბიჯიანი დავალებები ამ სერვერზე ჯერ არ არის ჩართული.', en: 'Multi-step tasks are not set up on this server yet.', ru: 'Многошаговые задачи на этом сервере ещё не настроены.' },
  quote_invalid: { ka: 'გეგმა დაზიანდა. გამომიგზავნე ფაილები თავიდან.', en: 'The plan was damaged. Send the files again.', ru: 'План повреждён. Отправьте файлы снова.' },
  quote_changed: { ka: 'გეგმა ან ფასი შეიცვალა. გამომიგზავნე ფაილები თავიდან.', en: 'The plan or its price changed. Send the files again.', ru: 'План или цена изменились. Отправьте файлы снова.' },
  quote_expired: { ka: 'გეგმას ვადა გაუვიდა (30 წუთი). გამომიგზავნე ფაილები თავიდან.', en: 'This plan expired (30 minutes). Send the files again.', ru: 'Срок плана истёк (30 минут). Отправьте файлы снова.' },
  jobs_unavailable: { ka: 'დავალებების რიგი ახლა მიუწვდომელია. სცადე ცოტა ხანში.', en: 'The task queue is unavailable right now. Try again shortly.', ru: 'Очередь задач сейчас недоступна. Попробуйте чуть позже.' },
  not_found: { ka: 'ეს დავალება ვერ ვიპოვე.', en: 'I could not find this task.', ru: 'Задача не найдена.' },
  not_running: { ka: 'ეს დავალება უკვე აღარ მიმდინარეობს.', en: 'This task is no longer running.', ru: 'Эта задача уже не идёт.' },
  not_waiting: { ka: 'ეს ნაბიჯი შენს დასტურს აღარ ელოდება.', en: 'This step is no longer waiting for you.', ru: 'Этот шаг уже не ждёт вашего решения.' },
  not_final: { ka: 'დავალება ჯერ მიმდინარეობს.', en: 'The task is still going.', ru: 'Задача ещё идёт.' },
  nothing_to_resume: { ka: 'ყველა ნაბიჯი უკვე შესრულებულია.', en: 'Every step is already done.', ru: 'Все шаги уже выполнены.' },
  closed: { ka: 'Agent G-ის მრავალნაბიჯიანი დავალებები შენთვის ჯერ არ არის ჩართული.', en: 'Agent G multi-step tasks are not open to you yet.', ru: 'Многошаговые задачи Agent G для вас пока не открыты.' },
  unauthenticated: { ka: 'ჯერ შედი ანგარიშზე.', en: 'Sign in first.', ru: 'Сначала войдите.' },
  rate_limited: { ka: 'ძალიან ბევრი მოთხოვნაა ერთად. სცადე ერთ წუთში.', en: 'Too many requests at once. Try again in a minute.', ru: 'Слишком много запросов. Попробуйте через минуту.' },
  network: { ka: 'კავშირი გაწყდა. დავალება შეიძლება ისევ მიმდინარეობდეს: ის „დავალებებშიც“ ჩანს.', en: 'The connection dropped. The task may still be going: it is also in your tasks.', ru: 'Соединение прервалось. Задача может ещё идти: она есть и в списке задач.' },
};

/** A run's chat code in words; `{f}` names the files that did not upload. */
export function runErrorText(code: string | undefined, locale: string, files?: readonly number[], names?: readonly string[]): string {
  const lang = pick(locale);
  const row = ERR[(code ?? 'network') as RunChatCode] ?? ERR.network;
  const f = files?.length ? files.map((i) => fileName(names, i, lang)).join(', ') : (lang === 'en' ? 'a file' : lang === 'ru' ? 'файл' : 'ფაილი');
  return row[lang].replace('{f}', f);
}

/** An answer from /api/tasks (plan, run, approve, resume) in the chat's codes. */
export function runCodeOf(status: number, body: unknown): RunChatCode {
  const e = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  if (status === 401 || e === 'unauthenticated') return 'unauthenticated';
  if (status === 403 || e === 'not_enabled') return 'closed';
  if (status === 429) return 'rate_limited';
  if (typeof e === 'string' && e in ERR) return e as RunChatCode;
  if (status === 404) return 'not_found';
  return status >= 500 || !status ? 'network' : 'bad_spec';
}

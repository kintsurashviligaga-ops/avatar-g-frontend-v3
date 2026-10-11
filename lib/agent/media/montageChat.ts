/**
 * lib/agent/media/montageChat.ts — the studio chat's side of Agent G's montage (slice 1): when a message is a request to
 * cut the attached clips to the attached track, and what Agent G says at each step, in ka · en · ru. Pure, no network,
 * safe in the browser; the executor is lib/agent/media/montageExec behind /api/agent/media/montage.
 *
 * ⚠️ WHY THE CHAT NEEDS ITS OWN TEST. Before this, clips + a song + „cut these to the music" went to the video REMIX
 * branch (components/studio/OmniStudio.tsx): it took the FIRST video only, laid the song under it as `add_music`,
 * charged for it, and dropped every other clip without a word. The rule here claims exactly those messages and nothing
 * the remix or the editor does better:
 *   · the files are video clips (at least one), PHOTOS if any, and ONE audio track, nothing else (a second track or a
 *     document is not this edit). A photo is a still shot of the montage (owner 2026-10-11 11:37Z: four clips, a
 *     product photo and a song; the photo used to throw the whole request out of the montage and onto a canned
 *     „I cannot move the music in a finished video", with every file dropped);
 *   · the words are not a question („what song is this?" stays a question about the video);
 *   · with two or more pictures (clips and photos), any music / beat / cut / montage word is enough: the remix could only
 *     ever use one clip;
 *   · with ONE clip and nothing else, only a cut / montage word: „add music to this video" wants the whole clip with a song under it
 *     (the remix's add_music), not the clip chopped into shots — and a trim („cut the first 10 seconds") stays a trim.
 */
import { detectStudioIntent } from '@/lib/chat/studioIntent';
import { isVideoQuestion } from '@/lib/chat/videoIntent';
import type { MontageAspect } from '@/lib/services/montage/montagePlan';
import type { MontageErrorCode, MontageQuote, MontageRefusalDetail } from './montageExec';
import type { MontageManifestItem } from './montageManifest';
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

/** Does the message ask for a cut / montage („დაამონტაჟე", „cut these together", „склей")? Shapes aside. */
export function hasMontageWords(text: string): boolean {
  const t = (text || '').trim();
  return !!t && (CUT.test(t) || detectStudioIntent(t)?.service === 'montage');
}

/** Does the message speak of music / a beat / a track? */
export function hasMusicWords(text: string): boolean {
  return MUSIC.test(text || '');
}

/** Is this message, with these attachments, a request to cut the clips (and photos) to the track? */
export function beatMontageAsk(text: string, kinds: AttachmentKind[]): boolean {
  const t = (text || '').trim();
  if (!t || isVideoQuestion(t)) return false;
  const videos = kinds.filter((k) => k === 'video').length;
  const photos = kinds.filter((k) => k === 'image').length;
  const audios = kinds.filter((k) => k === 'audio').length;
  if (videos < 1 || videos + photos > MAX_CLIPS || audios !== 1 || videos + photos + audios !== kinds.length) return false;
  const montageWords = CUT.test(t) || detectStudioIntent(t)?.service === 'montage';
  if (videos + photos === 1) return montageWords && !TRIM.test(t);
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
  /** The attachments' names, in the order sent: a refusal names files by index (the quote's manifest has them too). */
  names?: string[];
  /** Attachments settled so far while the plan is read (the upload step's „2/4"). */
  uploaded?: number;
  pct?: number;
  /** The job's last stage: kept through a stop or a failure, so the card marks the step it ended on. */
  stage?: string | null;
  /** Stop was pressed and has not come back yet. */
  stopping?: boolean;
  /** When the current working stretch began (the bubble, then Start) and when the run ended: the card's clock. */
  t0?: number;
  t1?: number;
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

/** 5.2 → "0:05", 95 → "1:35". */
const clockOf = (sec: number): string => {
  const t = Math.max(0, Math.round(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

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
  const st = q.stills ?? 0;
  const plan = lang === 'en'
    ? `Plan: ${q.shots} shots from ${q.clips} clip${q.clips === 1 ? '' : 's'}${st ? ` and ${st} photo${st === 1 ? '' : 's'}` : ''}, ${sec(q.totalSec)} s, ${q.aspect}, with your track as the only sound.`
    : lang === 'ru'
      ? `План: ${q.shots} кадров из клипов (${q.clips})${st ? ` и фото (${st})` : ''}, ${sec(q.totalSec)} с, ${q.aspect}, звук — только ваш трек.`
      : `გეგმა: ${q.shots} კადრი ${q.clips} კლიპიდან${st ? ` და ${st} ფოტოდან` : ''}, ${sec(q.totalSec)} წმ, ${q.aspect}, ხმად მხოლოდ შენი მუსიკა.`;
  // A start the user asked for („მუსიკა 5 წამიდან") is said; the first beat a fraction of a second in is not news.
  const from = q.musicStartSec >= 1
    ? ' ' + (lang === 'en' ? `The track starts at ${clockOf(q.musicStartSec)}.` : lang === 'ru' ? `Трек начинается с ${clockOf(q.musicStartSec)}.` : `მუსიკა იწყება ${clockOf(q.musicStartSec)}-დან.`)
    : '';
  // Every file, in the user's order, as the quote fixed it (the manifest): every clip is in the edit, or there is no plan.
  const files = q.manifest?.length ? `\n${manifestText(q.manifest, lang, names, q.selection?.used)}` : '';
  // The files the user's words left out („მარტო ბოლო შვიდი"): named, so nothing is dropped without being said.
  const left = q.selection?.excluded.length
    ? '\n' + (lang === 'en'
      ? `Left out as you asked (${q.selection.phrase}): ${q.selection.excluded.map((i, k) => `${i + 1} ${quoted(lang, q.selection!.excludedNames[k] ?? '')}`).join(' · ')}.`
      : lang === 'ru'
        ? `Не использую по вашей просьбе (${q.selection.phrase}): ${q.selection.excluded.map((i, k) => `${i + 1} ${quoted(lang, q.selection!.excludedNames[k] ?? '')}`).join(' · ')}.`
        : `შენი თხოვნით არ ვიყენებ (${q.selection.phrase}): ${q.selection.excluded.map((i, k) => `${i + 1} ${quoted(lang, q.selection!.excludedNames[k] ?? '')}`).join(' · ')}.`)
    : '';
  const engine = lang === 'en' ? 'Engine: FFmpeg montage.' : lang === 'ru' ? 'Движок: FFmpeg-монтаж.' : 'ძრავი: FFmpeg მონტაჟი.';
  const price = q.credits > 0
    ? (lang === 'en' ? `Price: ✦ ${q.credits}.` : lang === 'ru' ? `Цена: ✦ ${q.credits}.` : `ფასი: ✦ ${q.credits}.`)
    : (lang === 'en' ? 'Free.' : lang === 'ru' ? 'Бесплатно.' : 'უფასოა.');
  const go = lang === 'en' ? 'Nothing starts until you press Start.' : lang === 'ru' ? 'Ничего не начнётся, пока вы не нажмёте «Начать».' : 'არაფერი დაიწყება, სანამ „დაწყებას“ არ დააჭერ.';
  return `${found}\n${plan}${from}${files}${left}\n${engine} ${price} ${go}`;
}

/**
 * The quote's files, in the user's order: number, name, video or music, length. „Every clip is used" closes it: the
 * plan gives each video at least one shot, in this order, or it is refused (clip_too_short, music_too_short, …).
 */
export function manifestText(manifest: readonly MontageManifestItem[], locale: string, names?: string[], sentPos?: readonly number[]): string {
  const lang = pick(locale);
  const kind = (k: MontageManifestItem['kind']) => (k === 'video'
    ? (lang === 'en' ? 'video' : lang === 'ru' ? 'видео' : 'ვიდეო')
    : k === 'image'
      ? (lang === 'en' ? 'photo' : lang === 'ru' ? 'фото' : 'ფოტო')
      : (lang === 'en' ? 'music' : lang === 'ru' ? 'музыка' : 'მუსიკა'));
  const unit = lang === 'en' ? 's' : lang === 'ru' ? 'с' : 'წმ';
  // A photo has no length of its own (its shot sets it): no „0 s" after it.
  const list = manifest
    // `sentPos`: after a source selection the manifest holds only the used files; they keep the numbers they were sent with.
    .map((m) => `${(sentPos?.[m.index] ?? m.index) + 1} ${quoted(lang, m.name || names?.[m.index] || `${m.index + 1}`)} ${kind(m.kind)}${m.kind === 'image' ? '' : ` ${sec(m.durationSec)} ${unit}`}`)
    .join(' · ');
  const n = manifest.length;
  const photos = manifest.some((m) => m.kind === 'image');
  return lang === 'en' ? `Files (${n}, in your order): ${list}. Every ${photos ? 'clip and photo' : 'clip'} is used.`
    : lang === 'ru' ? `Файлы (${n}, в вашем порядке): ${list}. Используются все ${photos ? 'клипы и фото' : 'клипы'}.`
      : `ფაილები (${n}, შენი თანმიმდევრობით): ${list}. ${photos ? 'ყველა კლიპი და ფოტო' : 'ყველა კლიპი'} შედის.`;
}

const STAGE: Record<string, Record<Lang, string>> = {
  queued: { ka: 'რიგშია, მალე დავიწყებ', en: 'Queued, starting shortly', ru: 'В очереди, скоро начну' },
  starting: { ka: 'მონტაჟს ვიწყებ', en: 'Starting the edit', ru: 'Запускаю монтаж' },
  retrying: { ka: 'სერვერი შეფერხდა, მონტაჟს თავიდან ვიწყებ', en: 'The server stalled, so I am starting the edit again', ru: 'Сервер остановился, начинаю монтаж заново' },
  resolve: { ka: 'ფაილებს ვამზადებ', en: 'Preparing the files', ru: 'Готовлю файлы' },
  bridge: { ka: 'ფაილებს ვამზადებ', en: 'Preparing the files', ru: 'Готовлю файлы' },
  normalize: { ka: 'კადრებს ვჭრი და ერთ ფორმატში მოვყავარ', en: 'Cutting the shots to one format', ru: 'Нарезаю кадры в один формат' },
  stitch: { ka: 'კადრებს ვაერთებ', en: 'Joining the shots', ru: 'Склеиваю кадры' },
  music: { ka: 'მუსიკას ვამატებ', en: 'Laying the track under it', ru: 'Накладываю трек' },
  qc: { ka: 'ვამოწმებ, რომ ყველა კლიპი შედეგშია', en: 'Checking every clip is in the output', ru: 'Проверяю, что все клипы в итоге' },
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

export type ChatErrorCode = MontageErrorCode | 'upload_failed' | 'network' | 'closed' | 'unauthenticated' | 'rate_limited' | 'approval_unclear';

const ERR: Record<ChatErrorCode, Record<Lang, string>> = {
  approval_unclear: { ka: 'შენი „კი“ ვერ გავიგე, ამიტომ არაფერი დამიწყია. თქვი „კი, დაიწყე“ ან დააჭირე Start-ს.', en: 'I did not hear a clear yes from you, so nothing was started. Say "yes, start" or tap Start.', ru: 'Я не услышал от вас чёткого «да», поэтому ничего не запущено. Скажите «да, начинай» или нажмите Start.' },
  bad_input: { ka: 'ფაილები ვერ მივიღე. მიამაგრე კლიპები და ერთი მუსიკა თავიდან.', en: 'The files did not come through. Attach the clips and one track again.', ru: 'Файлы не дошли. Прикрепите клипы и один трек снова.' },
  too_many_files: { ka: `ერთ მონტაჟში მაქსიმუმ ${MAX_CLIPS} კლიპი და ერთი მუსიკაა.`, en: `One edit takes up to ${MAX_CLIPS} clips and one track.`, ru: `В один монтаж — до ${MAX_CLIPS} клипов и один трек.` },
  media_not_yours: { ka: '{f} შენი ატვირთული არ არის, ამიტომ მას ვერ გამოვიყენებ.', en: '{f} is not one of your uploads, so I cannot use it.', ru: '{f} — не ваш файл, его нельзя использовать.' },
  unreadable: { ka: '{f} ვერ წავიკითხე ვიდეოდ ან აუდიოდ. სცადე MP4 (H.264) ან MP3.', en: 'I could not read {f} as video or audio. Try MP4 (H.264) or MP3.', ru: 'Не удалось прочитать {f} как видео или аудио. Попробуйте MP4 (H.264) или MP3.' },
  no_clip: { ka: 'ვიდეო კლიპი ვერ ვიპოვე. მიამაგრე მინიმუმ ერთი.', en: 'I found no video clip. Attach at least one.', ru: 'Видеоклипа нет. Прикрепите хотя бы один.' },
  no_track: { ka: 'მუსიკა ვერ ვიპოვე. მიამაგრე ერთი აუდიო ფაილი.', en: 'I found no music track. Attach one audio file.', ru: 'Трека нет. Прикрепите один аудиофайл.' },
  several_tracks: { ka: 'ერთზე მეტი მუსიკაა. დატოვე მხოლოდ ერთი.', en: 'There is more than one track. Keep just one.', ru: 'Треков больше одного. Оставьте один.' },
  too_many_clips: { ka: `ერთ მონტაჟში მაქსიმუმ ${MAX_CLIPS} კლიპია.`, en: `One edit takes up to ${MAX_CLIPS} clips.`, ru: `В один монтаж — до ${MAX_CLIPS} клипов.` },
  plan_failed: { ka: 'ამ ფაილებით მონტაჟი არ გამოდის: კლიპები ან მუსიკა ძალიან მოკლეა.', en: 'No edit fits these files: the clips or the track are too short.', ru: 'Из этих файлов монтаж не собрать: клипы или трек слишком короткие.' },
  // Not every clip can get a shot: the plan is refused, never made without a clip. The numbers, when the refusal carries
  // them (MontageRefusalDetail), are added by errorText (see REFUSAL below); these are the words without them.
  clip_too_short: { ka: '{f} ერთი კადრისთვისაც მოკლეა, ამიტომ მონტაჟს არ ვიწყებ: არც ერთ კლიპს არ გამოვტოვებ. მიამაგრე უფრო გრძელი კლიპი, ან ამოიღე {f} და თავიდან მთხოვე.', en: '{f} is too short for even one shot, so I am not starting the edit: I will not leave a clip out. Attach a longer clip, or remove {f} and ask again.', ru: '{f} — короче даже одного кадра, поэтому монтаж не начинаю: ни один клип я не пропущу. Прикрепите клип подлиннее или уберите {f} и попросите снова.' },
  music_too_short: { ka: 'მუსიკა ({f}) ძალიან მოკლეა, რომ ყველა კლიპს თითო კადრი მაინც ერგოს, ამიტომ მონტაჟს არ ვიწყებ: კლიპს არ გამოვტოვებ. დაიწყე მუსიკა უფრო ადრე, მიამაგრე უფრო გრძელი მუსიკა, ან გამოიყენე ნაკლები კლიპი.', en: 'The music ({f}) is too short to give every clip one shot, so I am not starting the edit: I will not leave a clip out. Start the music earlier, attach a longer track, or use fewer clips.', ru: 'Музыка ({f}) слишком короткая, чтобы каждому клипу досталось хотя бы по кадру, поэтому монтаж не начинаю: ни один клип я не пропущу. Начните музыку раньше, прикрепите трек подлиннее или используйте меньше клипов.' },
  target_too_short: { ka: 'ამ სიგრძეში ყველა კლიპი ({f}) ვერ ეტევა, ამიტომ მონტაჟს არ ვიწყებ: კლიპს არ გამოვტოვებ. მთხოვე უფრო გრძელი მონტაჟი, ან გამოიყენე ნაკლები კლიპი.', en: 'Not every clip ({f}) fits in the length you asked for, so I am not starting the edit: I will not leave a clip out. Ask for a longer edit, or use fewer clips.', ru: 'В заданную длину помещаются не все клипы ({f}), поэтому монтаж не начинаю: ни один клип я не пропущу. Попросите монтаж подлиннее или используйте меньше клипов.' },
  footage_too_short: { ka: 'კლიპები ერთად ({f}) შენს მიერ თხოვნილ სიგრძეზე მოკლეა, ამიტომ მონტაჟს არ ვიწყებ: კადრებს არ გავიმეორებ და მონტაჟს ჩუმად არ შევამოკლებ. დაამატე კლიპები, ან მთხოვე უფრო მოკლე მონტაჟი.', en: 'Your clips ({f}) together are shorter than the length you asked for, so I am not starting the edit: I will not repeat shots or quietly make it shorter. Add clips, or ask for a shorter edit.', ru: 'Ваши клипы ({f}) вместе короче заданной длины, поэтому монтаж не начинаю: повторять кадры или молча укорачивать я не буду. Добавьте клипы или попросите монтаж короче.' },
  selection_invalid: { ka: 'შენს სიტყვებში დასახელებული ვიდეო არ არის მიმაგრებულ ფაილებში, ამიტომ არაფერი დამიწყია. თქვი ზუსტად, რომელი კლიპები გამოვიყენო.', en: 'Your words name a clip that is not among the attached files, so I started nothing. Say exactly which clips to use.', ru: 'В ваших словах указан клип, которого нет среди файлов, поэтому я ничего не начал. Скажите точно, какие клипы использовать.' },
  target_too_long: { ka: 'ერთი მონტაჟი მაქსიმუმ 5 წუთია. მთხოვე უფრო მოკლე.', en: 'One edit is at most 5 minutes. Ask for a shorter one.', ru: 'Один монтаж — не длиннее 5 минут. Попросите покороче.' },
  manifest_invalid: { ka: 'გეგმაში აღარ ჩანს ყველა ფაილი, რაც გამომიგზავნე, ამიტომ არ დავიწყე. გამომიგზავნე ფაილები თავიდან.', en: 'The plan no longer lists every file you sent, so I did not start it. Send the files again.', ru: 'В плане больше нет всех отправленных файлов, поэтому я не начал. Отправьте файлы снова.' },
  clip_missing: { ka: 'მზა მონტაჟში ყველა შენი კლიპი არ ჩანდა, ამიტომ არ გაჩვენებ. არაფერი ჩამოგეჭრა. მთხოვე თავიდან.', en: 'The finished edit did not show every clip you sent, so I am not delivering it. Nothing was charged. Ask me again.', ru: 'В готовом монтаже видны не все ваши клипы, поэтому я его не отдаю. Ничего не списано. Попросите снова.' },
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

/**
 * Agent G's words for a refusal; `files` are 0-based indices into `names`. `detail` (a refusal's numbers, when the
 * response carried them) turns a "not every clip fits" refusal into the exact cause: each file's length against the
 * shortest shot, the music left against what the clips need, the length asked against what they need.
 */
export function errorText(code: string | undefined, locale: string, files?: number[], names?: string[], detail?: MontageRefusalDetail): string {
  const lang = pick(locale);
  const row = (code && (ERR as Record<string, Record<Lang, string>>)[code]) || ERR.render_failed;
  const f = files?.length ? files.map((i) => fileName(names, i, lang)).join(', ') : (lang === 'en' ? 'One file' : lang === 'ru' ? 'Один файл' : 'ერთი ფაილი');
  const exact = code && detail ? refusalWithNumbers(code, lang, f, detail, files, names) : null;
  return exact ?? row[lang].replaceAll('{f}', f);
}

/** The "not every clip fits" refusals with their numbers; null when the numbers a sentence needs are missing. */
function refusalWithNumbers(code: string, lang: Lang, f: string, d: MontageRefusalDetail, files?: number[], names?: string[]): string | null {
  const s = (n: number) => `${sec(n)} ${lang === 'en' ? 's' : lang === 'ru' ? 'с' : 'წმ'}`;
  if (code === 'clip_too_short' && d.minShotSec) {
    const min = s(d.minShotSec);
    const each = files?.length && d.durationsSec?.length === files.length
      ? files.map((i, k) => `${fileName(names, i, lang)} (${s(d.durationsSec![k]!)})`).join(', ')
      : f;
    const many = (files?.length ?? 0) > 1;
    return lang === 'en'
      ? `${each} ${many ? 'are' : 'is'} shorter than the shortest shot this edit can cut (${min}), so I am not starting the edit: I will not leave a clip out. Attach a clip of at least ${min}, or remove ${f} and ask again.`
      : lang === 'ru'
        ? `${each} — короче самого короткого кадра (${min}), поэтому монтаж не начинаю: ни один клип я не пропущу. Прикрепите клип не короче ${min} или уберите ${f} и попросите снова.`
        : `${each} უმოკლეს კადრზეც (${min}) მოკლეა, ამიტომ მონტაჟს არ ვიწყებ: არც ერთ კლიპს არ გამოვტოვებ. მიამაგრე მინიმუმ ${min} კლიპი, ან ამოიღე ${f} და თავიდან მთხოვე.`;
  }
  if (code === 'music_too_short' && d.targetSec && d.musicSec !== undefined) {
    // An asked length the track cannot hold from the asked start: say until when it must play. Never looped or cut.
    const from = clockOf(d.fromSec ?? 0);
    const until = clockOf((d.fromSec ?? 0) + d.targetSec);
    const [have, want] = [s(d.musicSec), s(d.targetSec)];
    return lang === 'en'
      ? `${f} from ${from} lasts only ${have}; ${want} needs it to play until ${until}, so I am not starting the edit: I will not loop the song or quietly make the edit shorter. Start the music earlier, attach a longer track, or ask for a shorter edit.`
      : lang === 'ru'
        ? `${f} с ${from} длится всего ${have}; для ${want} он должен звучать до ${until}, поэтому монтаж не начинаю: зацикливать песню или молча укорачивать монтаж я не буду. Начните музыку раньше, прикрепите трек подлиннее или попросите монтаж короче.`
        : `${f} ${from}-დან მხოლოდ ${have} გრძელდება; ${want}-ისთვის ${until}-მდე უნდა ჟღერდეს, ამიტომ მონტაჟს არ ვიწყებ: სიმღერას არ გავიმეორებ და მონტაჟს ჩუმად არ შევამოკლებ. დაიწყე მუსიკა უფრო ადრე, მიამაგრე უფრო გრძელი მუსიკა, ან მთხოვე უფრო მოკლე მონტაჟი.`;
  }
  if (code === 'footage_too_short' && d.targetSec && d.footageSec !== undefined) {
    const [have, want] = [s(d.footageSec), s(d.targetSec)];
    return lang === 'en'
      ? `Your clips (${f}) last ${have} together, each used once; ${want} needs more, so I am not starting the edit: I will not repeat shots or quietly make it shorter. Add clips, or ask for ${have} or less.`
      : lang === 'ru'
        ? `Ваши клипы (${f}) вместе длятся ${have}, каждый используется один раз; для ${want} этого мало, поэтому монтаж не начинаю: повторять кадры или молча укорачивать я не буду. Добавьте клипы или попросите не больше ${have}.`
        : `შენი კლიპები (${f}) ერთად ${have} გრძელდება, თითო ერთხელ; ${want}-ისთვის ეს არ კმარა, ამიტომ მონტაჟს არ ვიწყებ: კადრებს არ გავიმეორებ და მონტაჟს ჩუმად არ შევამოკლებ. დაამატე კლიპები, ან მთხოვე მაქსიმუმ ${have}.`;
  }
  if (code === 'selection_invalid' && d.pictures !== undefined && d.asked?.length) {
    const named = d.asked.join(', ');
    return lang === 'en'
      ? `You named ${named}, but ${d.pictures} clip${d.pictures === 1 ? ' is' : 's are'} attached, so I started nothing and left nothing out on my own. Say which of the ${d.pictures} to use.`
      : lang === 'ru'
        ? `Вы назвали ${named}, а прикреплено клипов: ${d.pictures}, поэтому я ничего не начал и сам ничего не убрал. Скажите, какие из ${d.pictures} использовать.`
        : `დაასახელე ${named}, მიმაგრებულია კი ${d.pictures} კლიპი, ამიტომ არაფერი დამიწყია და თავისით არაფერი ამომიღია. მითხარი, ${d.pictures}-დან რომელი გამოვიყენო.`;
  }
  if (code === 'target_too_long' && d.targetSec && d.maxSec) {
    const [want, max] = [s(d.targetSec), s(d.maxSec)];
    return lang === 'en' ? `One edit is at most ${max}; you asked for ${want}. Ask for ${max} or less.`
      : lang === 'ru' ? `Один монтаж — не длиннее ${max}; вы просили ${want}. Попросите не больше ${max}.`
        : `ერთი მონტაჟი მაქსიმუმ ${max}-ია; შენ ${want} ითხოვე. მთხოვე მაქსიმუმ ${max}.`;
  }
  if (code === 'music_too_short' && d.neededSec && d.clips && d.musicSec !== undefined) {
    const from = (d.fromSec ?? 0) >= 1 ? clockOf(d.fromSec!) : null;
    const [have, need, n] = [s(d.musicSec), s(d.neededSec), d.clips];
    return lang === 'en'
      ? `${f}${from ? ` from ${from}` : ''} lasts only ${have}, but one shot for each of your ${n} clips needs at least ${need}, so I am not starting the edit: I will not leave a clip out. ${from ? 'Start the music earlier, attach' : 'Attach'} a longer track, or use fewer clips.`
      : lang === 'ru'
        ? `${f}${from ? ` с ${from}` : ''} длится всего ${have}, а чтобы каждому из ваших клипов (${n}) досталось по кадру, нужно минимум ${need}, поэтому монтаж не начинаю: ни один клип я не пропущу. ${from ? 'Начните музыку раньше, прикрепите' : 'Прикрепите'} трек подлиннее или используйте меньше клипов.`
        : `${f}${from ? ` ${from}-დან` : ''} მხოლოდ ${have} გრძელდება, შენს ${n} კლიპს კი თითო კადრისთვის მინიმუმ ${need} სჭირდება, ამიტომ მონტაჟს არ ვიწყებ: კლიპს არ გამოვტოვებ. ${from ? 'დაიწყე მუსიკა უფრო ადრე, ' : ''}მიამაგრე უფრო გრძელი მუსიკა, ან გამოიყენე ნაკლები კლიპი.`;
  }
  if (code === 'target_too_short' && d.neededSec && d.targetSec && d.clips) {
    const [want, need, n] = [s(d.targetSec), s(d.neededSec), d.clips];
    return lang === 'en'
      ? `To show all ${n} clips (${f}) the edit needs at least ${need}, but you asked for ${want}, so I am not starting it: I will not leave a clip out. Ask for at least ${need}, or use fewer clips.`
      : lang === 'ru'
        ? `Чтобы показать все клипы (${n}: ${f}), нужно минимум ${need}, а вы просили ${want}, поэтому монтаж не начинаю: ни один клип я не пропущу. Попросите хотя бы ${need} или используйте меньше клипов.`
        : `ყველა კლიპის (${n}: ${f}) საჩვენებლად მონტაჟს მინიმუმ ${need} სჭირდება, შენ კი ${want} ითხოვე, ამიტომ არ ვიწყებ: კლიპს არ გამოვტოვებ. მთხოვე მინიმუმ ${need}, ან გამოიყენე ნაკლები კლიპი.`;
  }
  return null;
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

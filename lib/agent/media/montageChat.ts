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
import { RAMP_FAST, RAMP_SLOW, type RampMode, type RampResult } from '@/lib/services/montage/beatPlan';
import type { MontageErrorCode, MontageQuote, MontageRefusalDetail } from './montageExec';
import type { MontageManifestItem } from './montageManifest';
import { MAX_CLIPS, MAX_SOUNDS, asksNarration, wantsNoMusic, wantsOwnSound, wantsSilence } from './montageAsk';
import type { TransitionStyle } from '@/lib/services/montage/montagePlan';
import type { TransitionAsk, TransitionSummary } from '@/lib/services/montage/transitionPlan';

export type AttachmentKind = 'video' | 'audio' | 'image' | 'other';
type Lang = 'ka' | 'en' | 'ru';

const MUSIC = /მუსიკ|ბიტ|რიტმ|სიმღერ|ტაქტ|music|song|track|beat|rhythm|tempo|музык|песн|трек|бит(?![а-яё])|ритм|такт/iu;
const CUT = new RegExp([
  'მონტაჟ|დაამონტაჟ|გააერთიან|შეაერთ|გადააბ|დაჭერ|დაჭრ|ააწყ',
  'montage|\\bedit\\b|\\bcut\\b|stitch|splice|combine|merge|\\bjoin\\b|\\breel\\b|tiktok|shorts',
  'монтаж|смонтир|склей|соедини|нарежь|нарез|рилс',
].join('|'), 'iu');
/** „ამ ვიდეოებით კლიპი გამიკეთე", „make me a clip", „сделай клип": with clips and a track, a clip is the montage. */
const MAKE_CLIP = new RegExp([
  'კლიპ\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:გამიკეთ|გააკეთ|შემიქმენ|შექმენ|ამიწყ|ააწყ)',
  '(?:გამიკეთ|გააკეთ|შემიქმენ|შექმენ)\\p{L}*\\s+(?:\\p{L}+\\s+)?კლიპ',
  '\\bmake\\s+(?:me\\s+)?an?\\s+(?:music\\s+video|clip)\\b',
  '(?:сделай|создай|смонтируй)\\s+(?:мне\\s+)?клип',
].join('|'), 'iu');
/** A trim of one clip is the remix's job, never a montage. */
const TRIM = /\btrim\b|\bcut\s+(?:the\s+)?(?:first|last|off|out|beginning|end)\b|მოჭერ|შემოკლ|обрез|обрежь/iu;

/** Does the message ask for a cut / montage („დაამონტაჟე", „cut these together", „склей")? Shapes aside. */
export function hasMontageWords(text: string): boolean {
  const t = (text || '').trim();
  return !!t && (CUT.test(t) || MAKE_CLIP.test(t) || detectStudioIntent(t)?.service === 'montage');
}

/** Does the message speak of music / a beat / a track? */
export function hasMusicWords(text: string): boolean {
  return MUSIC.test(text || '');
}

/** „მუსიკის გარეშე", "no music": music named only to say there is none. */
const NO_MUSIC_WORDS = /მუსიკის\s+გარეშე|უმუსიკო|without\s+(?:any\s+)?music|\bno\s+music\b|без\s+музык\p{L}*/giu;

/** A sound named („ამ ხმაზე", "the audio from the first video", «под звук»): with no sound file sent, a sound to cut to. */
const SOUND_WORD = /(?<!\p{L})ხმ|audio|sound|звук/iu;

/** „სლაიდშოუ", "slideshow", «слайд-шоу»: with photos, a montage word of its own. */
const SLIDESHOW = /სლაიდ|slide\s*-?\s*show|слайд/iu;

/**
 * Is this message, with these attachments, a montage Agent G makes? Pictures (videos and photos, at least one) and at
 * most two sound files (a track, a narration), nothing else:
 *   · a track or a narration with two or more pictures: any montage, music, beat or narration word;
 *   · one picture and a sound file: a montage word (never a trim), or a narration („ჩემი ნარაცია დაადე ამ ვიდეოს");
 *   · NO sound file (GG 2026-10-11 17:38Z: „თუ მუსიკა არ ავტვირთე … არ იწყებს"): two or more pictures and a montage word
 *     (or „slideshow" with photos), joined with the clips' own sound. When the words make music the point („მუსიკალური
 *     კლიპი", „ბითზე") and there is no track, this is not it: the chat asks for the track (lib/agent/intent).
 */
export function beatMontageAsk(text: string, kinds: AttachmentKind[]): boolean {
  const t = (text || '').trim();
  if (!t || isVideoQuestion(t)) return false;
  const videos = kinds.filter((k) => k === 'video').length;
  const photos = kinds.filter((k) => k === 'image').length;
  const audios = kinds.filter((k) => k === 'audio').length;
  const pictures = videos + photos;
  if (pictures < 1 || pictures > MAX_CLIPS || audios > MAX_SOUNDS || pictures + audios !== kinds.length) return false;
  const montageWords = CUT.test(t) || MAKE_CLIP.test(t) || detectStudioIntent(t)?.service === 'montage' || (photos > 0 && SLIDESHOW.test(t));
  if (!audios) {
    // A narration asked with no recording sent is not this edit as sent: the chat asks for the file (lib/agent/intent).
    if (pictures < 2 || !montageWords || TRIM.test(t) || asksNarration(t)) return false;
    // „Cut them to the first video's sound" names a sound to cut to (lib/agent/run/runChat's sound-cut), not the clips'
    // own: unless the words keep the clips' sound or ask for none.
    if (SOUND_WORD.test(t) && !wantsOwnSound(t) && !wantsSilence(t)) return false;
    return !MUSIC.test(t.replace(NO_MUSIC_WORDS, '')) || wantsNoMusic(t);
  }
  if (pictures === 1) return (montageWords && !TRIM.test(t)) || asksNarration(t);
  return montageWords || MUSIC.test(t) || asksNarration(t);
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
  return lang === 'en' ? 'Reading your files: lengths, format, the sound and the beat…'
    : lang === 'ru' ? 'Читаю файлы: длительность, формат, звук и бит…'
      : 'ვკითხულობ ფაილებს: ხანგრძლივობას, ფორმატს, ხმას და ბითს…';
}

/** 5.2 → "0:05", 95 → "1:35". */
const clockOf = (sec: number): string => {
  const t = Math.max(0, Math.round(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const x = (n: number) => `${n}×`;

/**
 * The speed ramps of a plan in one sentence: how many shots slow down and speed up, and that the music chose them; or
 * why none could (one shot, a track whose strength could not be read). Never a ramp the plan does not hold.
 */
export function rampText(r: RampResult, locale: string): string {
  const lang = pick(locale);
  const n = r.slow + r.fast;
  if (!n && r.keptForFootage) {
    return lang === 'en' ? 'Speed changes: none, every shot already uses almost all of its clip, so there is no footage left to speed up.'
      : lang === 'ru' ? 'Изменение скорости: нет, каждый кадр уже берёт почти весь свой клип, ускорять нечего.'
        : 'სიჩქარის ცვლა: ვერ მოხერხდა, ყოველი კადრი თითქმის მთელ თავის კლიპს იყენებს და ასაჩქარებელი მასალა აღარ რჩება.';
  }
  if (!n) {
    return !r.byEnergy
      ? (lang === 'en' ? 'Speed changes: none, the strength of the music could not be read, so every shot plays at its own speed.'
        : lang === 'ru' ? 'Изменение скорости: нет, силу музыки прочитать не удалось, поэтому все кадры идут с обычной скоростью.'
          : 'სიჩქარის ცვლა: ვერ მოხერხდა, მუსიკის სიძლიერე ვერ წავიკითხე, ამიტომ ყველა კადრი ჩვეულებრივი სიჩქარითაა.')
      : (lang === 'en' ? 'Speed changes: none, there are too few shots to change against each other.'
        : lang === 'ru' ? 'Изменение скорости: нет, кадров слишком мало, чтобы менять их относительно друг друга.'
          : 'სიჩქარის ცვლა: ვერ მოხერხდა, კადრები ძალიან ცოტაა ერთმანეთთან შესადარებლად.');
  }
  const parts: string[] = [];
  if (r.slow) parts.push(lang === 'en' ? `${r.slow} shot${r.slow === 1 ? '' : 's'} slowed to ${x(RAMP_SLOW)} where the music is calm`
    : lang === 'ru' ? `замедлено до ${x(RAMP_SLOW)} на спокойных местах: ${r.slow}`
      : `${r.slow} კადრი შენელებულია ${x(RAMP_SLOW)}-მდე, სადაც მუსიკა მშვიდია`);
  if (r.fast) parts.push(lang === 'en' ? `${r.fast} sped up to ${x(RAMP_FAST)} where it is strongest`
    : lang === 'ru' ? `ускорено до ${x(RAMP_FAST)} на самых сильных: ${r.fast}`
      : `${r.fast} აჩქარებულია ${x(RAMP_FAST)}-მდე, სადაც ყველაზე ძლიერია`);
  const kept = r.keptForFootage
    ? (lang === 'en' ? ` ${r.keptForFootage} stay at normal speed: their clip is too short to speed up.`
      : lang === 'ru' ? ` Обычная скорость у ${r.keptForFootage}: их клип слишком короткий для ускорения.`
        : ` ${r.keptForFootage} კადრი ჩვეულებრივი სიჩქარით დარჩა: მისი კლიპი აჩქარებისთვის მოკლეა.`)
    : '';
  const head = lang === 'en' ? 'Speed by the music' : lang === 'ru' ? 'Скорость по музыке' : 'სიჩქარე მუსიკის მიხედვით';
  const tail = lang === 'en' ? 'every cut stays on its beat.' : lang === 'ru' ? 'каждая склейка остаётся в бит.' : 'ყოველი ჭრა ისევ ბითზე რჩება.';
  return `${head}: ${parts.join('; ')}; ${tail}${kept}`;
}

/** A transition style by name, in the user's language. */
export function transitionName(style: TransitionStyle, locale: string): string {
  const lang = pick(locale);
  const N: Record<TransitionStyle, Record<Lang, string>> = {
    crossfade: { ka: 'მდოვრე გადადნობა', en: 'crossfade', ru: 'плавный наплыв' },
    fade: { ka: 'შავში გაქრობა', en: 'fade through black', ru: 'через чёрное' },
    flash: { ka: 'თეთრი ციმციმი', en: 'white flash', ru: 'белая вспышка' },
    wipe: { ka: 'გადაწმენდა (wipe)', en: 'wipe', ru: 'шторка' },
    slide: { ka: 'გასრიალება (slide)', en: 'slide', ru: 'сдвиг' },
    zoom: { ka: 'ზუმი', en: 'zoom', ru: 'зум' },
    circle: { ka: 'წრე', en: 'circle', ru: 'круг' },
    pixelize: { ka: 'პიქსელები', en: 'pixelate', ru: 'пиксели' },
    blur: { ka: 'ბლერი', en: 'blur', ru: 'размытие' },
  };
  return N[style][lang];
}

/** A transition ask before the quote („გადასვლები: ზუმი, 0.5 წმ"), for the run card's montage words. */
export function transitionAskText(a: TransitionAsk, locale: string): string {
  const lang = pick(locale);
  const head = lang === 'en' ? 'transitions' : lang === 'ru' ? 'переходы' : 'გადასვლები';
  const what = a.mixed ? (lang === 'en' ? 'different each time' : lang === 'ru' ? 'каждый раз разные' : 'ყოველ ჯერზე სხვა')
    : a.styles.map((st) => transitionName(st, locale)).join(', ');
  const len = a.sec !== undefined ? `, ${sec(a.sec)} ${lang === 'en' ? 's' : lang === 'ru' ? 'с' : 'წმ'}` : '';
  return `${head}: ${what}${len}`;
}

/**
 * The transitions of a quoted montage in words: the styles, the length, how many of the boundaries got one, and why any
 * stayed a cut or the edit got shorter. Never a transition the plan does not hold.
 */
export function transitionsText(t: TransitionSummary, locale: string): string {
  const lang = pick(locale);
  const unit = lang === 'en' ? 's' : lang === 'ru' ? 'с' : 'წმ';
  if (!t.boundaries) {
    return lang === 'en' ? 'Transitions: none, the edit is one continuous shot, so there is nothing to go from one to another.'
      : lang === 'ru' ? 'Переходы: нет, в монтаже один непрерывный кадр, переходить не между чем.'
        : 'გადასვლები: არ არის, მონტაჟი ერთი უწყვეტი კადრია და გადასასვლელი არაფერია.';
  }
  const styles = t.mixed
    ? (lang === 'en' ? `different each time (${t.styles.map((s) => transitionName(s, locale)).join(', ')})`
      : lang === 'ru' ? `каждый раз разные (${t.styles.map((s) => transitionName(s, locale)).join(', ')})`
        : `ყოველ ჯერზე სხვა (${t.styles.map((s) => transitionName(s, locale)).join(', ')})`)
    : t.styles.map((s) => transitionName(s, locale)).join(', ');
  const len = t.minSec !== undefined ? `${sec(t.minSec)}–${sec(t.sec)} ${unit}` : `${sec(t.sec)} ${unit}`;
  const head = lang === 'en' ? `Transitions: ${styles}, ${len}, at ${t.applied} of ${t.boundaries} cuts`
    : lang === 'ru' ? `Переходы: ${styles}, ${len}, на ${t.applied} из ${t.boundaries} склеек`
      : `გადასვლები: ${styles}, ${len}, ${t.boundaries} ჭრიდან ${t.applied}-ზე`;
  const notes: string[] = [];
  if (t.tooShort) {
    notes.push(lang === 'en' ? `${t.tooShort} stay${t.tooShort === 1 ? 's' : ''} a straight cut: the shots there are too short for a transition you could see`
      : lang === 'ru' ? `${t.tooShort} — прямая склейка: кадры там слишком короткие для заметного перехода`
        : `${t.tooShort} პირდაპირ ჭრად რჩება: იქ კადრები ძალიან მოკლეა, გადასვლა არ გამოჩნდებოდა`);
  }
  if (t.noFootage) {
    notes.push(lang === 'en' ? `${t.noFootage} stay${t.noFootage === 1 ? 's' : ''} a straight cut: the clips there have no footage to spare and the length is held (the beat or the length you asked)`
      : lang === 'ru' ? `${t.noFootage} — прямая склейка: у клипов там нет запаса, а длина держится (бит или ваша длина)`
        : `${t.noFootage} პირდაპირ ჭრად რჩება: იქ კლიპებს ზედმეტი კადრები არ აქვს, სიგრძე კი უცვლელია (ბითი ან შენი თხოვნა)`);
  }
  if (t.minSec !== undefined) {
    notes.push(lang === 'en' ? `some are shorter than ${sec(t.sec)} ${unit} to fit their shots`
      : lang === 'ru' ? `некоторые короче ${sec(t.sec)} ${unit}, чтобы уместиться в кадры`
        : `ზოგი ${sec(t.sec)} ${unit}-ზე მოკლეა, რომ კადრებში ჩაეტიოს`);
  }
  if (t.shortenedSec > 0) {
    notes.push(lang === 'en' ? `the shots overlap there, so the edit is ${sec(t.shortenedSec)} ${unit} shorter`
      : lang === 'ru' ? `кадры там накладываются, поэтому монтаж короче на ${sec(t.shortenedSec)} ${unit}`
        : `იქ კადრები ერთმანეთს ედება, ამიტომ მონტაჟი ${sec(t.shortenedSec)} ${unit}-ით მოკლეა`);
  }
  return `${head}${notes.length ? `; ${notes.join('; ')}` : ''}.`;
}

/** The same in a few words for the card („3 slowed 0.5× · 3 faster 1.5×"). */
export function rampShort(r: RampResult, locale: string): string {
  const lang = pick(locale);
  if (!(r.slow + r.fast)) return lang === 'en' ? 'speed unchanged' : lang === 'ru' ? 'скорость без изменений' : 'სიჩქარე არ შეცვლილა';
  const parts: string[] = [];
  if (r.slow) parts.push(lang === 'en' ? `${r.slow} slowed ${x(RAMP_SLOW)}` : lang === 'ru' ? `${r.slow} замедл. ${x(RAMP_SLOW)}` : `${r.slow} შენელ. ${x(RAMP_SLOW)}`);
  if (r.fast) parts.push(lang === 'en' ? `${r.fast} faster ${x(RAMP_FAST)}` : lang === 'ru' ? `${r.fast} ускор. ${x(RAMP_FAST)}` : `${r.fast} აჩქ. ${x(RAMP_FAST)}`);
  return parts.join(' · ');
}

/** A speed ramp as asked, before the music has been read („speed by the music: slower and faster"). */
export function rampAskText(mode: RampMode, locale: string): string {
  const lang = pick(locale);
  if (mode === 'slow') return lang === 'en' ? 'slower shots where the music is calm' : lang === 'ru' ? 'замедление на спокойных местах' : 'შენელება, სადაც მუსიკა მშვიდია';
  if (mode === 'fast') return lang === 'en' ? 'faster shots where the music is strongest' : lang === 'ru' ? 'ускорение на самых сильных местах' : 'აჩქარება, სადაც მუსიკა ყველაზე ძლიერია';
  return lang === 'en' ? 'speed by the music: slower and faster shots' : lang === 'ru' ? 'скорость по музыке: замедление и ускорение' : 'სიჩქარე მუსიკის მიხედვით: შენელება და აჩქარება';
}

/** What a montage reads from the words (lib/agent/params minePlanParams + ./montageAsk rampOf), as the plan will hold it. */
export interface MontageWords {
  aspect?: string;
  durationSec?: number;
  musicStartSec?: number;
  ramp?: RampMode;
  transitions?: TransitionAsk;
}

/** The montage's own asks in a few words, before its quote: „მუსიკა 0:59-დან · სიჩქარე მუსიკის მიხედვით: … · 9:16". */
export function montageWordsLine(w: MontageWords | undefined, locale: string): string {
  if (!w) return '';
  const lang = pick(locale);
  const parts: string[] = [];
  if (w.musicStartSec !== undefined && w.musicStartSec > 0) {
    parts.push(lang === 'en' ? `music from ${clockOf(w.musicStartSec)}` : lang === 'ru' ? `музыка с ${clockOf(w.musicStartSec)}` : `მუსიკა ${clockOf(w.musicStartSec)}-დან`);
  }
  if (w.ramp) parts.push(rampAskText(w.ramp, locale));
  if (w.transitions) parts.push(transitionAskText(w.transitions, locale));
  if (w.durationSec !== undefined) parts.push(`${sec(w.durationSec)} ${lang === 'en' ? 's' : lang === 'ru' ? 'с' : 'წმ'}`);
  if (w.aspect) parts.push(w.aspect);
  return parts.join(' · ');
}

/** A quoted montage step in numbers (lib/agent/run/runEngine StepSummary): „12 კადრი · 29.7 წმ · 9:16 · 95 BPM · მუსიკა 0:59-დან · 3 შენელ. 0.5×". */
export function montagePlanLine(p: { shots?: number; totalSec?: number; aspect?: string; bpm?: number | null; musicStartSec?: number; ramp?: RampResult; transitions?: TransitionSummary }, locale: string): string {
  const lang = pick(locale);
  const parts: string[] = [];
  if (p.shots) parts.push(lang === 'en' ? `${p.shots} shots` : lang === 'ru' ? `кадров: ${p.shots}` : `${p.shots} კადრი`);
  if (p.totalSec) parts.push(`${sec(p.totalSec)} ${lang === 'en' ? 's' : lang === 'ru' ? 'с' : 'წმ'}`);
  if (p.aspect) parts.push(p.aspect);
  if (p.bpm) parts.push(`${Math.round(p.bpm)} BPM`);
  if (p.musicStartSec !== undefined && p.musicStartSec >= 1) {
    parts.push(lang === 'en' ? `music from ${clockOf(p.musicStartSec)}` : lang === 'ru' ? `музыка с ${clockOf(p.musicStartSec)}` : `მუსიკა ${clockOf(p.musicStartSec)}-დან`);
  }
  if (p.ramp) parts.push(rampShort(p.ramp, locale));
  if (p.transitions?.boundaries) {
    const t = p.transitions;
    const what = t.mixed ? (lang === 'en' ? 'mixed' : lang === 'ru' ? 'разные' : 'შერეული') : t.styles.map((st) => transitionName(st, locale)).join('/');
    parts.push(lang === 'en' ? `transitions ${what} ${t.applied}/${t.boundaries}` : lang === 'ru' ? `переходы ${what} ${t.applied}/${t.boundaries}` : `გადასვლები ${what} ${t.applied}/${t.boundaries}`);
  }
  return parts.join(' · ');
}

/**
 * What the montage sounds like, in words (./montageExec MontageQuote `sound`, `voice`): the music alone, the clips' own
 * sound with the music beneath it, the clips' own sound alone, or nothing; and the narration over it when there is one.
 */
export function soundText(q: Pick<MontageQuote, 'sound' | 'voice' | 'clips' | 'manifest'>, locale: string, names?: string[]): string {
  const lang = pick(locale);
  const mode = q.sound ?? 'music';
  let base: string;
  if (mode === 'own+music') {
    base = lang === 'en' ? "the clips' own sound, with your music beneath it" : lang === 'ru' ? 'родной звук клипов, ваша музыка под ним' : 'კლიპების საკუთარი ხმით, შენი მუსიკა მის ქვეშ';
  } else if (mode === 'own') {
    base = q.clips === 0
      ? (lang === 'en' ? 'no music (photos have no sound)' : lang === 'ru' ? 'без музыки (у фото нет звука)' : 'მუსიკის გარეშე (ფოტოებს ხმა არ აქვს)')
      : (lang === 'en' ? "each clip's own sound and no music" : lang === 'ru' ? 'каждый клип со своим звуком, без музыки' : 'ყოველი კლიპი თავისი ხმით, მუსიკის გარეშე');
  } else if (mode === 'silent') {
    base = lang === 'en' ? 'no sound' : lang === 'ru' ? 'без звука' : 'უხმოდ';
  } else {
    base = lang === 'en' ? 'your track as the only sound' : lang === 'ru' ? 'звук — только ваш трек' : 'ხმად მხოლოდ შენი მუსიკა';
  }
  if (!q.voice) return base;
  const v = q.voice;
  const name = q.manifest?.find((m) => m.index === v.file)?.name ?? names?.[v.file] ?? '';
  const over = lang === 'en'
    ? `, and over it your narration${name ? ` ${quoted(lang, name)}` : ''} (${sec(v.durationSec)} s): the rest goes quieter while it speaks`
    : lang === 'ru'
      ? `, поверх — ваша озвучка${name ? ` ${quoted(lang, name)}` : ''} (${sec(v.durationSec)} с): остальное звучит тише, пока она говорит`
      : `, ზემოდან შენი ნარაცია${name ? ` ${quoted(lang, name)}` : ''} (${sec(v.durationSec)} წმ): როცა ლაპარაკობს, დანარჩენი ხმა ჩუმდება`;
  return base + over;
}

/** What the sound cannot do as sent, said before Start: a track that ends early, a narration longer than the edit, ramps with nothing to ramp by. */
function soundNotes(q: MontageQuote, lang: Lang): string[] {
  const notes: string[] = [];
  if (q.musicEndsSec !== undefined) {
    notes.push(lang === 'en' ? `The music ends at ${clockOf(q.musicEndsSec)}; the clips' own sound goes on after it.`
      : lang === 'ru' ? `Музыка заканчивается на ${clockOf(q.musicEndsSec)}; дальше звучат сами клипы.`
        : `მუსიკა ${clockOf(q.musicEndsSec)}-ზე მთავრდება; შემდეგ კლიპების ხმა გრძელდება.`);
  }
  if (q.voice?.cutSec) {
    notes.push(lang === 'en' ? `The narration is ${sec(q.voice.durationSec)} s and the edit ${sec(q.totalSec)} s: its last ${sec(q.voice.cutSec)} s will not be heard. Add pictures or ask for a longer edit to hear all of it.`
      : lang === 'ru' ? `Озвучка ${sec(q.voice.durationSec)} с, монтаж ${sec(q.totalSec)} с: последние ${sec(q.voice.cutSec)} с не прозвучат. Добавьте кадры или попросите монтаж длиннее.`
        : `ნარაცია ${sec(q.voice.durationSec)} წმ-ია, მონტაჟი ${sec(q.totalSec)} წმ: ბოლო ${sec(q.voice.cutSec)} წმ არ გაისმის. სრულად რომ გაისმას, დაამატე კლიპები ან ფოტოები, ან უფრო გრძელი მონტაჟი მთხოვე.`);
  }
  if (q.rampWithoutMusic) {
    notes.push(lang === 'en' ? 'Speed changes follow the music, and no music was sent, so every shot keeps its normal speed.'
      : lang === 'ru' ? 'Скорость меняется по музыке, а музыки нет, поэтому все кадры идут с обычной скоростью.'
        : 'სიჩქარე მუსიკის მიხედვით იცვლება, მუსიკა კი არ მიგიმაგრებია, ამიტომ ყველა კადრი ჩვეულებრივი სიჩქარით მიდის.');
  }
  return notes;
}

/** How the pictures are cut: on the beat (what the track's tempo allowed), or each clip whole in the user's order. */
function cuttingText(q: MontageQuote, lang: Lang): string {
  const st = q.stills ?? 0;
  if (q.cutting === 'whole') {
    if (q.shortened) {
      const pct = Math.round(q.shortened.share * 100);
      return lang === 'en' ? `The clips together last ${sec(q.shortened.footageSec)} s, longer than one edit (${q.shortened.maxSec} s), so each gives the same share of itself (${pct}%), from its middle, in your order.`
        : lang === 'ru' ? `Клипы вместе длятся ${sec(q.shortened.footageSec)} с — больше одного монтажа (${q.shortened.maxSec} с), поэтому из середины каждого беру одинаковую долю (${pct}%), в вашем порядке.`
          : `კლიპები ერთად ${sec(q.shortened.footageSec)} წმ-ია, ერთ მონტაჟზე (${q.shortened.maxSec} წმ) მეტი, ამიტომ თითოეულიდან შუა ნაწილს თანაბრად ვიღებ (${pct}%), შენი თანმიმდევრობით.`;
    }
    if (!q.clips) {
      return lang === 'en' ? 'Each photo shows with a slow zoom, in your order.' : lang === 'ru' ? 'Каждое фото — с медленным приближением, в вашем порядке.' : 'ყოველი ფოტო ნელი გადიდებით ჩანს, შენი თანმიმდევრობით.';
    }
    return lang === 'en' ? `Each clip plays as one piece, in your order${st ? ', each photo with a slow zoom' : ''}.`
      : lang === 'ru' ? `Каждый клип идёт одним куском, в вашем порядке${st ? ', каждое фото — с медленным приближением' : ''}.`
        : `ყოველი კლიპი ერთ ნაწილად მიდის, შენი თანმიმდევრობით${st ? ', ყოველი ფოტო ნელი გადიდებით' : ''}.`;
  }
  return q.beatSynced && q.bpm
    ? (lang === 'en' ? `The track is ${Math.round(q.bpm)} BPM; every cut lands on a beat.`
      : lang === 'ru' ? `Темп трека ${Math.round(q.bpm)} BPM; каждая склейка попадает в бит.`
        : `მუსიკის ტემპი ${Math.round(q.bpm)} BPM-ია; ყოველი ჭრა ბითზე მოდის.`)
    : (lang === 'en' ? 'I could not find a steady beat, so the cuts sit on an even half-second grid.'
      : lang === 'ru' ? 'Чёткого бита нет, поэтому склейки идут по ровной сетке в полсекунды.'
        : 'მკაფიო ბითი ვერ ვიპოვე, ამიტომ კადრებს თანაბარ, ნახევარწამიან ბადეზე ვჭრი.');
}

/** Agent G's plan, in words: what it found, what it will make, what it costs, and that nothing starts before Confirm. */
export function quoteText(q: MontageQuote, names: string[] | undefined, locale: string): string {
  const lang = pick(locale);
  const found = cuttingText(q, lang);
  const st = q.stills ?? 0;
  const what = lang === 'en'
    ? (q.clips ? `${q.clips} clip${q.clips === 1 ? '' : 's'}${st ? ` and ${st} photo${st === 1 ? '' : 's'}` : ''}` : `${st} photo${st === 1 ? '' : 's'}`)
    : lang === 'ru'
      ? (q.clips ? `клипов (${q.clips})${st ? ` и фото (${st})` : ''}` : `фото (${st})`)
      : (q.clips ? `${q.clips} კლიპიდან${st ? ` და ${st} ფოტოდან` : ''}` : `${st} ფოტოდან`);
  const sound = soundText(q, locale, names);
  const plan = lang === 'en'
    ? `Plan: ${q.shots} shots from ${what}, ${sec(q.totalSec)} s, ${q.aspect}, with ${sound}.`
    : lang === 'ru'
      ? `План: ${q.shots} кадров из ${what}, ${sec(q.totalSec)} с, ${q.aspect}, ${sound}.`
      : `გეგმა: ${q.shots} კადრი ${what}, ${sec(q.totalSec)} წმ, ${q.aspect}, ${sound}.`;
  const notes = soundNotes(q, lang);
  const noted = notes.length ? `\n${notes.join('\n')}` : '';
  // A start the user asked for („მუსიკა 5 წამიდან") is said; the first beat a fraction of a second in is not news.
  const from = q.musicFile !== null && q.musicStartSec >= 1
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
  const ramp = q.ramp ? `\n${rampText(q.ramp, locale)}` : '';
  const trans = q.transitions ? `\n${transitionsText(q.transitions, locale)}` : '';
  const engine = lang === 'en' ? 'Engine: FFmpeg montage.' : lang === 'ru' ? 'Движок: FFmpeg-монтаж.' : 'ძრავი: FFmpeg მონტაჟი.';
  const price = q.credits > 0
    ? (lang === 'en' ? `Price: ✦ ${q.credits}.` : lang === 'ru' ? `Цена: ✦ ${q.credits}.` : `ფასი: ✦ ${q.credits}.`)
    : (lang === 'en' ? 'Free.' : lang === 'ru' ? 'Бесплатно.' : 'უფასოა.');
  const go = lang === 'en' ? 'Nothing starts until you press Start.' : lang === 'ru' ? 'Ничего не начнётся, пока вы не нажмёте «Начать».' : 'არაფერი დაიწყება, სანამ „დაწყებას“ არ დააჭერ.';
  return `${found}\n${plan}${from}${noted}${ramp}${trans}${files}${left}\n${engine} ${price} ${go}`;
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
      : k === 'voice'
        ? (lang === 'en' ? 'narration' : lang === 'ru' ? 'озвучка' : 'ნარაცია')
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
  music: { ka: 'ხმას ვამატებ: მუსიკას და ნარაციას', en: 'Mixing the sound: the music and the narration', ru: 'Свожу звук: музыку и озвучку' },
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

/** `sound`: the quote's (absent = the music alone, as every montage was before GG 2026-10-11 17:38Z). */
export function doneText(durationSec: number, locale: string, sound?: MontageQuote['sound']): string {
  const lang = pick(locale);
  if (sound && sound !== 'music') {
    return lang === 'en' ? `Ready: ${sec(durationSec)} s. It is also in your Library.`
      : lang === 'ru' ? `Готово: ${sec(durationSec)} с. Видео есть и в Библиотеке.`
        : `მზადაა: ${sec(durationSec)} წმ. ბიბლიოთეკაშიც შევინახე.`;
  }
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

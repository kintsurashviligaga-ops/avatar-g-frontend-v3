/**
 * lib/agent/media/editChat.ts — the studio chat's side of Agent G's edit (./editExec behind /api/agent/media/edit): the
 * edits of a plan in words, what Agent G says at each stage, its refusals, in ka · en · ru. Pure, no network, safe in the
 * browser. ./editWords reads the user's words into asks; the server resolves them against the file, and this module says
 * back what it resolved („keeps 0:05–0:12 · 9:16 cropped") before anyone presses Start.
 */
import { formatDuration } from './audioChat';
import type { EditErrorCode, EditQuote } from './editExec';
import type { EraseBox, MediaEdit } from './editPlan';
import type { EditAsk } from './editWords';
import { ROLE_ANCHOR, ROLE_STYLE, type Anchor, type Layer, type LayerAsk, type TextStyle, type TimeAsk } from './layers';

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
  /** What came out besides the file (v2.1): the copy without captions, the caption files, the measured QC. */
  out?: EditOutExtras;
}

export interface EditOutExtras {
  clean?: { url: string; name: string };
  subtitles?: { srt: string; vtt: string };
  qc?: { outcome: string; warnings: string[] };
}

/** The labels of what came out besides the file: the clean copy, the caption files, the QC line. */
export function editExtrasText(out: EditOutExtras, locale: string): { clean: string; srt: string; vtt: string; qc: string | null } {
  const lang = pick(locale);
  const qc = out.qc
    ? out.qc.outcome === 'PASS'
      ? (lang === 'en' ? 'Checked on the result: every text, logo and caption is where and when it was asked.' : lang === 'ru' ? 'Проверено на результате: каждый текст, логотип и субтитр там и тогда, где просили.' : 'შედეგზე შემოწმდა: ყველა ტექსტი, ლოგო და ქეფშენი იქაა და მაშინ ჩანს, სადაც და როცა ითხოვე.')
      : out.qc.outcome === 'PARTIAL'
        ? (lang === 'en' ? 'Checked on the result, partly: some of it could not be measured.' : lang === 'ru' ? 'Проверено на результате частично: часть измерить не удалось.' : 'შედეგზე ნაწილობრივ შემოწმდა: ზოგი რამის გაზომვა ვერ მოხერხდა.')
        : null
    : null;
  return {
    clean: lang === 'en' ? 'Without captions' : lang === 'ru' ? 'Без субтитров' : 'ქეფშენების გარეშე',
    srt: 'SRT',
    vtt: 'VTT',
    qc,
  };
}

const GRADE: Record<string, Record<Lang, string>> = {
  noir: { ka: 'შავ-თეთრი', en: 'black and white', ru: 'чёрно-белый' },
  vintage: { ka: 'ვინტაჟი', en: 'vintage', ru: 'винтаж' },
  neon: { ka: 'ნეონი', en: 'neon', ru: 'неон' },
  dramatic: { ka: 'დრამატული', en: 'dramatic', ru: 'драматичный' },
  cinematic: { ka: 'კინემატოგრაფიული', en: 'cinematic', ru: 'кинематографичный' },
};

const PLACE: Record<Anchor, Record<Lang, string>> = {
  'top-left': { ka: 'ზედა მარცხენა კუთხე', en: 'top left', ru: 'вверху слева' },
  top: { ka: 'ზემოთ', en: 'top', ru: 'вверху' },
  'top-right': { ka: 'ზედა მარჯვენა კუთხე', en: 'top right', ru: 'вверху справа' },
  left: { ka: 'მარცხნივ', en: 'left', ru: 'слева' },
  center: { ka: 'ცენტრში', en: 'centre', ru: 'по центру' },
  right: { ka: 'მარჯვნივ', en: 'right', ru: 'справа' },
  'bottom-left': { ka: 'ქვედა მარცხენა კუთხე', en: 'bottom left', ru: 'внизу слева' },
  bottom: { ka: 'ქვემოთ', en: 'bottom', ru: 'внизу' },
  'bottom-right': { ka: 'ქვედა მარჯვენა კუთხე', en: 'bottom right', ru: 'внизу справа' },
};
const STYLE: Record<TextStyle, Record<Lang, string>> = {
  minimal: { ka: 'მინიმალისტური', en: 'minimal', ru: 'минимализм' },
  cinematic: { ka: 'კინემატოგრაფიული', en: 'cinematic', ru: 'кинематографичный' },
  premium: { ka: 'პრემიუმ', en: 'premium', ru: 'премиум' },
  bold: { ka: 'თამამი', en: 'bold', ru: 'жирный' },
  brand: { ka: 'ბრენდის ღილაკი', en: 'brand button', ru: 'фирменная кнопка' },
};
const MOTION: Record<string, Record<Lang, string>> = {
  fade: { ka: 'ნაზად შემოდის', en: 'fades in', ru: 'плавно появляется' },
  'slide-up': { ka: 'ქვემოდან შემოდის', en: 'slides up', ru: 'выезжает снизу' },
  'slide-left': { ka: 'გვერდიდან შემოდის', en: 'slides in', ru: 'выезжает сбоку' },
  scale: { ka: 'იზრდება', en: 'scales in', ru: 'вырастает' },
  typewriter: { ka: 'ასო-ასო', en: 'letter by letter', ru: 'по буквам' },
  words: { ka: 'სიტყვა-სიტყვა', en: 'word by word', ru: 'по словам' },
};

/** One layer in a few words: „„მიტანა თბილისში" ქვემოთ, 0:07–0:10, ქვემოდან შემოდის". */
export function layerLine(l: Layer, locale: string, durationSec: number): string {
  const lang = pick(locale);
  const when = l.endSec > 0 && !(l.startSec <= 0.05 && l.endSec >= durationSec - 0.05) ? `, ${at(l.startSec)}–${at(l.endSec)}` : '';
  if (l.kind === 'text') {
    const how = [STYLE[l.style][lang], l.motionIn !== 'none' ? MOTION[l.motionIn]?.[lang] : '', l.beats ? (lang === 'en' ? 'on the beats' : lang === 'ru' ? 'в ритм' : 'ბიტებზე') : ''].filter(Boolean).join(', ');
    return `${q(lang, l.text)} ${PLACE[l.anchor][lang]}${when} (${how})`;
  }
  if (l.kind === 'image') {
    return lang === 'en' ? `your picture ${PLACE[l.anchor][lang]}${when}` : lang === 'ru' ? `ваша картинка ${PLACE[l.anchor][lang]}${when}` : `შენი სურათი ${PLACE[l.anchor][lang]}${when}`;
  }
  const mode = l.mode === 'mosaic' ? (lang === 'en' ? 'pixelated' : lang === 'ru' ? 'пикселизация' : 'მოზაიკა') : (lang === 'en' ? 'blurred' : lang === 'ru' ? 'размытие' : 'დაბინდვა');
  return `${mode}: ${PLACE[l.anchor][lang]}${when}`;
}

/** One erased place in words: „ვშლი: ზედა მარჯვენა კუთხე, 0:00–0:03 (ირგვლივი ფერებით ვავსებ)". */
function eraseLine(b: EraseBox, lang: Lang): string {
  const where = b.at ? PLACE[b.at][lang] : `${Math.round(b.x * 100)}%·${Math.round(b.y * 100)}% (${Math.round(b.w * 100)}×${Math.round(b.h * 100)}%)`;
  const when = b.fromSec !== undefined && b.toSec !== undefined ? `, ${at(b.fromSec)}–${at(b.toSec)}` : '';
  return lang === 'en' ? `erase: ${where}${when} (filled in from around it)`
    : lang === 'ru' ? `убираю: ${where}${when} (заполняю цветами вокруг)`
      : `ვშლი: ${where}${when} (ირგვლივი ფერებით ვავსებ)`;
}

/** One resolved edit in a few words: „keeps 0:05–0:12", „2× faster", „9:16, cropped", „sound off". */
export function editLine(e: MediaEdit, locale: string, durationSec = 0): string {
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
    case 'overlay':
      return e.look === 'grain'
        ? (lang === 'en' ? 'overlay: film grain' : lang === 'ru' ? 'оверлей: зерно плёнки' : 'ოვერლეი: ფირის მარცვალი')
        : (lang === 'en' ? 'overlay: warm light leaks' : lang === 'ru' ? 'оверлей: тёплые световые блики' : 'ოვერლეი: თბილი სინათლის ანარეკლები');
    case 'erase':
      return e.boxes.map((b) => eraseLine(b, lang)).join(' · ');
    case 'caption':
      return lang === 'en' ? `caption ${q(lang, e.text)}` : lang === 'ru' ? `подпись ${q(lang, e.text)}` : `წარწერა ${q(lang, e.text)}`;
    case 'thumbnail':
      return lang === 'en' ? `a still from ${at(e.atSec)}` : lang === 'ru' ? `кадр с ${at(e.atSec)}` : `კადრი ${at(e.atSec)}-დან`;
    case 'layers':
      return e.layers.map((l) => layerLine(l, locale, durationSec)).join(' · ');
    case 'captions': {
      const n = e.track.cues.length;
      const what = lang === 'en' ? `captions: ${n} line${n === 1 ? '' : 's'}` : lang === 'ru' ? `субтитры: ${n} строк` : `ქეფშენები: ${n} სტრიქონი`;
      const deliver = e.deliver === 'both'
        ? (lang === 'en' ? 'with and without captions' : lang === 'ru' ? 'с субтитрами и без' : 'ქეფშენებით და მათ გარეშე')
        : e.deliver === 'file'
          ? (lang === 'en' ? 'as .srt / .vtt files, the video clean' : lang === 'ru' ? 'файлами .srt / .vtt, видео чистое' : '.srt / .vtt ფაილებად, ვიდეო სუფთა')
          : (lang === 'en' ? 'burned in' : lang === 'ru' ? 'вшиты в видео' : 'ვიდეოში ჩაწერილი');
      return `${what}, ${deliver}${e.track.karaoke ? (lang === 'en' ? ', word highlight' : lang === 'ru' ? ', подсветка слов' : ', სიტყვების მონიშვნით') : ''}`;
    }
  }
}

/** When a layer ask shows, in words, before there is a file to resolve it against („ბოლო 3 წამში", „until 3 s before the end"). */
function whenAsked(a: TimeAsk, lang: Lang): string {
  const s = lang === 'en' ? 's' : lang === 'ru' ? 'с' : 'წამ';
  if (a.lastSec !== undefined) return lang === 'en' ? `the last ${num(a.lastSec)} ${s}` : lang === 'ru' ? `последние ${num(a.lastSec)} ${s}` : `ბოლო ${num(a.lastSec)} ${s}ში`;
  if (a.firstSec !== undefined) return lang === 'en' ? `the first ${num(a.firstSec)} ${s}` : lang === 'ru' ? `первые ${num(a.firstSec)} ${s}` : `პირველ ${num(a.firstSec)} ${s}ში`;
  if (a.fromSec !== undefined && a.toSec !== undefined) return `${at(a.fromSec)}–${at(a.toSec)}`;
  if (a.beforeLastSec !== undefined) {
    const from = a.fromSec !== undefined ? (lang === 'en' ? `from ${at(a.fromSec)} ` : lang === 'ru' ? `с ${at(a.fromSec)} ` : `${at(a.fromSec)}-დან `) : '';
    return lang === 'en' ? `${from}until ${num(a.beforeLastSec)} ${s} before the end` : lang === 'ru' ? `${from}до последних ${num(a.beforeLastSec)} ${s}` : `${from}ბოლო ${num(a.beforeLastSec)} ${s}ამდე`;
  }
  if (a.fromSec !== undefined) return lang === 'en' ? `from ${at(a.fromSec)}` : lang === 'ru' ? `с ${at(a.fromSec)}` : `${at(a.fromSec)}-დან`;
  if (a.toSec !== undefined) return lang === 'en' ? `until ${at(a.toSec)}` : lang === 'ru' ? `до ${at(a.toSec)}` : `${at(a.toSec)}-მდე`;
  return '';
}

/** One layer as asked, with the defaults the resolver gives it (./layers resolveLayers): place, look, motion and time. */
export function layerAskLine(l: LayerAsk, locale: string): string {
  const lang = pick(locale);
  const when = whenAsked(l, lang);
  const w = when ? `, ${when}` : '';
  if (l.kind === 'text') {
    const role = l.role ?? 'text';
    const motion = l.motionIn ?? (role === 'cta' ? 'slide-up' : 'fade');
    const how = [STYLE[l.style ?? ROLE_STYLE[role]][lang], motion !== 'none' ? MOTION[motion]?.[lang] : ''].filter(Boolean).join(', ');
    return `${q(lang, l.text)} ${PLACE[l.anchor ?? ROLE_ANCHOR[role]][lang]}${w} (${how})`;
  }
  if (l.kind === 'image') {
    const place = PLACE[l.anchor ?? 'top-right'][lang];
    return lang === 'en' ? `your picture ${place}${w}` : lang === 'ru' ? `ваша картинка ${place}${w}` : `შენი სურათი ${place}${w}`;
  }
  const mode = l.mode === 'mosaic' ? (lang === 'en' ? 'pixelated' : lang === 'ru' ? 'пикселизация' : 'მოზაიკა') : (lang === 'en' ? 'blurred' : lang === 'ru' ? 'размытие' : 'დაბინდვა');
  return `${mode}: ${PLACE[l.anchor ?? 'center'][lang]}${w}`;
}

/**
 * One edit as the words asked it, before a file resolves it: a layers ask is its added layers (it has no resolved
 * `layers` yet); grade, fade, volume, overlay and caption asks are already the edit itself.
 */
export function askLine(e: EditAsk, locale: string): string {
  if (e.op === 'layers') return (e.add ?? []).map((l) => layerAskLine(l, locale)).join(' · ');
  if (e.op === 'grade' || e.op === 'fade' || e.op === 'volume' || e.op === 'mute' || e.op === 'caption' || e.op === 'aspect') return editLine(e as MediaEdit, locale);
  if (e.op === 'overlay') return editLine({ op: 'overlay', look: e.look ?? 'light-leak' }, locale);
  if (e.op === 'speed') return editLine(e, locale);
  if (e.op === 'erase') {
    const lang = pick(locale);
    const places = (e.boxes ?? (e.at ? [{ at: e.at }] : [])).flatMap((b) => (b.at ? [PLACE[b.at][lang]] : []));
    return places.length ? (lang === 'en' ? `erase: ${places.join(', ')}` : lang === 'ru' ? `убрать: ${places.join(', ')}` : `მოშორება: ${places.join(', ')}`) : '';
  }
  return '';
}

/** The plan's edits on one line: „keeps 0:05–0:12 · 2× faster · frame 9:16, cropped to fill". */
export function editsLine(edits: readonly MediaEdit[], locale: string, durationSec = 0): string {
  return edits.map((e) => editLine(e, locale, durationSec)).join(' · ');
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
  const line = editsLine(quote.edits, locale, quote.plan.durationSec);
  const plan = lang === 'en' ? `Plan: ${line}.` : lang === 'ru' ? `План: ${line}.` : `გეგმა: ${line}.`;
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
  | 'cut_middle' | 'approval_unclear' | 'cta_text' | 'logo_file' | 'speech_captions' | 'translate_captions' | 'remove_object';

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
  text_too_long: { ka: 'ტექსტი ძალიან გრძელია (160 სიმბოლომდე). შეამოკლე და მომწერე თავიდან.', en: 'The text is too long (up to 160 characters). Shorten it and send it again.', ru: 'Текст слишком длинный (до 160 символов). Сократите и пришлите снова.' },
  too_many_layers: { ka: 'ერთ შედეგზე 12 ფენამდე შემიძლია.', en: 'I can put up to 12 layers on one result.', ru: 'На один результат — до 12 слоёв.' },
  layer_not_found: { ka: 'ასეთი ფენა მე არ დამიმატებია. რაც თავად კადრშია (მაგალითად ლოგო ან წარწერა ვიდეოში), იმას ვერ ვაშორებ.', en: 'I did not add such a layer. What is in the picture itself (a logo or text in the video) I cannot remove.', ru: 'Такого слоя я не добавлял. То, что есть в самом кадре (логотип или надпись в видео), я убрать не могу.' },
  layer_ambiguous: { ka: 'რამდენიმე ტექსტია. რომელი შევცვალო? მაგალითად: „ზედა ტექსტი…".', en: 'There are several texts. Which one? For example: "the top text…".', ru: 'Текстов несколько. Какой изменить? Например: «верхний текст…».' },
  bad_captions: { ka: 'ქეფშენების დრო ან ტექსტი ვერ წავიკითხე. დაწერე ასე: „0:01–0:03 გამარჯობა", ან მიამაგრე .srt / .vtt ფაილი.', en: 'I could not read the captions\' times or words. Write "0:01–0:03 Hello", or attach an .srt / .vtt file.', ru: 'Не удалось прочитать время или текст субтитров. Напишите «0:01–0:03 Привет» или прикрепите .srt / .vtt.' },
  missing_glyphs: { ka: 'ამ სიმბოლოებს ჩემი შრიფტი ვერ ხატავს, ამიტომ არაფერი დამიწყია:', en: 'My font cannot draw these characters, so nothing was started:', ru: 'Мой шрифт не может нарисовать эти символы, поэтому ничего не запущено:' },
  text_does_not_fit: { ka: 'ტექსტი კადრში ვერ ეტევა ოთხ სტრიქონად. შეამოკლე ან ზომა შეამცირე.', en: 'The text does not fit the frame in four lines. Shorten it or make it smaller.', ru: 'Текст не помещается в кадр в четыре строки. Сократите или уменьшите.' },
  layer_picture: { ka: 'სურათი (მაგალითად ლოგო) ვერ გავხსენი ან შენი არ არის.', en: 'The picture (a logo) could not be opened, or it is not yours.', ru: 'Картинку (логотип) не удалось открыть, или она не ваша.' },
  logo_file: { ka: 'რომელი ლოგო დავადო? მიამაგრე ლოგოს სურათი (PNG, სასურველია გამჭვირვალე ფონით) და იგივე დამიწერე.', en: 'Which logo should I put on? Attach the logo picture (a PNG, ideally with a transparent background) and say it again.', ru: 'Какой логотип поставить? Прикрепите картинку логотипа (PNG, лучше с прозрачным фоном) и повторите просьбу.' },
  no_captions: { ka: 'ამ ფაილზე ჩემი დამატებული ქეფშენები არ არის. ახლის დასამატებლად დაწერე სტრიქონები დროით („0:01–0:03 გამარჯობა") ან მიამაგრე .srt / .vtt. თუ ქეფშენები თავად კადრშია, მათ ვერ ვაშორებ.', en: 'This file has no captions of mine. To add some, write the lines with their times ("0:01–0:03 Hello") or attach an .srt / .vtt. Captions printed in the picture itself I cannot remove.', ru: 'На этом файле нет моих субтитров. Чтобы добавить, напишите строки со временем («0:01–0:03 Привет») или прикрепите .srt / .vtt. Субтитры, вшитые в сам кадр, я убрать не могу.' },
  cta_text: { ka: 'რა ეწეროს ღილაკზე? დაწერე ბრჭყალებში, მაგალითად: CTA „შეუკვეთე ახლა".', en: 'What should the button say? Put it in quotes, for example: CTA "Order now".', ru: 'Что написать на кнопке? В кавычках, например: CTA «Закажи сейчас».' },
  erase_where: { ka: 'სად არის ის, რაც უნდა მოვაშორო? თქვი ადგილი: ზედა მარცხენა ან მარჯვენა კუთხე, ქვედა მარცხენა ან მარჯვენა კუთხე, ზემოთ, ქვემოთ, მარცხნივ, მარჯვნივ ან ცენტრში. მაგალითად: „ზედა მარჯვენა კუთხეში ლოგო მოაშორე".', en: 'Where is what I should remove? Say the place: the top left or right corner, the bottom left or right corner, the top, the bottom, the left, the right or the centre. For example: “remove the logo in the top right corner”.', ru: 'Где то, что нужно убрать? Назовите место: левый или правый верхний угол, левый или правый нижний угол, верх, низ, слева, справа или центр. Например: «убери логотип в правом верхнем углу».' },
  erase_too_large: { ka: 'ეს ადგილი კადრის ძალიან დიდი ნაწილია: იქ შევსება მხოლოდ ლაქას დატოვებდა. დამისახელე უფრო პატარა ადგილი (კუთხე, ზედა ან ქვედა ზოლი).', en: 'That place is too large a part of the picture: filling it in would only leave a smear. Name a smaller place (a corner, the top or bottom band).', ru: 'Это слишком большая часть кадра: заполнение оставит лишь пятно. Назовите место меньше (угол, верхнюю или нижнюю полосу).' },
  remove_object: { ka: 'ადამიანის, საგნის ან ფონის ამოღება ფიქსირებული ადგილი არ არის: ამას AI-ით შევსება სჭირდება (ფასიანი პროვაიდერის გამოძახება) და ჯერ ჩართული არ არის. შემიძლია მოვაშორო ტექსტი, ლოგო, წყლის ნიშანი ან სუბტიტრები, რომლებიც ერთ ადგილას დგას: თქვი, სადაა.', en: 'Taking out a person, an object or the background is not a fixed place: it needs AI fill (a paid provider call), which is not switched on yet. I can remove a text, a logo, a watermark or subtitles that stay in one place: say where it is.', ru: 'Убрать человека, предмет или фон нельзя как фиксированное место: для этого нужно заполнение ИИ (платный вызов провайдера), и оно пока не включено. Я могу убрать текст, логотип, водяной знак или субтитры, которые стоят на одном месте: скажите, где.' },
  speech_captions: { ka: 'მეტყველებიდან ქეფშენებს ჯერ თავად ვერ ვწერ: ამას სჭირდება ფასიანი ამოცნობა (ElevenLabs Scribe), რაზეც გადაწყვეტილება მფლობელს ეკუთვნის. ახლავე შემიძლია შენი ტექსტით: დაწერე „0:01–0:03 გამარჯობა" ან მიამაგრე .srt / .vtt.', en: 'I cannot write captions from the speech myself yet: that needs paid recognition (ElevenLabs Scribe), which is the owner\'s decision. I can use your own words now: write "0:01–0:03 Hello" or attach an .srt / .vtt.', ru: 'Субтитры из речи я пока сам не пишу: это платное распознавание (ElevenLabs Scribe), решение за владельцем. Сейчас могу с вашим текстом: напишите «0:01–0:03 Привет» или прикрепите .srt / .vtt.' },
  translate_captions: { ka: 'ქეფშენების თარგმნა ფასიან მოდელს სჭირდება და ჯერ ჩართული არ არის (მფლობელის გადაწყვეტილება). თარგმნილი ტექსტი თავად მომწერე დროებით და იმავე დროზე ჩავსვამ.', en: 'Translating captions needs a paid model and is not on yet (the owner\'s decision). Send the translated lines with their times and I will put them on at those times.', ru: 'Перевод субтитров требует платной модели и пока не включён (решение владельца). Пришлите перевод со временем — поставлю на те же моменты.' },
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
  const more = code === 'missing_glyphs' && detail ? ` ${detail}`
    : lang === 'en' && detail && (code === 'out_of_range' || code === 'conflict' || code === 'too_long') ? ` ${detail}` : '';
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

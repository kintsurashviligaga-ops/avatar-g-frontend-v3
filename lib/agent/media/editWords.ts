/**
 * lib/agent/media/editWords.ts — the edits a user puts in words, ka · en · ru, as the asks ./editPlan resolveEdits takes.
 * Pure, no network. The chat reads a message with it; the server resolves the asks against the file and the card shows
 * the result in numbers ("keeps 0:05–0:12") before anyone presses Start, so a misread never runs unseen.
 *
 * Conservative on purpose: a word that could mean two things asks nothing (a range with "delete" is the middle cut out,
 * which one file cannot do; „ამოიღე ხმა" is the MP3 extraction, not mute). Numbers come only from the user.
 *
 * ⚠️ NO `\b` (ASCII-only; it never matches next to a Georgian or Cyrillic letter). Token edges are Unicode lookarounds.
 */
import { aspectFromPrompt } from './montageAsk';
import { extractOverlayText } from '@/lib/video/remixCaption';
import type { FrameAspect, GradeStyle } from '@/lib/video/editFilters';

const B0 = '(?<![\\p{L}\\p{N}])';
const B1 = '(?![\\p{L}\\p{N}])';
const NUM = '(\\d{1,4}(?:[.,]\\d{1,2})?)';
const CLOCK = '(\\d{1,2}):(\\d{2})';
/** Seconds, in the three languages (the Georgian stem takes every case ending: წამი, წამის, წამიდან, წამამდე…). */
const SEC = `(?:წამ\\p{L}*|წმ\\.?|s|sec|secs|seconds?|сек\\p{L}*|с)${B1}`;

const n = (x: string): number => parseFloat(x.replace(',', '.'));
const clock = (m: string, s: string): number => parseInt(m, 10) * 60 + parseInt(s, 10);
/** A time as written: „0:05" or „5" (seconds). */
const T = `(?:${CLOCK}|${NUM})`;
const timeAt = (m: RegExpExecArray, i: number): number => (m[i] !== undefined ? clock(m[i]!, m[i + 1]!) : n(m[i + 2]!));

/** One edit as asked (./editPlan resolveEdits): trims may name the last seconds; a thumbnail may name no time. */
export type EditAsk =
  | { op: 'trim'; fromSec?: number; toSec?: number; lastSec?: number; cutEndSec?: number }
  | { op: 'speed'; factor: number }
  | { op: 'aspect'; to: FrameAspect; fit: 'crop' | 'pad' }
  | { op: 'grade'; style: GradeStyle }
  | { op: 'fade'; inSec: number; outSec: number }
  | { op: 'volume'; db: number }
  | { op: 'mute' }
  | { op: 'caption'; text: string }
  | { op: 'thumbnail'; atSec?: number };

export interface MinedEdits {
  edits: EditAsk[];
  /** What the words ask for but do not give: the caption's text. */
  missing: Array<'caption_text'>;
  /** What the words ask for that one edit cannot do (removing a stretch from the middle). */
  unsupported: Array<'cut_middle'>;
}

// ── the words ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Deleting something (the rest is kept): with a range, that is the middle cut out. */
const DELETE = /მოაშორ|წაშალ|ამოაგდ|გადააგდ|cut\s+out|remove|delete|drop|get\s+rid|убер|удали|выкин/iu;
/** Cutting an edge off: „პირველი 3 წამი მოაჭერი" drops them, but „5-დან 12-მდე მოჭერი" keeps that stretch. */
const CUT_AWAY = /მოაჭერ|მოჭერ|cut\s+(?:off|away)|skip|обреж|обрез|отреж/iu;
/** Keeping ONLY something. */
const KEEP = /დატოვ|მხოლოდ|keep|only|leave|оставь|оставить|только/iu;
const TRIM = /მოჭერ|მოაჭერ|მოჭრ|შემოკლ|შეამოკლ|დაამოკლ|ამოჭერ|trim|cut|shorten|clip|обреж|обрез|укороти|сократи|вырежи/iu;
const SHORTEN = /შეამოკლ|დაამოკლ|შემოკლ|shorten|trim\s+(?:it\s+)?(?:down\s+)?to|cut\s+(?:it\s+)?(?:down\s+)?to|make\s+it|укороти|сократи|обреж\p{L}*\s+до/iu;

const FIRST = new RegExp(`${B0}(?:პირველი?|პირველ\\p{L}*|first|первые|первых|первую|первой)\\s+${NUM}\\s*-?\\s*${SEC}`, 'iu');
const LAST = new RegExp(`${B0}(?:ბოლო|last|final|последние|последних|последнюю|последней)\\s+${NUM}\\s*-?\\s*${SEC}`, 'iu');
/** „5-დან 12 წამამდე", „5 წამიდან 12-მდე", „0:05-დან 0:12-მდე". */
const RANGE_KA = new RegExp(`${T}\\s*-?\\s*(?:წამიდან|წმ\\.?\\s*-?\\s*დან|დან)\\s+${T}\\s*-?\\s*(?:წამამდე|წმ\\.?\\s*-?\\s*მდე|მდე)${B1}`, 'iu');
/** "from 5 to 12 s", "between 0:05 and 0:12", "5–12 seconds", "0:05-0:12". */
const RANGE_EN = new RegExp(`${B0}(?:from|between)\\s+(?:the\\s+)?${T}\\s*(?:${SEC})?\\s*(?:to|and|until|till|-|–|—)\\s*(?:the\\s+)?${T}`, 'iu');
const RANGE_DASH = new RegExp(`${B0}${T}\\s*(?:-|–|—)\\s*${T}\\s*(?:${SEC})?`, 'iu');
/** «с 5 до 12 секунды», «от 0:05 до 0:12», «с 5 по 12 секунду». */
const RANGE_RU = new RegExp(`${B0}(?:с|со|от)\\s+${T}\\s*(?:-?\\s*(?:й|ой|ей)\\s*)?(?:${SEC})?\\s*(?:до|по)\\s+${T}`, 'iu');
/** „10 წამამდე", "to 10 seconds", «до 10 секунд». */
const UPTO = new RegExp(`(?:${NUM}\\s*-?\\s*(?:წამამდე|წმ\\.?\\s*-?\\s*მდე))|(?:${B0}(?:to|into)\\s+${NUM}\\s*-?\\s*${SEC})|(?:${B0}до\\s+${NUM}\\s*-?\\s*${SEC})`, 'iu');
/** „5 წამიდან", "from 5 s", «с 5 секунды»: where the kept part starts. */
const FROM = new RegExp(`(?:${NUM}\\s*-?\\s*(?:წამიდან|წმ\\.?\\s*-?\\s*დან))|(?:${B0}(?:from|at|starting\\s+(?:at|from))\\s+(?:the\\s+)?${NUM}\\s*(?:st|nd|rd|th)?\\s*-?\\s*${SEC})|(?:${B0}(?:с|со|начиная\\s+с)\\s+${NUM}\\s*-?\\s*(?:й|ой|ей)?\\s*${SEC})`, 'iu');
/** A music start („მუსიკა 5 წამიდან") is the montage's offset, not a trim (lib/agent/params mineMusicStart). */
const MUSIC = /მუსიკ|სიმღერ|ტრეკ|music|song|track|soundtrack|музык|песн|трек/iu;

const SPEED = /სიჩქარ|აჩქარ|ჩქარ|შეანელ|ანელ|ნელა|ნელ\p{L}*\s+მოძრაობ|speed|faster|slower|slow[\s-]*mo|slow\s+(?:it\s+)?down|fast[\s-]*forward|ускор|замедл|быстрее|медленнее|скорост|слоу[\s-]*мо/iu;
const SLOW = /შეანელ|ანელ|ნელა|ნელ\p{L}*\s+მოძრაობ|slower|slow[\s-]*mo|slow\s+(?:it\s+)?down|half\s+speed|замедл|медленнее|слоу[\s-]*мо/iu;
const FACTOR = new RegExp(`(?:${NUM}\\s*(?:x|×|х)${B1})|(?:${NUM}\\s*-?\\s*ჯერ)|(?:${B0}в\\s+${NUM}\\s+раз)|(?:${NUM}\\s+times)`, 'iu');

const PAD = /შავი?\s+ზოლ|ზოლებით|მთლიანად\s+(?:ჩანდეს|დარჩეს)|არ\s+მოიჭრას|letterbox|black\s+bars|pad(?:ding|ded)?|fit\s+(?:the\s+)?whole|without\s+crop|no\s+crop|keep\s+(?:the\s+)?whole|с\s+полями|чёрн\p{L}*\s+полос|черн\p{L}*\s+полос|целиком|без\s+обрез/iu;
const FOUR_FIVE = /4\s*[:x×/]\s*5|ინსტაგრამის\s+პოსტ|instagram\s+(?:feed\s+)?post|пост\s+(?:для\s+)?инстаграм/iu;
const FRAME_WORD = /ფორმატ|ზომ|ასპექტ|ratio|aspect|format|frame|vertical|horizontal|square|ვერტიკალ|ჰორიზონტალ|კვადრატ|вертикал|горизонтал|квадрат|формат|reels|tiktok|shorts|stories|youtube|ტიკტოკ|რილს|სთორ|сторис|рилс|тикток|ютуб/iu;

const GRADES: ReadonlyArray<{ style: GradeStyle; re: RegExp }> = [
  { style: 'noir', re: /შავ\s*-?\s*თეთრ|ნუარ|noir|black\s*(?:and|&)\s*white|b\s*&\s*w|monochrome|grayscale|greyscale|ч[её]рно\s*-?\s*бел|нуар|монохром/iu },
  { style: 'vintage', re: /ვინტაჟ|რეტრო|ძველებურ|vintage|retro|old[\s-]*school|винтаж|ретро|старин/iu },
  { style: 'neon', re: /ნეონ|neon|неон/iu },
  { style: 'dramatic', re: /დრამატ|dramatic|moody|драмат/iu },
  { style: 'cinematic', re: /კინემატოგრაფ|კინოს\s+(?:ფერ|სტილ)|კინოსავით|cinematic|film\s+look|movie\s+look|teal\s*(?:and|&)\s*orange|кинематограф|как\s+в\s+кино|киношн/iu },
];
const COLOR = /ფერ\p{L}*|colou?r|grade|grading|tint|цвет\p{L}*/iu;
const CHANGE = /შეცვალ|შეუცვალ|გააუმჯობეს|გაალამაზ|change|improve|enhance|grade|измени|поменяй|улучши/iu;

const FADE = /ფეიდ|fade|затух|затемн|проявлен|ჩაქრ|ჩაბნელ|გაბნელ|ბნელიდან|ნელ-ნელა\s+გამოჩნდ/iu;
const FADE_IN = /ფეიდ\s*-?\s*ინ|ბნელიდან|ნელ-ნელა\s+გამოჩნდ|fade[\s-]*in|fade\s+(?:it\s+)?up|from\s+black|из\s+темноты|плавн\p{L}*\s+(?:появ|начал)|появлен/iu;
const FADE_OUT = /ფეიდ\s*-?\s*აუთ|ჩაქრ|ჩაბნელ|გაბნელ|fade[\s-]*out|fade\s+to\s+black|to\s+black|затух|затемн\p{L}*\s+в\s+конце|в\s+темноту|в\s+конце\s+затемн/iu;
const FADE_LEN = new RegExp(`(?:${NUM}\\s*-?\\s*(?:წამიან|წმ-?იან)\\p{L}*)|(?:${NUM}\\s*-?\\s*(?:second|sec|s)${B1}\\s*fade)|(?:fade\\p{L}*\\s+(?:of\\s+|for\\s+)?${NUM}\\s*-?\\s*${SEC})|(?:${NUM}\\s*-?\\s*секундн\\p{L}*)`, 'iu');

const MUTE = /უხმო|ხმის\s+გარეშე|ხმა\s+(?:მოაშორ|მოუშორ|მოხსენ|წაშალ|გათიშ|გამორთ)|(?:მოაშორ|მოუშორ|მოხსენ|წაშალ|გათიშ|გამორთ)\p{L}*\s+ხმა|mute|without\s+(?:the\s+)?(?:sound|audio)|no\s+(?:sound|audio)|remove\s+(?:the\s+)?(?:sound|audio)|silent|без\s+звука|(?:убер|удали|отключ|выключ)\p{L}*\s+звук/iu;
const LOUDER = /ხმა\s+(?:აუწი|აუმატ|გაზარდ)|(?:აუწი|გაზარდ)\p{L}*\s+ხმა|ხმამაღლა|louder|turn\s+(?:it\s+)?up|volume\s+up|increase\s+(?:the\s+)?volume|boost\s+(?:the\s+)?(?:volume|sound|audio)|громче|увелич\p{L}*\s+громкост|прибав\p{L}*\s+звук/iu;
const QUIETER = /ხმა\s+(?:დაუწი|შეამცირ|დაუკელ)|(?:დაუწი|შეამცირ)\p{L}*\s+ხმა|ჩუმად|quieter|turn\s+(?:it\s+)?down|volume\s+down|lower\s+(?:the\s+)?volume|reduce\s+(?:the\s+)?volume|тише|потише|уменьш\p{L}*\s+громкост|убав\p{L}*\s+звук/iu;
const DB = new RegExp(`([+-]?\\d{1,2}(?:[.,]\\d)?)\\s*(?:dB|db|დბ|дБ|дб)${B1}`, 'u');

const CAPTION = /სუბტიტრ|წარწერ|ტექსტ\p{L}*\s+(?:დაადე|დაამატ|ჩაწერ|დააწერ)|(?:დაადე|დაამატ|ჩაწერ|დააწერ)\p{L}*\s+ტექსტ|caption|subtitle|title\s+(?:on|over)|text\s+(?:on|over)|(?:add|put|write|burn)\s+(?:a\s+|the\s+)?(?:text|title|line|words)|надпис|субтитр|титр|текст\s+(?:на|поверх)|(?:добав|налож|напиш)\p{L}*\s+текст/iu;

const THUMB = /ქავერ|თამბნეილ|მინიატიურ|ყდის\s+ფოტ|სქრინშოტ|კადრი\s+(?:ამოიღე|ამომიღე|გამიკეთე|გადაიღე)|thumbnail|cover\s+(?:image|photo|frame|picture)|poster\s+frame|still\s+frame|screenshot|freeze\s+frame|grab\s+a\s+frame|frame\s+grab|обложк|превью|миниатюр|скриншот|стоп\s*-?\s*кадр/iu;
const THUMB_AT = new RegExp(`(?:${T}\\s*-?\\s*(?:წამზე|წმ-?ზე|ზე)${B1})|(?:${B0}at\\s+(?:the\\s+)?${T}\\s*(?:${SEC})?)|(?:${B0}на\\s+${T}\\s*-?\\s*(?:й|ой|ей)?\\s*(?:${SEC})?)`, 'iu');

/** The first group of a regex match that holds a number. */
function firstNum(m: RegExpExecArray | null): number | undefined {
  if (!m) return undefined;
  for (let i = 1; i < m.length; i++) if (m[i] !== undefined) return n(m[i]!);
  return undefined;
}

/** The time in a THUMB_AT-style match (three alternatives, each a CLOCK pair or a NUM). */
function timeOfAlternatives(m: RegExpExecArray | null): number | undefined {
  if (!m) return undefined;
  for (let i = 1; i + 2 < m.length + 1; i += 3) {
    if (m[i] !== undefined) return clock(m[i]!, m[i + 1]!);
    if (m[i + 2] !== undefined) return n(m[i + 2]!);
  }
  return undefined;
}

function mineTrim(t: string): { ask: EditAsk | null; cutMiddle: boolean } {
  const keeping = KEEP.test(t);
  for (const re of [RANGE_KA, RANGE_RU, RANGE_EN, RANGE_DASH]) {
    const m = re.exec(t);
    if (!m) continue;
    // The dash form („5-12") is a range only when the message is about cutting.
    if (re === RANGE_DASH && !TRIM.test(t)) continue;
    const a = timeAt(m, 1), b = timeAt(m, 4);
    if (!(b > a)) continue;
    if (DELETE.test(t) && !keeping) return { ask: null, cutMiddle: true };
    return { ask: { op: 'trim', fromSec: a, toSec: b }, cutMiddle: false };
  }
  const removing = (DELETE.test(t) || CUT_AWAY.test(t)) && !keeping;
  const first = FIRST.exec(t);
  if (first) return { ask: removing ? { op: 'trim', fromSec: n(first[1]!) } : { op: 'trim', toSec: n(first[1]!) }, cutMiddle: false };
  const last = LAST.exec(t);
  if (last) return { ask: removing ? { op: 'trim', cutEndSec: n(last[1]!) } : { op: 'trim', lastSec: n(last[1]!) }, cutMiddle: false };
  if (!TRIM.test(t)) return { ask: null, cutMiddle: false };
  const upto = UPTO.exec(t);
  if (upto && SHORTEN.test(t)) return { ask: { op: 'trim', toSec: firstNum(upto)! }, cutMiddle: false };
  if (!MUSIC.test(t)) {
    const from = FROM.exec(t);
    if (from) return { ask: { op: 'trim', fromSec: firstNum(from)! }, cutMiddle: false };
  }
  return { ask: null, cutMiddle: false };
}

function mineSpeed(t: string): EditAsk | null {
  if (!SPEED.test(t)) return null;
  const f = firstNum(FACTOR.exec(t));
  const slow = SLOW.test(t);
  if (f !== undefined && f > 0) return { op: 'speed', factor: f < 1 ? f : slow ? 1 / f : f };
  return { op: 'speed', factor: slow ? 0.5 : 2 };
}

function mineAspect(t: string): EditAsk | null {
  const to: FrameAspect | null = FOUR_FIVE.test(t) ? '4:5' : (aspectFromPrompt(t) as FrameAspect | null);
  if (!to || !FRAME_WORD.test(t) && !/\d\s*[:x×/]\s*\d/.test(t)) return null;
  return { op: 'aspect', to, fit: PAD.test(t) ? 'pad' : 'crop' };
}

function mineGrade(t: string): EditAsk | null {
  const named = GRADES.find((g) => g.re.test(t));
  if (named) return { op: 'grade', style: named.style };
  return COLOR.test(t) && CHANGE.test(t) ? { op: 'grade', style: 'cinematic' } : null;
}

function mineFade(t: string): EditAsk | null {
  if (!FADE.test(t) && !FADE_IN.test(t) && !FADE_OUT.test(t)) return null;
  const len = Math.min(10, firstNum(FADE_LEN.exec(t)) ?? 1);
  const i = FADE_IN.test(t), o = FADE_OUT.test(t);
  return { op: 'fade', inSec: i || !o ? len : 0, outSec: o || !i ? len : 0 };
}

function mineVolume(t: string): EditAsk | null {
  if (MUTE.test(t)) return { op: 'mute' };
  const louder = LOUDER.test(t), quieter = QUIETER.test(t);
  if (louder === quieter) return null;
  const db = DB.exec(t);
  const size = db ? Math.abs(n(db[1]!)) : 6;
  return { op: 'volume', db: louder ? size : -size };
}

const ASK_KEYS: Readonly<Record<EditAsk['op'], Readonly<Record<string, 'num' | 'str'>>>> = {
  trim: { fromSec: 'num', toSec: 'num', lastSec: 'num', cutEndSec: 'num' },
  speed: { factor: 'num' },
  aspect: { to: 'str', fit: 'str' },
  grade: { style: 'str' },
  fade: { inSec: 'num', outSec: 'num' },
  volume: { db: 'num' },
  mute: {},
  caption: { text: 'str' },
  thumbnail: { atSec: 'num' },
};

/**
 * One ask as a model's tool call or a run step sends it, rebuilt from its known fields only: the op, and each field the
 * op takes with the right type (a finite number, or a short string). Null for anything else. Ranges, enums and what goes
 * with what are ./editPlan resolveEdits' to check against the file at the quote.
 */
export function editAskOf(x: unknown): EditAsk | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const a = x as Record<string, unknown>;
  const keys = typeof a.op === 'string' && Object.prototype.hasOwnProperty.call(ASK_KEYS, a.op) ? ASK_KEYS[a.op as EditAsk['op']] : null;
  if (!keys) return null;
  const out: Record<string, unknown> = { op: a.op };
  for (const [k, v] of Object.entries(a)) {
    if (k === 'op' || v === undefined) continue;
    const type = keys[k];
    if (!type) return null;
    if (type === 'num' ? !(typeof v === 'number' && Number.isFinite(v)) : !(typeof v === 'string' && v.length <= 200)) return null;
    out[k] = v;
  }
  return out as EditAsk;
}

/** Every edit the message asks for, in the words' own terms (unresolved against any file). */
export function mineEdits(text: unknown): MinedEdits {
  const t = typeof text === 'string' ? text.slice(0, 2000) : '';
  const out: MinedEdits = { edits: [], missing: [], unsupported: [] };
  if (!t.trim()) return out;

  const thumb = THUMB.test(t);
  if (thumb) {
    const at = timeOfAlternatives(THUMB_AT.exec(t));
    out.edits.push(at === undefined ? { op: 'thumbnail' } : { op: 'thumbnail', atSec: at });
  } else {
    const trim = mineTrim(t);
    if (trim.ask) out.edits.push(trim.ask);
    if (trim.cutMiddle) out.unsupported.push('cut_middle');
    const speed = mineSpeed(t);
    if (speed) out.edits.push(speed);
  }
  const aspect = mineAspect(t);
  if (aspect) out.edits.push(aspect);
  const grade = mineGrade(t);
  if (grade) out.edits.push(grade);
  if (!thumb) {
    const fade = mineFade(t);
    if (fade) out.edits.push(fade);
    const volume = mineVolume(t);
    if (volume) out.edits.push(volume);
  }
  if (CAPTION.test(t)) {
    const words = extractOverlayText(t);
    if (words) out.edits.push({ op: 'caption', text: words });
    else out.missing.push('caption_text');
  }
  return out;
}

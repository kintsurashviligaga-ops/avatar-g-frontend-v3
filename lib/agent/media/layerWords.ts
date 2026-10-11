/**
 * lib/agent/media/layerWords.ts — Media Studio v2.1 in words, ka · en · ru: text, a CTA, a logo, a mask and caption
 * tracks put on a video or a picture, and changes to what Agent G put there before (move, resize, restyle, re-time,
 * remove), as the `layers` / `captions` asks ./editPlan resolves. Pure, no network. ./editWords merges these with the
 * other edits; the server resolves them against the file and the card shows the plan before anyone presses Start.
 *
 * The words to be DRAWN are only ever taken from quotes or from after a colon — never invented, never re-cased — and
 * they are taken out of the message before anything else in it is read as a command („აქ დააწერე: სიჩქარე და
 * ხარისხი" draws those words; it does not speed the video up). Text removal and text addition are separate asks.
 *
 * What the words ask for and this edit cannot do is said, not guessed: captions of what is SPOKEN need a transcription
 * (a paid call, the owner's decision), a translation needs a model call (the same). A logo, a watermark or a text in
 * the picture itself is removed by erasing its place (./editExec turns a removal no layer of ours answers into
 * ./editPlan `erase`); a person, an object or the background is not a fixed place: AI inpainting, a paid call, said so.
 *
 * ⚠️ NO `\b` (ASCII-only; it never matches next to a Georgian or Cyrillic letter). Token edges are Unicode lookarounds.
 */
import { cardinalOf } from './sourceSelect';
import {
  parseTimedLines, type Anchor, type CaptionCue, type CaptionDelivery, type LayerAsk, type LayerChange, type LayerTarget,
  type MotionIn, type TextLayerAsk, type TextRole, type TextStyle, type TimeAsk,
} from './layers';

const B0 = '(?<![\\p{L}\\p{N}])';
const B1 = '(?![\\p{L}\\p{N}])';

export interface LayersEditAsk {
  op: 'layers';
  add?: LayerAsk[];
  change?: LayerChange[];
  remove?: LayerTarget[];
}
export interface CaptionsEditAsk {
  op: 'captions';
  /** Absent: the track the earlier result already has (a revision: „with and without captions"). */
  track?: { lang: 'ka' | 'en' | 'ru' | 'und'; source: 'typed' | 'file'; cues: CaptionCue[]; style?: TextStyle; karaoke?: boolean };
  deliver?: CaptionDelivery;
  /** The captions taken off (a revision: „without captions"). */
  off?: true;
}
export type CompositionAsk = LayersEditAsk | CaptionsEditAsk;

export type CompositionMissing = 'caption_text' | 'cta_text' | 'logo_file';
export type CompositionUnsupported = 'speech_captions' | 'translate_captions' | 'remove_object';

export interface MinedComposition {
  /** The message asks for something of this kind at all (text, logo, mask, captions, a change to them). */
  hit: boolean;
  asks: CompositionAsk[];
  missing: CompositionMissing[];
  unsupported: CompositionUnsupported[];
  /** An image layer asks for the attached picture: its ref is LOGO_REF until the caller puts the uploaded file's in. */
  logo: boolean;
  /** A time phrase („in the last 3 s") was the layer's, not a trim. */
  timeUsed: boolean;
  /** The message without the words to be drawn and the caption lines (what the other edits may still read). */
  rest: string;
}

/** The placeholder ref of the attached picture in an image layer ask. */
export const LOGO_REF = '@attachment';

// ── the words ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a text layer is called (a caption line with no times is one too: „Add a caption "Summer sale""). */
const TEXT_NOUN = /ტექსტ|წარწერ|სათაურ|სლოგან|ფრაზ|წერილ|ქე[ფბპ]შენ|სუბტიტრ|text|title|headline|slogan|lettering|caption|subtitle|words?(?![\p{L}])|текст|надпис|подпис|заголов|слоган|фраз|субтитр/iu;
/** Writing ON something („დააწერე", "put", "overlay"), not writing a text („დაწერე ტექსტი ბიზნესისთვის" is the chat's). */
const PUT = /დააწერ|წააწერ|მიაწერ|დაადე|დაადო|ჩასვ|ჩაამატ|დაამატ|დაურთ|გამოაჩინ|ჩაწერ|put|add|overlay|place|insert|stamp|burn|write\s+on|напиши\s+на|добав|налож|встав|размест|поставь|нанеси/iu;
const CTA = new RegExp(`${B0}(?:cta|ქოლ\\s*-?\\s*თუ\\s*-?\\s*ექშენ\\p{L}*|მოწოდებ\\p{L}*|call\\s*-?\\s*to\\s*-?\\s*action|призыв\\p{L}*)${B1}`, 'iu');
/** A plain „write" next to words in quotes („write "Summer" at the bottom", «напиши «Лето»»): those words are drawn. */
const WRITE_VERB = /(?<![\p{L}])(?:write|type|напиши|напишите|написать)(?![\p{L}])/iu;
const LOGO = /ლოგო|ლოგოტიპ|სტიკერ|ემბლემ|წყლის\s+ნიშ|ვოტერმარკ|უოთერმარკ|logo|sticker|emblem|watermark|логотип|лого(?![\p{L}])|стикер|эмблем|водян\p{L}*\s+знак|вотермарк/iu;
const MASK_BLUR = /დაბლარ|ბლარ|გაბუნდოვ|დაფარ|blur|размой|размыть|размытие|замаж/iu;
const MASK_MOSAIC = /პიქსელ|მოზაიკ|pixelat|mosaic|пиксел|мозаик/iu;
const CAPTIONS = /ქე[ფბპ]შენ|სუბტიტრ|ტიტრ|caption|subtitle|субтитр|титр/iu;
const CAPTIONS_BOTH = /(?:ქეფშენ|სუბტიტრ)\p{L}*\s+და\s+(?:ქეფშენ|სუბტიტრ)\p{L}*\s+გარეშე|with\s+and\s+without\s+(?:the\s+)?(?:captions|subtitles)|(?:captions|subtitles)\s+and\s+without|с\s+субтитрами\s+и\s+без/iu;
const CAPTIONS_OFF = /(?:ქეფშენ|სუბტიტრ)\p{L}*\s+(?:გარეშე|მოაშორ|მოხსენ|წაშალ)|without\s+(?:the\s+)?(?:captions|subtitles)|(?:remove|delete)\s+(?:the\s+)?(?:captions|subtitles)|без\s+субтитр|(?:убер|удали)\p{L}*\s+субтитр/iu;
const CAPTIONS_FILE = /srt|vtt|ფაილად|(?:as\s+a\s+)?file\s+only|только\s+файл/iu;
const TRANSLATE = /თარგმნ|გადათარგმნ|ინგლისურად|რუსულად|translat|in\s+english|in\s+russian|in\s+georgian|перевед|перевод|по-английски|по-русски/iu;
const KARAOKE = /კარაოკე|karaoke|караоке/iu;

const REMOVE = /მოხსენ|მოაშორ|მოუშორ|წაშალ|ამოიღ|ამოაგდ|remove|delete|take\s+(?:off|away|out)|get\s+rid|убер|удали|сними/iu;
const KEEP = /შეინარჩუნ|დატოვ|ხელი\s+არ\s+ახლო|keep|leave|preserve|оставь|сохрани|не\s+трогай/iu;
const MOVE = /გადაიტან|გადაწი|გადასვ|გადაანაცვლ|move|shift|put\s+it|перемест|сдвин|перенес/iu;
const SMALLER = /შეამცირ|დააპატარავ|პატარა|smaller|shrink|reduce|меньше|уменьш/iu;
const BIGGER = /გაზარდ|გაადიდ|უფრო\s+დიდ|bigger|larger|enlarge|increase|больше|увелич/iu;
const REWORD = /შეცვალ|ჩაანაცვლ|replace|change\s+(?:the\s+)?(?:text|words|title)\s+to|замени|поменяй/iu;
const ALL = /ყველა|მთელი|all|every|весь|все|всю/iu;
/** Something written in the picture („ზემოთ რაღაც წერია, მოაშორე"): a text to erase, though no text noun is said. */
const WRITTEN = /წერია|დაწერილ|написан|написано|is\s+written|written\s+(?:on|in|at)/iu;
/**
 * A person, an object or the background taken out of the picture: not a fixed place but a thing that moves or fills it,
 * AI inpainting or segmentation (a paid provider call), not something ffmpeg can fill in.
 */
const OBJECT = /ადამიან|პიროვნ|კაცი|კაცს|ქალბატონ|ბავშვ|მანქან|საგან|ობიექტ|ცხოველ|ძაღლ|ფონი|ფონს|ფონიდან|(?<![\p{L}])(?:person|people|man|woman|guy|girl|kid|object|car|thing|animal|dog|cat|background)(?![\p{L}])|человек|люд\p{L}*|мужчин|женщин|ребён|ребен|машин|предмет|объект|животн|собак|кошк|(?<![\p{L}])фон(?![\p{L}])/iu;
/** Sound words: „ფონის მუსიკა მოაშორე" and "remove the background noise" are the sound's, not the picture's. */
const SOUND = /მუსიკ|ხმ|სიმღერ|შიშინ|music|sound|audio|song|noise|hiss|(?<!\p{L})hum(?!\p{L})|музык|звук|песн|(?<!\p{L})шум|шипени/iu;

const STYLE_WORDS: ReadonlyArray<{ style: TextStyle; re: RegExp }> = [
  { style: 'premium', re: /პრემიუმ|ელეგანტ|ძვირ|premium|elegant|luxury|luxurious|премиум|элегант|роскош/iu },
  { style: 'bold', re: /მსხვილ|თამამ|bold|punchy|жирн|смел/iu },
  { style: 'brand', re: /ბრენდ|brand|бренд/iu },
  { style: 'cinematic', re: /კინემატოგრაფ|კინოსავით|ლამაზ|cinematic|filmic|beautiful|красив|кинематограф|киношн/iu },
  { style: 'minimal', re: /მინიმალ|მარტივ|სუფთა|minimal|simple|clean|минимал|прост|чист/iu },
];

const MOTION_WORDS: ReadonlyArray<{ motion: MotionIn; re: RegExp }> = [
  { motion: 'typewriter', re: /ასო-ასო|ასო\s+ასო|საბეჭდ|typewriter|letter\s+by\s+letter|печатн|по\s+букв/iu },
  { motion: 'words', re: /სიტყვა-სიტყვა|სიტყვა\s+სიტყვა|სიტყვებ\p{L}*\s+(?:ბიტ|რიტმ)|word\s+by\s+word|words?\s+(?:on|to)\s+the\s+beat|по\s+слов|слова\s+(?:в\s+ритм|на\s+бит)/iu },
  { motion: 'slide-left', re: /გვერდიდან|მარჯვნიდან|slide\s+(?:in\s+)?(?:from\s+the\s+)?(?:side|right|left)|выезж\p{L}*\s+сбоку/iu },
  { motion: 'slide-up', re: /ქვემოდან|ამოცურ|slide\s+(?:in\s+)?(?:up|from\s+(?:the\s+)?bottom)|slides?\s+in|выезж|снизу\s+вверх/iu },
  { motion: 'scale', re: /გადიდებით|ზუმ|scale\s+in|zoom\s+in|pop|увеличени|зум/iu },
  { motion: 'fade', re: /ფეიდ|ნელ-ნელა|fade|плавн/iu },
];
const ANIMATED = /ანიმაცი|ანიმირებ|მოძრავ|მოძრაობ|მოუშენ|მოუშნ|მოშენ|animat|motion|moving|анимац|анимир|движущ/iu;
const BEATS = /ბიტ|რიტმ|beat|rhythm|бит(?![\p{L}])|битам|ритм/iu;
const WORDS_NOUN = /სიტყვ|words|слов/iu;

const PLACES: ReadonlyArray<{ h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle' | 'bottom'; re: RegExp }> = [
  { v: 'top', re: /ზედა|ზემოთ|ზევით|ზემო|თავში|top|upper|сверху|вверх|верхн/iu },
  { v: 'bottom', re: /ქვედა|ქვემოთ|ძირში|bottom|lower|снизу|вниз|нижн/iu },
  { h: 'left', re: /მარცხ|left|слева|влево|лев/iu },
  { h: 'right', re: /მარჯვ|right|справа|вправо|прав(?:ый|ом|ую|ой|ее)/iu },
  { h: 'center', v: 'middle', re: /შუაში|შუა(?![\p{L}])|ცენტრ|center|centre|middle|центр|посередин|середин/iu },
];

const ROLE_WORDS: ReadonlyArray<{ role: TextRole; re: RegExp }> = [
  { role: 'title', re: /სათაურ|title|headline|заголов/iu },
  { role: 'price', re: /ფას|price|цен[аеуы]/iu },
  { role: 'lower-third', re: /lower\s*-?\s*third|ქვედა\s+მესამედ|нижн\p{L}*\s+треть/iu },
];

/** A number as written or as a word („3", „სამ", "three", «три»). */
const NUM_OR_WORD = '(\\d{1,3}(?:[.,]\\d{1,2})?|[\\p{L}]{2,12})';
const SEC = `(?:წამ\\p{L}*|წმ\\.?|s|sec|secs|seconds?|сек\\p{L}*)${B1}`;
const LAST_SEC = new RegExp(`${B0}(?:ბოლო|last|final|последни\\p{L}*|последн\\p{L}*)\\s+${NUM_OR_WORD}\\s*-?\\s*${SEC}`, 'iu');
const FIRST_SEC = new RegExp(`${B0}(?:პირველ\\p{L}*|first|opening|первы\\p{L}*)\\s+${NUM_OR_WORD}\\s*-?\\s*${SEC}`, 'iu');
const RANGE_SEC = new RegExp(`${B0}(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*(?:-?\\s*(?:დან|წამიდან))\\s+(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*-?\\s*(?:მდე|წამამდე)|${B0}(?:from|between)\\s+(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*(?:s|sec|seconds?)?\\s*(?:to|and|until|-|–)\\s*(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*${SEC}|${B0}(?:с|от)\\s+(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*(?:-?\\s*(?:й|ой))?\\s*(?:сек\\p{L}*)?\\s*(?:до|по)\\s+(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*${SEC}`, 'iu');

const numOf = (tok: string): number | null => {
  if (/^\d/.test(tok)) return parseFloat(tok.replace(',', '.'));
  return cardinalOf(tok.toLowerCase());
};

/** The time window the words give a layer („in the last 3 s", „0:02-დან 5-მდე"), or none. */
function timeOf(t: string): TimeAsk | null {
  const last = LAST_SEC.exec(t);
  if (last) { const v = numOf(last[1]!); if (v && v > 0) return { lastSec: v }; }
  const first = FIRST_SEC.exec(t);
  if (first) { const v = numOf(first[1]!); if (v && v > 0) return { firstSec: v }; }
  const r = RANGE_SEC.exec(t);
  if (r) {
    const [a, b] = [r[1] ?? r[3] ?? r[5], r[2] ?? r[4] ?? r[6]].map((x) => parseFloat(String(x).replace(',', '.')));
    if (Number.isFinite(a) && Number.isFinite(b) && b! > a!) return { fromSec: a, toSec: b };
  }
  return null;
}

function placeOf(t: string): { h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle' | 'bottom' } {
  const out: { h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle' | 'bottom' } = {};
  for (const p of PLACES) {
    if (!p.re.test(t)) continue;
    if (p.h && !out.h) out.h = p.h;
    if (p.v && !out.v) out.v = p.v;
  }
  return out;
}

function anchorFrom(p: { h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle' | 'bottom' }): Anchor | undefined {
  if (!p.h && !p.v) return undefined;
  const v = p.v ?? 'middle', h = p.h ?? 'center';
  if (v === 'middle') return h === 'center' ? 'center' : h;
  return h === 'center' ? v : (`${v}-${h}` as Anchor);
}

const whereOf = (p: { h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle' | 'bottom' }): LayerTarget['where'] =>
  p.v === 'top' || p.v === 'bottom' ? p.v : p.h === 'left' || p.h === 'right' ? p.h : p.h === 'center' ? 'center' : undefined;

const styleOf = (t: string): TextStyle | undefined => STYLE_WORDS.find((s) => s.re.test(t))?.style;

/**
 * The words to be drawn: in quotes (exactly as typed), or after a colon (one closing full stop dropped: it ends the
 * sentence, not the text). Null when the message carries none.
 */
export function drawnWordsOf(text: string): { words: string; span: [number, number] } | null {
  const q = /["“”«»„]([^"“”«»„]{1,200})["“”«»„]/u.exec(text);
  if (q && q[1]!.trim()) return { words: q[1]!.trim(), span: [q.index, q.index + q[0].length] };
  // A colon between two digits is a time or a ratio („9:16", „0:02"), not the start of the words.
  const c = /(?:(?<!\d)[:：]|[:：](?!\d))\s*(.+)$/su.exec(text);
  if (c && c.index > 0 && c[1]!.trim()) {
    const words = c[1]!.trim().replace(/(?<![.])[.。]$/u, '').trim();
    if (words) return { words, span: [c.index, text.length] };
  }
  return null;
}

// ── words written without quotes ────────────────────────────────────────────────────────────────────────────────────

/**
 * Writing words ON the picture, the words right after the verb, unquoted: „ლამაზად დააწერე მოუშენით myavatar.ge🚀",
 * „ბოლოს უნდა დაიწეროს გადმოდი საიტზე", "a text that says Summer sale", «с надписью Привет». Not „დაწერე" (write me a
 * text: the chat's job) and not a bare "write" / «напиши» (a song, a post): only the forms that mean ON the video.
 */
const WRITE_ON = new RegExp([
  `${B0}(?:დააწერ|წააწერ|მიაწერ|დაიწერ|დაეწერ|ეწერ)\\p{L}*`,
  `${B0}(?:text|caption|title|words?|line|sign)\\s+(?:that\\s+|which\\s+)?(?:says|reads|saying|reading)${B1}`,
  `${B0}with\\s+the\\s+words${B1}`,
  `${B0}(?:с\\s+надписью|надпись(?:ю)?|напиши\\s+на\\s+(?:нём|видео|экране))${B1}`,
].join('|'), 'giu');

/** Words between the verb and the text that are about how or where, never part of it („ლამაზად", „მოუშენით", „ბოლოს"). */
const LEAD_FILLER = new RegExp(`^(?:${[
  'ლამაზ\\p{L}*', 'მოუშენ\\p{L}*', 'მოუშნ\\p{L}*', 'მოშენ\\p{L}*', 'მოძრაობ\\p{L}*', 'ანიმაცი\\p{L}*', 'ანიმირებ\\p{L}*',
  'ქართულ\\p{L}*', 'ინგლისურ\\p{L}*', 'რუსულ\\p{L}*', 'ტექსტ\\p{L}*', 'წარწერ\\p{L}*', 'სიტყვ\\p{L}*', 'ქე[ფბპ]შენ\\p{L}*',
  'უნდა', 'ვიდეოზე', 'ეკრანზე', 'კადრზე', 'ზედ', 'აქ', 'ასე', 'ეს', 'რომ', 'შემდეგი', 'ბოლოს', 'ბოლოში', 'დასასრულს',
  'დასაწყისში', 'თავში', 'ქვემოთ', 'ზემოთ', 'შუაში', 'ცენტრში', 'მარცხნივ', 'მარჯვნივ', 'დიდად', 'მსხვილად',
  '(?:ბოლო|პირველ\\p{L}*)\\s+\\S{1,12}\\s+წამ\\p{L}*',
  'beautifully', 'nicely', 'animated', 'with\\s+motion', 'in\\s+(?:georgian|english|russian)', 'on\\s+(?:it|the\\s+video|top)',
  'at\\s+the\\s+(?:end|start|beginning|bottom|top)',
  'красиво', 'с\\s+анимацией', 'по-грузински', 'по-английски', 'по-русски', 'на\\s+видео', 'в\\s+конце', 'в\\s+начале', 'внизу', 'вверху',
].join('|')})(?:\\s+|$)`, 'iu');
/** The same kind of words after the text (where, when, how), never the text's own last words („მოდი აქ" keeps „აქ"). */
const TRAIL_FILLER = new RegExp(`(?:^|\\s+)(?:${[
  'ბოლოს', 'ბოლოში', 'დასასრულს', 'დასაწყისში', 'ქვემოთ', 'ზემოთ', 'შუაში', 'ცენტრში', 'მარცხნივ', 'მარჯვნივ',
  'ვიდეოზე', 'ეკრანზე', 'კადრზე', 'ლამაზად', 'მოუშენით', 'მოუშნით', 'მოშენით', 'მოძრაობით', 'ანიმაციით', 'ქართულად', 'ინგლისურად', 'რუსულად',
  '(?:ბოლო|პირველ\\p{L}*)\\s+\\S{1,12}\\s+წამ\\p{L}*',
  'at\\s+the\\s+(?:end|start|beginning|bottom|top)', 'on\\s+(?:it|the\\s+video|top)', 'beautifully', 'with\\s+motion', 'in\\s+(?:georgian|english|russian)',
  'в\\s+конце', 'в\\s+начале', 'внизу', 'вверху', 'на\\s+видео', 'красиво', 'с\\s+анимацией',
].join('|')})$`, 'iu');

/** Something else to do in the clause after „და" / "and" / «и»: the words end there („myavatar.ge🚀 და ბოლოს დაიწეროს …"). */
const COMMAND = new RegExp([
  'დააწერ|წააწერ|მიაწერ|დაიწერ|დაეწერ|ეწერ|დაწერ|დაადე|დაადო|ჩასვ|ჩაამატ|დაამატ|მოხსენ|მოაშორ|წაშალ|გადაიტან|ააჩქარ|აჩქარ',
  'შეანელ|ჩააქრ|გათიშ|გახად|გააკეთ|გაუკეთ|დაამონტაჟ|მუსიკ|ლოგო|ოვერლე|ქე[ფბპ]შენ|ბოლოს|ბოლოში|დასასრულს|დასაწყისში',
  '\\badd\\b|\\bput\\b|\\bmake\\b|\\bremove\\b|\\bspeed|\\bslow|\\bfade|\\bcut\\b|\\bmusic|\\blogo|\\boverlay|\\bblur|\\bwrite\\b|at\\s+the\\s+(?:end|start|beginning)',
  'добав|сделай|убер|удали|ускор|замедл|музык|логотип|оверле|размой|напиши|надпис|в\\s+конце|в\\s+начале',
].join('|'), 'iu');

/** At the end of the video („ბოლოს", "at the end"): the end text, the last seconds. At its start: the first ones. */
const END_WORDS = /ბოლოს|ბოლოში|დასასრულს|ბოლოსკენ|at\s+the\s+end|in\s+the\s+end|в\s+конце/iu;
const START_WORDS = /დასაწყისში|თავიდანვე|at\s+the\s+(?:start|beginning)|в\s+начале/iu;
/** The end text's seconds when the words give none. */
export const END_TEXT_SEC = 3;
const MAX_UNQUOTED_WORDS = 10;
const MAX_UNQUOTED_CHARS = 80;

/** Where a clause starts, looking back from `at`: after „,", „;", a line break, a sentence's end, or „ და " / " and " / « и ». */
function clauseStart(t: string, at: number, floor: number): number {
  const head = t.slice(floor, at);
  let best = 0;
  for (const m of head.matchAll(/[,;\n]|[.!?。](?=\s)|\s(?:და|and|и)\s/giu)) best = m.index + m[0].length;
  return floor + best;
}

/** Where the words that start at `from` end: a hard break, or „ და " before something else to do. */
function wordsEnd(t: string, from: number): number {
  const re = /[,;\n"“”«»„]|[.。](?=\s|$)|[!?](?=\s+\p{L})|\s(?:და|and|и)\s/giu;
  re.lastIndex = from;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const ch = m[0];
    if (/^[!?]$/.test(ch)) return m.index + 1; // the exclamation stays the text's
    if (/\s/.test(ch[0]!)) {
      // „ და " ends the words only when the rest of that clause asks for something.
      const after = m.index + ch.length;
      const hard = /[,;\n]|[.。](?=\s|$)/u.exec(t.slice(after));
      const clause = t.slice(after, hard ? after + hard.index : t.length);
      if (!COMMAND.test(clause)) continue;
    }
    return m.index;
  }
  return t.length;
}

export interface DrawnItem {
  /** The words to draw, exactly as typed. */
  words: string;
  /** Where they are in the message (the quotes included for quoted words). */
  span: [number, number];
  /** The clause that is about them (where, when, how): the message from the clause's start to the words' end. */
  ctx: [number, number];
}

/**
 * Every text the message asks to draw, in order: each quoted text that a write or put word is about, and each text written
 * unquoted after a write-ON verb. Null when the message has a colon text (that one takes the rest of the message, as
 * before) or nothing to draw at all.
 */
export function drawnItemsOf(text: string): DrawnItem[] | null {
  const single = drawnWordsOf(text);
  const quoted = /["“”«»„]/u.test(text);
  if (single && !quoted) return null;
  const items: DrawnItem[] = [];
  // Quoted texts, each with its clause.
  for (const m of text.matchAll(/["“”«»„]([^"“”«»„]{1,200})["“”«»„]/gu)) {
    const words = m[1]!.trim();
    if (!words) continue;
    const span: [number, number] = [m.index, m.index + m[0].length];
    const start = clauseStart(text, span[0], 0);
    const end = wordsEnd(text, span[1]);
    const around = `${text.slice(start, span[0])} ${text.slice(span[1], end)}`;
    // A text is asked for around it, or it continues a list of them („„A" ზემოთ და „B" ქვემოთ").
    if (!(items.length || PUT.test(around) || TEXT_NOUN.test(around) || CTA.test(around) || WRITE_VERB.test(around) || new RegExp(WRITE_ON.source, 'iu').test(around))) continue;
    items.push({ words, span, ctx: [start, Math.max(end, span[1])] });
  }
  // Unquoted texts after a write-ON verb.
  WRITE_ON.lastIndex = 0;
  for (const m of text.matchAll(WRITE_ON)) {
    const verbEnd = m.index + m[0].length;
    if (items.some((it) => verbEnd > it.span[0] && verbEnd <= it.span[1])) continue;
    let from = verbEnd;
    const tail = text.slice(from);
    // A quote or a colon right after the verb: those words are read as quoted / colon words.
    if (/^\s*["“”«»„:：]/u.test(tail)) continue;
    // Skip what is about how or where, before the words.
    for (let guard = 0; guard < 8; guard += 1) {
      const lead = /^\s+/u.exec(text.slice(from));
      if (lead) from += lead[0].length;
      const f = LEAD_FILLER.exec(text.slice(from));
      if (!f || !f[0]) break;
      from += f[0].length;
    }
    const end = wordsEnd(text, from);
    let words = text.slice(from, end).trim();
    for (let guard = 0; guard < 6; guard += 1) {
      const tr = TRAIL_FILLER.exec(words);
      if (!tr) break;
      words = words.slice(0, tr.index).trim();
    }
    words = words.replace(/[\s,;:–—-]+$/u, '').trim();
    if (!words || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(words)) continue;
    // A sentence, not a text to draw („დააწერე რომ ეს პროდუქტი …" at length): left to the chat.
    if (words.split(/\s+/).length > MAX_UNQUOTED_WORDS || words.length > MAX_UNQUOTED_CHARS) continue;
    const at = text.indexOf(words, from);
    const span: [number, number] = [at, at + words.length];
    const floor = items.filter((it) => it.span[1] <= m.index).reduce((a, it) => Math.max(a, it.span[1]), 0);
    items.push({ words, span, ctx: [clauseStart(text, m.index, floor), Math.max(end, span[1])] });
  }
  items.sort((a, b) => a.span[0] - b.span[0]);
  return items.length ? items : null;
}

/** The language of caption lines by their letters. */
function langOf(cues: readonly CaptionCue[]): 'ka' | 'en' | 'ru' | 'und' {
  const all = cues.map((c) => c.text).join(' ');
  if (/[Ⴀ-ჿᲐ-Ჿ]/u.test(all)) return 'ka';
  if (/[Ѐ-ӿ]/u.test(all)) return 'ru';
  if (/[A-Za-z]/.test(all)) return 'en';
  return 'und';
}

/**
 * Clauses („ზედა ლოგო მოხსენი, პაკეტის ლოგო შეინარჩუნე"): each says one thing about one thing. A clause that names
 * nothing („… და ზომა შეამცირე") is about the thing the clause before it named, so it stays with that one.
 */
function clausesOf(t: string): string[] {
  const parts = t.split(/[,;]\s+|\s+(?:და|and|и)\s+(?=\p{L}+\s+(?:\p{L}+\s+)?(?:მოხსენ|მოაშორ|წაშალ|ამოიღ|შეინარჩუნ|დატოვ|გადაიტან|შეამცირ|გაზარდ|keep|remove|delete|move|make|оставь|убер|удали|перемест))/u)
    .map((s) => s.trim()).filter(Boolean);
  const names = (s: string) => LOGO.test(s) || TEXT_NOUN.test(s) || MASK_BLUR.test(s) || MASK_MOSAIC.test(s) || WORDS_NOUN.test(s);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && !names(p)) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

// ── reading a message ───────────────────────────────────────────────────────────────────────────────────────────────

/** Everything in a message about text, logos, masks and captions on the file, in the words' own terms. */
export function mineComposition(text: unknown): MinedComposition {
  const raw = typeof text === 'string' ? text.slice(0, 20_000) : '';
  const out: MinedComposition = { hit: false, asks: [], missing: [], unsupported: [], logo: false, timeUsed: false, rest: raw };
  if (!raw.trim()) return out;

  // ── caption tracks: lines typed or pasted, both copies, none, as files ──────────────────────────────────────────
  if (CAPTIONS.test(raw) || /-->/.test(raw)) {
    const cuesFrom = parseTimedLines(raw).length ? raw : (drawnWordsOf(raw)?.words ?? '');
    const cues = parseTimedLines(cuesFrom);
    const srt = /-->/.test(raw);
    const head = cues.length ? raw.slice(0, Math.max(0, raw.search(/\d{1,2}:\d{2}|\d+\s*(?:-|–)\s*\d/u))) : raw;
    if (CAPTIONS.test(raw) || srt) {
      out.hit = true;
      const deliver: CaptionDelivery | undefined = CAPTIONS_BOTH.test(head) ? 'both' : CAPTIONS_FILE.test(head) && !PUT.test(head) ? 'file' : undefined;
      const style = styleOf(head);
      if (cues.length) {
        out.asks.push({
          op: 'captions',
          track: { lang: langOf(cues), source: srt ? 'file' : 'typed', cues, ...(style ? { style } : {}), ...(KARAOKE.test(head) ? { karaoke: true } : {}) },
          ...(deliver ? { deliver } : {}),
        });
        out.rest = head;
      } else if (drawnItemsOf(raw)?.some((it) => !/["“”«»„]/u.test(raw.slice(it.span[0], it.span[0] + 1)))) {
        // „გაუკეთე ქეფშენი და დააწერე myavatar.ge🚀": the caption is the words written out, a text layer read below.
        out.hit = false;
      } else if (TRANSLATE.test(raw)) {
        out.unsupported.push('translate_captions');
      } else if (deliver === 'both') {
        out.asks.push({ op: 'captions', deliver: 'both' });
      } else if (CAPTIONS_OFF.test(raw)) {
        out.asks.push({ op: 'captions', off: true });
        // „… და ზედა ლოგო მოაშორე": the other clauses' removals and changes are read too, not dropped.
        const others = clausesOf(raw).filter((c) => !CAPTIONS.test(c));
        if (others.length) {
          const layers: LayersEditAsk = { op: 'layers' };
          clauseAsks(others, null, null, layers, out, false);
          if (layers.add || layers.change || layers.remove) out.asks.push(layers);
        }
      } else if (drawnWordsOf(raw)) {
        // One caption line with no times („Add a caption "Summer sale""): a text layer, read below.
        out.hit = false;
      } else {
        // Captions of what is said: a transcription, not a drawing of typed words.
        out.unsupported.push('speech_captions');
      }
      if (out.hit) return out;
    }
  }

  // ── several texts, or a text written without quotes: each from its own clause ──────────────────────────────────
  const items = drawnItemsOf(raw);
  const unquoted = items?.some((it) => !/["“”«»„]/u.test(raw.slice(it.span[0], it.span[0] + 1))) ?? false;
  // A logo or a mask beside one quoted text („add my logo top right and write "Summer" at the bottom"): each from its own
  // clause too. Read as one clause, the logo took it and the text was lost.
  const others = items?.length === 1 && (LOGO.test(raw) || MASK_BLUR.test(raw) || MASK_MOSAIC.test(raw));
  if (items && (unquoted || items.length >= 2 || others)) return composeItems(raw, items, out);

  const drawn = drawnWordsOf(raw);
  const instr = drawn ? `${raw.slice(0, drawn.span[0])} ${raw.slice(drawn.span[1])}`.trim() : raw;
  out.rest = instr;
  const time = timeOf(instr);

  // ── a CTA: always its own words ────────────────────────────────────────────────────────────────────────────────
  if (CTA.test(instr)) {
    out.hit = true;
    if (!drawn) { out.missing.push('cta_text'); return out; }
    const motion = MOTION_WORDS.find((m) => m.re.test(instr))?.motion;
    const anchor = anchorFrom(placeOf(instr));
    const style = styleOf(instr);
    out.asks.push({
      op: 'layers',
      add: [{ kind: 'text', role: 'cta', text: drawn.words, ...(anchor ? { anchor } : {}), ...(style ? { style } : {}), ...(motion ? { motionIn: motion } : {}), ...(time ?? {}) }],
    });
    out.timeUsed = Boolean(time);
    return out;
  }

  // ── each clause about a logo, a text or a mask ─────────────────────────────────────────────────────────────────
  const layers: LayersEditAsk = { op: 'layers' };
  clauseAsks(drawn ? [instr] : clausesOf(instr), drawn, time, layers, out, true);
  if (layers.add || layers.change || layers.remove) out.asks.push(layers);
  return out;
}

/**
 * The clauses' logos, masks, text changes and removals into `layers`; with `drawn`, the drawn words added as a text.
 * `askWords`: a clause that asks for a text and gives no words says so (off when the words came in other clauses).
 */
function clauseAsks(clauses: readonly string[], drawn: { words: string } | null, time: TimeAsk | null, layers: LayersEditAsk, out: MinedComposition, askWords: boolean): void {
  const push = <K extends 'add' | 'change' | 'remove'>(k: K, v: NonNullable<LayersEditAsk[K]>[number]) => {
    ((layers[k] ??= []) as unknown[]).push(v);
  };
  for (const c of clauses) {
    const place = placeOf(c);
    const anchor = anchorFrom(place);
    const ctime = timeOf(c) ?? (clauses.length === 1 ? time : null);
    if (LOGO.test(c)) {
      out.hit = true;
      if (KEEP.test(c) && !REMOVE.test(c)) continue; // „პაკეტის ლოგო შეინარჩუნე": kept as it is, by construction
      if (REMOVE.test(c)) {
        push('remove', { kind: 'image', ...(whereOf(place) ? { where: whereOf(place) } : {}), ...(anchor ? { at: anchor } : {}), ...(ctime ?? {}) });
        if (ctime) out.timeUsed = true;
        continue;
      }
      if (MOVE.test(c) || ((SMALLER.test(c) || BIGGER.test(c)) && !PUT.test(c))) {
        push('change', { target: { kind: 'image' }, ...(MOVE.test(c) && anchor ? { anchor } : {}), ...(SMALLER.test(c) ? { sizeBy: 0.8 } : BIGGER.test(c) ? { sizeBy: 1.25 } : {}), ...(ctime ?? {}) });
        continue;
      }
      if (PUT.test(c)) {
        out.logo = true;
        push('add', { kind: 'image', ref: LOGO_REF, ...(anchor ? { anchor } : {}), ...(ctime ?? {}) });
        if (ctime) out.timeUsed = true;
      }
      continue;
    }
    if (MASK_BLUR.test(c) || MASK_MOSAIC.test(c)) {
      out.hit = true;
      push('add', { kind: 'mask', mode: MASK_MOSAIC.test(c) ? 'mosaic' : 'blur', ...(anchor ? { anchor } : {}), ...(ctime ?? {}) });
      if (ctime) out.timeUsed = true;
      continue;
    }
    const aboutText = TEXT_NOUN.test(c);
    const written = !aboutText && WRITTEN.test(c);
    const beats = WORDS_NOUN.test(c) && BEATS.test(c);
    // A person, an object or the background out of the picture: said, never faked by smearing a box over it.
    if (REMOVE.test(c) && OBJECT.test(c) && !aboutText && !written && !SOUND.test(c)) {
      out.hit = true;
      if (!out.unsupported.includes('remove_object')) out.unsupported.push('remove_object');
      continue;
    }
    const style = styleOf(c);
    const motion = beats ? 'words' : MOTION_WORDS.find((m) => m.re.test(c))?.motion;
    // New words to draw: „აქ დააწერე: …", "add the title „…"" (the words come from the quotes or the colon only).
    if (drawn && (PUT.test(c) || aboutText || WRITE_VERB.test(c)) && !REWORD.test(c) && !REMOVE.test(c)) {
      out.hit = true;
      const role = ROLE_WORDS.find((r) => r.re.test(c))?.role;
      push('add', {
        kind: 'text', text: drawn.words, ...(role ? { role } : {}), ...(anchor ? { anchor } : {}), ...(style ? { style } : {}),
        ...(motion ? { motionIn: motion } : ANIMATED.test(c) ? { motionIn: 'slide-up' as const } : {}), ...(beats ? { beats: true } : {}), ...(ctime ?? {}),
      });
      if (ctime) out.timeUsed = true;
      continue;
    }
    if (written && REMOVE.test(c) && !PUT.test(c)) {
      out.hit = true;
      push('remove', { kind: 'text', ...(whereOf(place) ? { where: whereOf(place) } : {}), ...(anchor ? { at: anchor } : {}), ...(ctime ?? {}) });
      if (ctime) out.timeUsed = true;
      continue;
    }
    if (!aboutText && !beats) continue;
    if (REMOVE.test(c) && !PUT.test(c)) {
      out.hit = true;
      push('remove', { kind: 'text', ...(ALL.test(c) ? { all: true } : whereOf(place) ? { where: whereOf(place) } : {}), ...(anchor ? { at: anchor } : {}), ...(ctime ?? {}) });
      if (ctime) out.timeUsed = true;
      continue;
    }
    const change: LayerChange = {};
    if (drawn && REWORD.test(c)) change.text = drawn.words;
    if (style && !PUT.test(c.replace(/გახადე|make|сделай/giu, ''))) change.style = style;
    else if (style) change.style = style;
    if (MOVE.test(c) && anchor) {
      if (place.h && !place.v) change.moveH = place.h;
      else if (place.v && !place.h) change.moveV = place.v;
      else change.anchor = anchor;
    }
    if (SMALLER.test(c)) change.sizeBy = 0.8;
    else if (BIGGER.test(c)) change.sizeBy = 1.25;
    if (motion) change.motionIn = motion;
    else if (ANIMATED.test(c)) change.motionIn = 'slide-up';
    if (beats) change.beats = true;
    if (ctime) { Object.assign(change, ctime); out.timeUsed = true; }
    if (!Object.keys(change).length) {
      // „Add a text" with no words: say which words.
      if (PUT.test(c) && askWords) { out.hit = true; out.missing.push('caption_text'); }
      continue;
    }
    out.hit = true;
    // A new look or motion is for every text of ours; a move, a size or new words, for the one meant (the newest).
    const every = (change.style || change.motionIn) && !change.text && !change.moveH && !change.moveV && !change.anchor && !change.sizeBy;
    push('change', { target: { kind: 'text', ...(every || ALL.test(c) ? { all: true } : whereOf(place) && !MOVE.test(c) ? { where: whereOf(place) } : {}) }, ...change });
  }
}

/**
 * Several texts, or texts written without quotes („ლამაზად დააწერე მოუშენით myavatar.ge🚀 და ბოლოს ქართულად უნდა
 * დაიწეროს გადმოდი საიტზე"): each is added with what its own clause says (where, when, look, motion). A text „at the
 * end" is the end text (a CTA, its last seconds); a text that names no time then stays until the end text begins, so the
 * two never cover each other. The rest of the message (outside those clauses) is read for logos, masks and changes.
 */
function composeItems(raw: string, items: readonly DrawnItem[], out: MinedComposition): MinedComposition {
  const layers: LayersEditAsk = { op: 'layers' };
  const adds: TextLayerAsk[] = [];
  let endSec = 0;
  for (const it of items) {
    const ctx = `${raw.slice(it.ctx[0], it.span[0])} ${raw.slice(it.span[1], it.ctx[1])}`;
    const explicit = timeOf(ctx);
    const end = !explicit && END_WORDS.test(ctx);
    const start = !explicit && !end && START_WORDS.test(ctx);
    const time: TimeAsk | null = explicit ?? (end ? { lastSec: END_TEXT_SEC } : start ? { firstSec: END_TEXT_SEC } : null);
    if (explicit) out.timeUsed = true;
    if (time?.lastSec) endSec = Math.max(endSec, time.lastSec);
    const role: TextRole | undefined = CTA.test(ctx) || end ? 'cta' : ROLE_WORDS.find((r) => r.re.test(ctx))?.role;
    const anchor = anchorFrom(placeOf(ctx));
    const style = styleOf(ctx);
    const beats = WORDS_NOUN.test(ctx) && BEATS.test(ctx);
    const motion = beats ? 'words' : MOTION_WORDS.find((m) => m.re.test(ctx))?.motion ?? (ANIMATED.test(ctx) ? 'slide-up' as const : undefined);
    adds.push({
      kind: 'text', text: it.words, ...(role ? { role } : {}), ...(anchor ? { anchor } : {}), ...(style ? { style } : {}),
      ...(motion ? { motionIn: motion } : {}), ...(beats ? { beats: true } : {}), ...(time ?? {}),
    });
  }
  // The texts with no time of their own make room for the end text.
  if (endSec > 0) {
    for (const a of adds) {
      if (a.fromSec === undefined && a.toSec === undefined && a.firstSec === undefined && a.lastSec === undefined) a.beforeLastSec = endSec;
    }
  }
  out.hit = true;
  layers.add = adds;
  // Outside the texts' clauses: logos, masks, changes (no new words there, and no „which words?" for a text asked).
  let rest = '';
  let at = 0;
  for (const it of items) { rest += `${raw.slice(at, it.ctx[0])} `; at = Math.max(at, it.ctx[1]); }
  rest += raw.slice(at);
  clauseAsks(clausesOf(rest.trim()), null, null, layers, out, false);
  out.asks.push(layers);
  // What the other edits may still read: everything but the words to be drawn.
  let kept = '';
  at = 0;
  for (const it of items) { kept += `${raw.slice(at, it.span[0])} `; at = it.span[1]; }
  out.rest = `${kept}${raw.slice(at)}`.replace(/[ \t]{2,}/g, ' ').trim();
  return out;
}

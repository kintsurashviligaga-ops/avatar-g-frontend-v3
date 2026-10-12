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
import { aspectFromPrompt, transitionAsk } from './montageAsk';
import { mineComposition, type CompositionAsk, type CompositionMissing, type CompositionUnsupported } from './layerWords';
import { MAX_CUES, type Anchor } from './layers';
import type { FrameAspect, FrameFit, GradeStyle } from '@/lib/video/editFilters';
import type { OverlayLook, ZoomWay } from './editPlan';

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
  | { op: 'aspect'; to: FrameAspect; fit: FrameFit }
  | { op: 'grade'; style: GradeStyle }
  /** The picture's own light and colour (./editPlan `adjust`): each a step from −100 to 100, sharpen and vignette 0–100. */
  | { op: 'adjust'; brightness?: number; contrast?: number; saturation?: number; warmth?: number; sharpen?: number; vignette?: number }
  | { op: 'flip'; axis?: 'horizontal' | 'vertical' }
  /** Degrees, a quarter turn at a time; −90 is a quarter turn the other way. */
  | { op: 'rotate'; deg: number }
  | { op: 'motion'; zoom?: ZoomWay; shake?: boolean; glitch?: boolean }
  | { op: 'stabilize' }
  | { op: 'denoise' }
  | { op: 'loudness' }
  | { op: 'fade'; inSec: number; outSec: number }
  | { op: 'volume'; db: number }
  | { op: 'mute' }
  /** A stored or tool-sent caption of the v2.0 kind; words in the chat now become a text layer (./layerWords). */
  | { op: 'caption'; text: string }
  /** An overlay over the whole picture: light leaks (the default) or film grain (./overlayFx). */
  | { op: 'overlay'; look?: OverlayLook }
  | { op: 'thumbnail'; atSec?: number }
  /** Places of the picture itself filled in from around them (./editPlan `erase`): a named place or exact fractions. */
  | { op: 'erase'; at?: Anchor; boxes?: Array<{ at?: Anchor; x?: number; y?: number; w?: number; h?: number; fromSec?: number; toSec?: number; firstSec?: number; lastSec?: number }> }
  /** Media Studio v2.1: text, picture and mask layers, and caption tracks (./layerWords). */
  | CompositionAsk;

export interface MinedEdits {
  edits: EditAsk[];
  /** What the words ask for but do not give: the words to draw, a CTA's words, the logo's picture. */
  missing: CompositionMissing[];
  /**
   * What the words ask for that one edit cannot do (a stretch out of the middle; captions of speech; a translation;
   * playing backwards).
   */
  unsupported: Array<'cut_middle' | 'reverse' | CompositionUnsupported>;
  /** A picture layer asks for the attached picture (its ref is ./layerWords LOGO_REF until the upload's is put in). */
  logo?: true;
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

/** A design (a poster, a banner, a post): a new frame keeps all of it, with bars, unless the words say crop. */
const DESIGN = /დიზაინ|პოსტერ|ბანერ|ფლაერ|აფიშ|design|poster|banner|flyer|дизайн|постер|баннер|флаер|афиш/iu;
const CROP = /მოჭერ|მოიჭრას|ჩამოჭერ|crop|обреж|обрез/iu;
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

// „ხმაური" (noise) is not „ხმა" (the sound): „ხმაური მოაშორე" cleans the sound, it does not silence it.
const MUTE = /უხმო|ხმის\s+გარეშე|ხმა\s+(?:მოაშორ|მოუშორ|მოხსენ|წაშალ|გათიშ|გამორთ)|(?:მოაშორ|მოუშორ|მოხსენ|წაშალ|გათიშ|გამორთ)\p{L}*\s+ხმა(?!ურ)|mute|without\s+(?:the\s+)?(?:sound|audio)|no\s+(?:sound|audio)|remove\s+(?:the\s+)?(?:sound|audio)|silent|без\s+звука|(?:убер|удали|отключ|выключ)\p{L}*\s+звук/iu;
const LOUDER = /ხმა\s+(?:აუწი|აუმატ|გაზარდ)|(?:აუწი|გაზარდ)\p{L}*\s+ხმა|ხმამაღლა|louder|turn\s+(?:it\s+)?up|volume\s+up|increase\s+(?:the\s+)?volume|boost\s+(?:the\s+)?(?:volume|sound|audio)|громче|увелич\p{L}*\s+громкост|прибав\p{L}*\s+звук/iu;
const QUIETER = /ხმა\s+(?:დაუწი|შეამცირ|დაუკელ)|(?:დაუწი|შეამცირ)\p{L}*\s+ხმა|ჩუმად|quieter|turn\s+(?:it\s+)?down|volume\s+down|lower\s+(?:the\s+)?volume|reduce\s+(?:the\s+)?volume|тише|потише|уменьш\p{L}*\s+громкост|убав\p{L}*\s+звук/iu;
const DB = new RegExp(`([+-]?\\d{1,2}(?:[.,]\\d)?)\\s*(?:dB|db|დბ|дБ|дб)${B1}`, 'u');

/**
 * An overlay as an effect over the picture („დაადე ოვერლეი", "add an overlay", «наложи оверлей»), never the verb of a
 * text („overlay the words …" is a text layer: ./layerWords).
 */
const OVERLAY = /ოვერლე\p{L}*|оверле\p{L}*|(?:an?|the|some|cool|nice|light|film)\s+overlay(?!\s+(?:the\s+)?(?:text|words?|title|caption|logo))|overlay\s+effect|light\s*-?\s*leaks?|ლაით\s*-?\s*ლიქ\p{L}*|სინათლის\s+ანარეკლ\p{L}*|световы\p{L}*\s+блик\p{L}*|film\s+grain|ფირის\s+მარცვ\p{L}*|зерн\p{L}*\s+пл[её]нк\p{L}*/iu;
const GRAIN = /grain|მარცვ|გრეინ|зерн/iu;

const THUMB = /ქავერ|თამბნეილ|მინიატიურ|ყდის\s+ფოტ|სქრინშოტ|კადრი\s+(?:ამოიღე|ამომიღე|გამიკეთე|გადაიღე)|thumbnail|cover\s+(?:image|photo|frame|picture)|poster\s+frame|still\s+frame|screenshot|freeze\s+frame|grab\s+a\s+frame|frame\s+grab|обложк|превью|миниатюр|скриншот|стоп\s*-?\s*кадр/iu;
const THUMB_AT = new RegExp(`(?:${T}\\s*-?\\s*(?:წამზე|წმ-?ზე|ზე)${B1})|(?:${B0}at\\s+(?:the\\s+)?${T}\\s*(?:${SEC})?)|(?:${B0}на\\s+${T}\\s*-?\\s*(?:й|ой|ей)?\\s*(?:${SEC})?)`, 'iu');

// ── CapCut's everyday effects (GG 2026-10-11 17:38Z: „ქაფქათს და სხვა ფუნქციებს რაც აკლია") ─────────────────────────

/** A strength said as a share: „30%-ით", "by 30 percent", «на 30%». */
const PCT = /(\d{1,3})\s*(?:%|პროცენტ\p{L}*|percent|per\s+cent|процент\p{L}*)/iu;
/** Less of something („less contrast", „კონტრასტი შეამცირე", «меньше контраста»): read in the word's own clause only. */
const LESS = /ნაკლებ|შეამცირ|შეუმცირ|დაუწი|less|lower|reduce|decrease|tone\s+down|flatter|меньше|уменьш|убав|сниз|приглуш/iu;
/** Where one clause ends: „more contrast, less brightness" is two of them. */
const CLAUSE_END = /[,.;!?\n]|(?<!\p{L})(?:and|but|then|და|მაგრამ|მერე|и|но|потом)(?!\p{L})/giu;

const BRIGHTER = /(?<!\p{L})გაანათ|უფრო\s+ნათ|ნათელი\s+გახად|სიკაშკაშე\s+(?:აუწი|მოუმატ|გაზარდ)|(?:აუწი|მოუმატ|გაზარდ)\p{L}*\s+სიკაშკაშ|brighter|brighten|lighten\s+(?:it|up|the)|brightness\s+up|(?:increase|raise|boost)\s+(?:the\s+)?brightness|ярче|осветл|светлее|(?:прибав|увелич|подним)\p{L}*\s+яркост/iu;
const DARKER = /გაამუქ|დაამუქ|უფრო\s+მუქ|მუქი\s+გახად|სიკაშკაშე\s+(?:დაუწი|შეამცირ)|(?:დაუწი|შეამცირ)\p{L}*\s+სიკაშკაშ|darker|darken|less\s+bright|brightness\s+down|(?:reduce|lower|decrease)\s+(?:the\s+)?brightness|темнее|(?:убав|уменьш|сниз)\p{L}*\s+яркост/iu;
const CONTRAST = /კონტრასტ|contrast|контраст/iu;
const SATURATION = /გაჯერ|სატურაც|saturat|vivid|vibrant|punchy|colou?rful|насыщ|сочн|ცოცხალი?\s+ფერ|ფერ\p{L}*\s+(?:გააცოცხლ|გაამკვეთრ|გაამდიდრ|უფრო\s+(?:მკვეთრ|ცოცხ))|(?:გააცოცხლ|გაამკვეთრ|გაამდიდრ)\p{L}*\s+ფერ|მკვეთრი?\s+ფერ/iu;
const DESATURATE = /desaturat|muted\s+colou?r|washed[\s-]*out|less\s+(?:saturat|colou?r|vivid)|ფერმკრთალ|ნაკლებ\p{L}*\s+(?:ფერ|გაჯერ)|გაჯერებ\p{L}*\s+(?:დაუწი|შეამცირ)|(?:დაუწი|შეამცირ)\p{L}*\s+გაჯერებ|приглуш\p{L}*\s+цвет|блекл|менее\s+насыщ|(?:уменьш|убав|сниз)\p{L}*\s+насыщ/iu;
/** Sharpness, never „ფერები გაამკვეთრე" (vivid colours, the saturation's). */
const SHARPEN = /სიმკვეთრ|(?<!ფერ\p{L}*\s+)გაამკვეთრ(?!\p{L}*\s+ფერ)|უფრო\s+მკვეთრ(?!\p{L}*\s+ფერ)|sharpen|sharper|crisper|(?<!\p{L})(?:резче|резкост\p{L}*)|чётче|четче|чёткост|четкост/iu;
const VIGNETTE = /ვინიეტ|vignett|виньет/iu;
const WARMER = /თბილ(?!ის)|გაათბ|warm(?:er|th)?(?!\p{L})|теплее|тёпл\p{L}*\s+(?:тон|цвет|оттен)|тепл(?:ые|ый|ая|ой|ого|ых|ую)\s+(?:тон|цвет|оттен)|потепл|золотист/iu;
const COOLER = /ცივ(?:ი|ად|ო)?\s+(?:ტონ|ფერ|ელფერ)|გააცივ|უფრო\s+ცივ|გრილ|cooler|cool\s+(?:tones?|look|colou?rs?|tint)|cold\s+(?:tones?|look|colou?rs?)|bluish|холоднее|холодн\p{L}*\s+(?:тон|цвет|оттен)|похолод/iu;
/** Warm LIGHT LEAKS are the overlay's (./overlayFx), not a warmer picture. */
const WARM_LIGHT = /(?:warm|თბილ(?!ის)\p{L}*|тёпл\p{L}*|тепл\p{L}*)\s+(?:light|სინათლ|светов)/iu;

/** A mirror: „სარკისებრად", "mirror / flip it", «отзеркаль». „ამოაბრუნე" is turning it over, not a quarter turn. */
const FLIP = /სარკ(?:ე|ის|ულ)\p{L}*|(?<!\p{L})(?:ამოაბრუნ|გადააბრუნ)|mirror|(?<!\p{L})flip|отзеркал|зеркальн|отрази(?!\p{L})/iu;
const VERTICAL = /ვერტიკალურად|vertical\p{L}*|upside\s*-?\s*down|თავდაყირა|вертикал\p{L}*|вверх\s+ногами/iu;
const UPSIDE = /თავდაყირა|upside\s*-?\s*down|вверх\s+ногами/iu;
/** A turn: the verbs that mean nothing else („მოატრიალე", "rotate", «поверни»); „turn" only with where it turns to. */
const ROTATE = /(?<!\p{L})(?:მოაბრუნ|შემოაბრუნ|მოატრიალ|შეატრიალ|დაატრიალ|გადაატრიალ)|rotat|повер(?:ни|нуть|ните)(?!\p{L})/iu;
const TURN = /(?<!\p{L})turn\s+(?:it\s+|the\s+(?:video|clip|picture|photo|image)\s+)?(?:by\s+)?(?:90|180|270|sideways|clockwise|counter|anti|left|right|upside|on\s+its\s+side)|разверн\p{L}*\s+(?:на\s+\d|влево|вправо)/iu;
const DEGREES = /(?<![\d.,])(-?\d{2,3})\s*(?:°|გრადუს\p{L}*|degrees?|deg(?!\p{L})|градус\p{L}*)/iu;
const LEFT = /მარცხნივ|მარცხნისკენ|საათის\s+ისრის\s+საწინააღმდეგოდ|(?<!\p{L})left(?!\p{L})|counter\s*-?\s*clockwise|anti\s*-?\s*clockwise|(?<!\p{L})ccw(?!\p{L})|влево|налево|против\s+часов/iu;
const RIGHT = /მარჯვნივ|მარჯვნისკენ|საათის\s+ისრის\s+მიმართულებით|(?<!\p{L})right(?!\p{L})|clockwise|вправо|направо|по\s+часов/iu;

/** A slow zoom („ზუმი", "zoom in", «наезд»); „მიახლოებით" is „about", never a zoom. */
const ZOOM = /(?<!\p{L})(?:ზუმ|zoom|зум)|მიაახლოვ|push\s+in|ken\s+burns|наезд|приблизь/iu;
const ZOOM_OUT = /ზუმ\p{L}*\s*-?\s*აუთ|zoom(?:ing)?\s*-?\s*out|pull\s+(?:back|out)|(?<!\p{L})დააშორ|отдали|отъезд|зум\p{L}*\s*-?\s*аут/iu;
/** A shake as an effect asked for; „it is shaky" is a complaint (steadying's), never this. */
const SHAKE = new RegExp([
  'შეაკანკალ|შეკანკალ|ანჯღრ|კანკალის\\s+ეფექტ|კანკალ\\p{L}*\\s+(?:დაამატ|დაადე|გაუკეთ)|(?:დაამატ|დაადე|გაუკეთ)\\p{L}*\\s+(?:კამერის\\s+)?კანკალ',
  '(?<!\\p{L})(?:camera\\s+)?shakes?\\s+effect|shaking\\s+effect|shaky[\\s-]*cam(?:era)?\\s+effect|earthquake',
  '(?<!\\p{L})(?:add|put|with|and|some|a)\\s+(?:a\\s+|some\\s+|little\\s+|bit\\s+of\\s+)?(?:camera\\s+)?shak(?:e|ing)(?!\\p{L})|(?<!\\p{L})shake\\s+(?:it|the\\s+(?:video|clip|picture|camera))',
  'эффект\\p{L}*\\s+тряск|тряск\\p{L}*\\s+(?:камер\\p{L}*\\s+)?(?:добав|сдела)|(?:добав|сдела)\\p{L}*\\s+(?:эффект\\s+)?тряск|встряхн',
].join('|'), 'iu');
const GLITCH = /გლიჩ|glitch|глитч/iu;
/** A shaky clip steadied: „კანკალი მოაშორე" and "remove the shake" are this, never a shake effect. */
const STABILIZE = /სტაბილიზ|დაასტაბილურ|სტაბილურ|კანკალ\p{L}*\s+(?:მოაშორ|მოუშორ|მოხსენ|გაასწორ|წაშალ|ამოიღ)|(?:მოაშორ|მოუშორ|გაასწორ|წაშალ|მოხსენ)\p{L}*\s+კანკალ|არ\s+კანკალებდეს|stabili[sz]|steady|steadier|deshake|(?:remove|fix|reduce|less|without|no)\s+(?:the\s+)?(?:camera\s+)?shak|стабилиз|(?:убер|убра|устран)\p{L}*\s+тряск|без\s+тряск|shaky[^.!?\n]{0,24}(?:fix|repair|smooth)|(?:fix|repair|smooth\s+out)\s+(?:the\s+|this\s+)?shaky|კანკალებ\p{L}*[^.!?\n]{0,24}(?:გაასწორ|გამოასწორ)|тряс\p{L}*[^.!?\n]{0,24}(?:исправ|почин)/iu;

/** Noise out of the sound: a noise word with a word that takes it away, or a plain „clean the sound". */
const NOISE = /ხმაურ|შიშინ|ზუზუნ|noise|hiss|(?<!\p{L})hum(?!\p{L})|(?<!\p{L})шум|шипени|(?<!\p{L})гул(?!\p{L})/iu;
const NOISE_OFF = /მოაშორ|მოუშორ|მოხსენ|წაშალ|შეამცირ|გაწმინდ|გაასუფთავ|ამოიღ|remov|reduc|cut|clean|get\s+rid|eliminat|less|убер|удали|уменьш|почист|подав|без/iu;
const DENOISE = /denois|noise\s+(?:reduction|removal|cancel\p{L}*)|(?:clean|clear)\s+(?:up\s+)?(?:the\s+)?(?:audio|sound|voice)|ხმა\s+(?:გაასუფთავ|გაწმინდ)|(?:გაასუფთავ|გაწმინდ)\p{L}*\s+ხმა(?!ურ)|шумоподав|почист\p{L}*\s+звук/iu;
/** The sound evened out to one loudness. */
const LOUDNESS = /ნორმალიზ|ხმა\s+(?:გაათანაბრ|დაანორმალ|დააბალანს)|(?:გაათანაბრ|დაანორმალ|დააბალანს)\p{L}*\s+ხმა|ხმის\s+(?:დონე|სიმაღლე|სიძლიერე)\s+(?:გაათანაბრ|გაასწორ|დაალაგ)|normali[sz]|loudness|even\s+out\s+(?:the\s+)?(?:volume|audio|sound|levels?)|level\s+(?:out\s+)?(?:the\s+)?(?:audio|sound|volume)|consistent\s+volume|нормализ|выровня\p{L}*\s+(?:звук|громкост)|выровнять\s+(?:звук|громкост)/iu;
/** A new frame filled with the picture's own blur instead of bars (only with a frame asked: else it is a blur mask). */
const BLUR_FIT = /ბუნდოვან\p{L}*\s+ფონ\p{L}*|დაბლარულ\p{L}*\s+ფონ\p{L}*|ბლარ\p{L}*\s+ფონ\p{L}*|ფონ\p{L}*\s+(?:დაბლარ|ბლარ|გაბუნდოვ|ბუნდოვან)\p{L}*|blurr?(?:ed|y)?\s+(?:background|backdrop|bg|sides|bars|edges|fill)|background\s+blur|blur\s+fill|размыт\p{L}*\s+фон\p{L}*|фон\p{L}*\s+размыт\p{L}*/iu;
/** Played backwards: not here (ffmpeg holds the whole clip in memory for it). „In reverse order" is no playback. */
const REVERSE = /უკუღმა|reverse(?!\s+(?:the\s+)?order)|backwards|rewind\s+effect|в\s+обратн\p{L}*\s+(?:сторон|направлен)|задом\s+наперёд|задом\s+наперед|реверс/iu;

/** The clause a match stands in: up to 24 characters on each side, never past a comma, a full stop or an „and". */
function clauseAround(t: string, m: RegExpExecArray): string {
  let before = t.slice(Math.max(0, m.index - 24), m.index);
  let after = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
  const stop = [...before.matchAll(CLAUSE_END)].pop();
  if (stop) before = before.slice((stop.index ?? 0) + stop[0].length);
  const cut = after.search(new RegExp(CLAUSE_END.source, 'iu'));
  if (cut >= 0) after = after.slice(0, cut);
  return `${before}${m[0]}${after}`;
}

/** Every match of `re` blanked with spaces: what was read is gone, and every other position stays where it was. */
const blank = (t: string, re: RegExp): string => t.replace(new RegExp(re.source, `${re.flags.replace('g', '')}g`), (m) => ' '.repeat(m.length));

/** The picture's own light and colour: each word its default step, or the share said in its clause. */
function mineAdjust(text: string): EditAsk | null {
  const t = blank(text, WARM_LIGHT);
  const out: Record<string, number> = {};
  const step = (m: RegExpExecArray, dflt: number): number => {
    const p = PCT.exec(clauseAround(t, m));
    return p ? Math.min(100, parseInt(p[1]!, 10)) : dflt;
  };
  const up = BRIGHTER.exec(t), down = DARKER.exec(t);
  if (up && !down) out.brightness = step(up, 25);
  else if (down && !up) out.brightness = -step(down, 25);
  const c = CONTRAST.exec(t);
  if (c) out.contrast = (LESS.test(clauseAround(t, c)) ? -1 : 1) * step(c, 25);
  const less = DESATURATE.exec(t), more = less ? null : SATURATION.exec(t);
  if (less) out.saturation = -step(less, 50);
  else if (more) out.saturation = (LESS.test(clauseAround(t, more)) ? -1 : 1) * step(more, 35);
  const warm = WARMER.exec(t), cool = COOLER.exec(t);
  if (warm && !cool) out.warmth = step(warm, 40);
  else if (cool && !warm) out.warmth = -step(cool, 40);
  const sh = SHARPEN.exec(t);
  if (sh) out.sharpen = step(sh, 50);
  const v = VIGNETTE.exec(t);
  if (v) out.vignette = step(v, 50);
  return Object.keys(out).length ? ({ op: 'adjust', ...out } as EditAsk) : null;
}

/** A mirror and a turn. A turn with no degrees or side is a quarter turn clockwise, unless a frame shape is asked too. */
function mineTurn(t: string, aspectAsked: boolean): EditAsk[] {
  const out: EditAsk[] = [];
  const flip = FLIP.exec(t);
  const flipClause = flip ? clauseAround(t, flip) : '';
  if (flip) out.push({ op: 'flip', axis: VERTICAL.test(flipClause) ? 'vertical' : 'horizontal' });
  const verb = ROTATE.exec(t) ?? TURN.exec(t);
  const upside = UPSIDE.exec(t);
  // „Flip it upside down" is the flip's; a plain „upside down" is a half turn.
  const anchor = verb ?? (upside && !(flip && UPSIDE.test(flipClause)) ? upside : null);
  if (!anchor) return out;
  const clause = clauseAround(t, anchor);
  const deg = DEGREES.exec(clause) ?? (verb ? DEGREES.exec(t) : null);
  let d: number | undefined;
  if (deg) d = Number(deg[1]) * (LEFT.test(clause) && Number(deg[1]) === 90 ? -1 : 1);
  else if (UPSIDE.test(clause)) d = 180;
  else if (LEFT.test(clause)) d = -90;
  else if (RIGHT.test(clause)) d = 90;
  else if (!aspectAsked) d = 90;
  if (d !== undefined) out.push({ op: 'rotate', deg: d });
  return out;
}

/** A zoom, a shake, a glitch (together when asked together); a zoom that is the transitions' own style is theirs. */
function mineMotion(t: string): EditAsk | null {
  const transitions = transitionAsk(t);
  const zoomStyle = transitions?.styles.includes('zoom') === true && !transitions.mixed;
  const zoom: ZoomWay | undefined = zoomStyle ? undefined : ZOOM_OUT.test(t) ? 'out' : ZOOM.test(t) ? 'in' : undefined;
  const shake = !STABILIZE.test(t) && SHAKE.test(t);
  const glitch = GLITCH.test(t);
  if (!zoom && !shake && !glitch) return null;
  return { op: 'motion', ...(zoom ? { zoom } : {}), ...(shake ? { shake: true } : {}), ...(glitch ? { glitch: true } : {}) };
}

/** Every effect the words ask for, in ./editPlan EDIT_ORDER. */
function mineEffects(t: string, aspectAsked: boolean): EditAsk[] {
  const out: EditAsk[] = [];
  if (STABILIZE.test(t)) out.push({ op: 'stabilize' });
  out.push(...mineTurn(t, aspectAsked));
  const motion = mineMotion(t);
  if (motion) out.push(motion);
  const adjust = mineAdjust(t);
  if (adjust) out.push(adjust);
  return out;
}

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

function mineAspect(t: string, blurFit = false): EditAsk | null {
  const to: FrameAspect | null = FOUR_FIVE.test(t) ? '4:5' : (aspectFromPrompt(t) as FrameAspect | null);
  if (!to || !FRAME_WORD.test(t) && !/\d\s*[:x×/]\s*\d/.test(t)) return null;
  return { op: 'aspect', to, fit: blurFit ? 'blur' : PAD.test(t) || (DESIGN.test(t) && !CROP.test(t)) ? 'pad' : 'crop' };
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

function mineOverlay(t: string): EditAsk | null {
  if (!OVERLAY.test(t)) return null;
  return GRAIN.test(t) && !/light\s*-?\s*leak|ლაით|ანარეკლ|блик/iu.test(t) ? { op: 'overlay', look: 'grain' } : { op: 'overlay', look: 'light-leak' };
}

/** The sound cleaned: the noise taken out, and evened out to one loudness. */
function mineSound(t: string): EditAsk[] {
  const out: EditAsk[] = [];
  if (DENOISE.test(t) || (NOISE.test(t) && NOISE_OFF.test(t))) out.push({ op: 'denoise' });
  if (LOUDNESS.test(t)) out.push({ op: 'loudness' });
  return out;
}

function mineVolume(t: string): EditAsk | null {
  if (MUTE.test(t)) return { op: 'mute' };
  const louder = LOUDER.test(t), quieter = QUIETER.test(t);
  if (louder === quieter) return null;
  const db = DB.exec(t);
  const size = db ? Math.abs(n(db[1]!)) : 6;
  return { op: 'volume', db: louder ? size : -size };
}

type Field = 'num' | 'str' | 'bool' | 'list' | 'obj';

const ASK_KEYS: Readonly<Record<EditAsk['op'], Readonly<Record<string, Field>>>> = {
  trim: { fromSec: 'num', toSec: 'num', lastSec: 'num', cutEndSec: 'num' },
  speed: { factor: 'num' },
  aspect: { to: 'str', fit: 'str' },
  grade: { style: 'str' },
  fade: { inSec: 'num', outSec: 'num' },
  volume: { db: 'num' },
  mute: {},
  caption: { text: 'str' },
  overlay: { look: 'str' },
  thumbnail: { atSec: 'num' },
  erase: { at: 'str', boxes: 'list' },
  adjust: { brightness: 'num', contrast: 'num', saturation: 'num', warmth: 'num', sharpen: 'num', vignette: 'num' },
  flip: { axis: 'str' },
  rotate: { deg: 'num' },
  motion: { zoom: 'str', shake: 'bool', glitch: 'bool' },
  stabilize: {},
  denoise: {},
  loudness: {},
  layers: { add: 'list', change: 'list', remove: 'list' },
  captions: { track: 'obj', deliver: 'str', off: 'bool' },
};

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Plain data only, rebuilt (a layer list, a caption track): finite numbers, short strings, booleans, and bounded arrays
 * and objects of them. Undefined for anything else. Their meaning is ./layers resolveLayers / resolveTrack's to check.
 */
function plainOf(x: unknown, depth: number): unknown {
  if (typeof x === 'number') return Number.isFinite(x) ? x : undefined;
  if (typeof x === 'string') return x.length <= 2048 ? x : undefined;
  if (typeof x === 'boolean') return x;
  if (depth <= 0 || !x || typeof x !== 'object') return undefined;
  if (Array.isArray(x)) {
    if (x.length > MAX_CUES) return undefined;
    const out: unknown[] = [];
    for (const v of x) { const p = plainOf(v, depth - 1); if (p === undefined) return undefined; out.push(p); }
    return out;
  }
  const entries = Object.entries(x);
  if (entries.length > 24) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (v === undefined) continue;
    if (UNSAFE_KEYS.has(k)) return undefined;
    const p = plainOf(v, depth - 1);
    if (p === undefined) return undefined;
    out[k] = p;
  }
  return out;
}

function fieldOf(type: Field, v: unknown): unknown {
  switch (type) {
    case 'num': return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    case 'str': return typeof v === 'string' && v.length <= 200 ? v : undefined;
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'list': return Array.isArray(v) && v.length <= 24 ? plainOf(v, 3) : undefined;
    case 'obj': return v && typeof v === 'object' && !Array.isArray(v) ? plainOf(v, 4) : undefined;
  }
}

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
    const value = fieldOf(type, v);
    if (value === undefined) return null;
    out[k] = value;
  }
  // A track is the user's own words (typed or a file): a transcript or a translation is never taken from a caller.
  const track = out.track as { source?: unknown } | undefined;
  if (track && track.source !== 'typed' && track.source !== 'file') return null;
  return out as EditAsk;
}

/**
 * The ops whose words also describe a picture: „warm", „ნათელი", «ярче», "upside down", „ზუმი". Read alone, they are an
 * edit only when the message asks for one (asksForEdit): „წინა ვიდეო უფრო ნათელი იყო" is a remark the chat answers.
 */
const DESCRIBING_OPS: ReadonlySet<string> = new Set(['adjust', 'flip', 'rotate', 'motion', 'stabilize', 'denoise', 'loudness']);

/** Are these only the describing kind (and „backwards"), so the words alone may be a remark rather than an ask? */
export function onlyDescribing(mined: MinedEdits): boolean {
  if (!mined.edits.length && !mined.unsupported.length) return false;
  return mined.edits.every((e) => DESCRIBING_OPS.has(e.op) || (e.op === 'aspect' && e.fit === 'blur'))
    && mined.unsupported.every((u) => u === 'reverse');
}

/** A request: „can you…", „please", „გთხოვ", «можешь…», "I want…". */
const REQUEST = /(?<![\p{L}])(?:can\s+you|could\s+you|would\s+you|will\s+you|please|let'?s|i\s+want|i'?d\s+like|i\s+need|შეგიძლია|შეძლებ|გთხოვ|მინდა|можешь|можете|можно|пожалуйста|хочу|нужно|давай)(?![\p{L}])/iu;
/** An English verb that asks for a change, or a phrase that only a change can be: "zoom in", "warm it up", "play it backwards". */
const EN_VERB = /(?<![\p{L}])(?:make|turn|add|apply|put|give|set|flip|rotate|stabili[sz]e|denoise|normali[sz]e|boost|increase|decrease|reduce|lower|raise|remove|fix|brighten|darken|lighten|sharpen|saturate|desaturate|crop|change|adjust|tweak|edit|enhance|improve|correct|reverse|mute|speed\s+up|slow\s+down|zoom\s+(?:in|out)|warm\s+(?:it\s+|this\s+)?up|cool\s+(?:it\s+|this\s+)?down|clean\s+up|mirror\s+(?:it|this|the)|blur\s+(?:it|this|the)|play\s+(?:it\s+|this\s+)?(?:backwards|in\s+reverse))(?![\p{L}])/iu;
/** A Georgian command: a preverb, the stem and the imperative -ე („გახადე", „დაამატე", „მოაბრუნე", „გაათბე"); not „-ზე" („შენზე", „ამაზე"). */
const KA_VERB = /(?<![\p{L}])(?:(?:გადა|შემო|გამო|ჩამო|ამო|წამო|გა|და|მო|შე|ა|ჩა|წა|მი|მიუ|დაუ|შეუ|გაუ)\p{L}{2,}(?<!ზ)ე|ჩასვი|დასვი|ქენი|მიეცი|მიქენი)(?![\p{L}])/iu;
/** A Russian command. */
const RU_VERB = /(?<![\p{L}])(?:сделай\p{L}*|добавь\p{L}*|примени\p{L}*|наложи\p{L}*|поверни\p{L}*|переверни\p{L}*|отрази|отзеркаль\p{L}*|приблизь|отдали|убери\p{L}*|почисти\p{L}*|выровняй|стабилизируй|увеличь|уменьши|затемни|осветли|измени|поменяй|исправь|улучши|включи|поставь|ускорь|замедли|обрежь|прокрути|дай)(?![\p{L}])/iu;

/**
 * Does the message ask for an edit, rather than describe or ask about the picture? A request word or a command verb, and
 * not a question that only asks: "what should I post with this video, something warm?" and "is it warm?" are not.
 */
export function asksForEdit(text: string): boolean {
  const t = String(text ?? '').slice(0, 2000);
  const request = REQUEST.test(t);
  if (!request && /[?？]\s*$/u.test(t.trim())) return false;
  return request || EN_VERB.test(t) || KA_VERB.test(t) || RU_VERB.test(t);
}

/** Every edit the message asks for, in the words' own terms (unresolved against any file). */
export function mineEdits(text: unknown): MinedEdits {
  const raw = typeof text === 'string' ? text.slice(0, 20_000) : '';
  const out: MinedEdits = { edits: [], missing: [], unsupported: [] };
  if (!raw.trim()) return out;

  // A new frame over the picture's own blur is the frame's („9:16 ბუნდოვანი ფონით"), not a blur mask: read out first.
  const blurFit = BLUR_FIT.test(raw) && mineAspect(raw) !== null;
  // Text, logos, masks and captions first: the words to be drawn and the caption lines leave the message before the
  // rest of it is read as edits („აქ დააწერე: სიჩქარე" draws a word; it does not speed anything up).
  const comp = mineComposition(blurFit ? blank(raw, BLUR_FIT) : raw);
  const t0 = comp.rest.slice(0, 2000);
  // „Flip it vertically" is the flip's, not a vertical frame.
  const t = FLIP.test(t0) ? blank(t0, VERTICAL) : t0;
  const styles = comp.asks.flatMap((a) => (a.op === 'layers' ? [...(a.add ?? []), ...(a.change ?? [])] : []));
  const textMotion = styles.some((x) => 'motionIn' in x && x.motionIn === 'fade');
  const textCinematic = styles.some((x) => 'style' in x && x.style === 'cinematic');

  const thumb = THUMB.test(t);
  if (thumb) {
    const at = timeOfAlternatives(THUMB_AT.exec(t));
    out.edits.push(at === undefined ? { op: 'thumbnail' } : { op: 'thumbnail', atSec: at });
  } else if (comp.timeUsed) {
    // „in the last 3 seconds" was the layer's time: it trims nothing.
    const speed = mineSpeed(t);
    if (speed) out.edits.push(speed);
  } else {
    const trim = mineTrim(t);
    if (trim.ask) out.edits.push(trim.ask);
    if (trim.cutMiddle) out.unsupported.push('cut_middle');
    const speed = mineSpeed(t);
    if (speed) out.edits.push(speed);
  }
  const aspect = mineAspect(t, blurFit);
  if (aspect) out.edits.push(aspect);
  const effects = mineEffects(t0, Boolean(aspect));
  // A still takes the turn, the mirror and the light and colour; movement and steadying are a video's.
  out.edits.push(...(thumb ? effects.filter((e) => e.op === 'rotate' || e.op === 'flip' || e.op === 'adjust') : effects));
  const grade = mineGrade(t);
  const named = GRADES.some((g) => g.re.test(t));
  // „კინემატოგრაფიული ტექსტი" is the text's look, not the video's colour; „ფერები გააცოცხლე" is the colour asked, not a look.
  const ownColour = effects.some((e) => e.op === 'adjust');
  if (grade && !(textCinematic && grade.op === 'grade' && grade.style === 'cinematic' && !COLOR.test(t)) && (named || !ownColour)) out.edits.push(grade);
  if (REVERSE.test(t)) out.unsupported.push('reverse');
  if (!thumb) {
    // A text that fades in is the text's motion, not a fade of the video.
    const fade = textMotion ? null : mineFade(t);
    if (fade) out.edits.push(fade);
    const volume = mineVolume(t);
    if (volume) out.edits.push(volume);
    out.edits.push(...mineSound(t));
    const overlay = mineOverlay(t);
    if (overlay) out.edits.push(overlay);
  }
  out.edits.push(...comp.asks);
  out.missing.push(...comp.missing);
  out.unsupported.push(...comp.unsupported);
  if (comp.logo) out.logo = true;
  return out;
}

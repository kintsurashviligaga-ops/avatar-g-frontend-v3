/**
 * lib/video/durationWords.ts — a length of time as people type it, in ka · en · ru (Video Core v1.0 §4.1, AC-04).
 * Pure, no network, safe in the browser. lib/chat/studioIntent `mineDurationSec` is the one reader of lengths; this is
 * the part of it that reads WORDS and CLOCKS, kept apart so the table of what it reads can be tested on its own.
 *
 * What was wrong before (the defect register, 2026-10-12): the miner wanted a DIGIT before the unit. „ერთწუთიანი ვიდეო",
 * „ოთხწუთიანი ფილმი", "a one-minute clip", «четырёхминутный ролик» named no length at all, so the panel kept whatever
 * length it last had; and "2 min 30 s" was read as 30, the seconds alone, because seconds were tried first.
 *
 * Forms read here, all three languages:
 *   · minutes AND seconds together: „2 წუთი და 30 წამი", "2 min 30 s", «2 минуты 30 секунд» → 150;
 *   · a clock with a length word next to it: „ხანგრძლივობა 1:30", "1:30 long", «длиной 1:30» → 90 (a bare „0:59" is
 *     never a length: it is where in a song something starts, lib/agent/params mineMusicStart);
 *   · a number in digits or in words before a unit: „ერთი წუთი", „ოცდაათი წამი", "sixty seconds", «одна минута»;
 *   · a compound adjective: „ერთწუთიანი", „ოთხწუთიანი", „ნახევარწუთიანი", "one-minute", "four-minute",
 *     «одноминутное», «четырёхминутный», «полутораминутный»;
 *   · a minute with no number: „წუთიანი ვიდეო", "a minute-long video", «минутный ролик» → 60; „წუთნახევარი" → 90.
 *
 * ⚠️ NO `\b`: it is ASCII-only and never matches next to a Georgian or Cyrillic letter. Token edges are the Unicode
 * lookarounds below. A number is read whole („7.5" is 7.5, never the 5 after its point).
 */

const L = '\\p{L}';
const B0 = `(?<![${L}\\p{N}])`;
const B1 = `(?![${L}\\p{N}])`;

/** The longest length anyone types for one video: an hour. A pasted number is never a three-day film. */
export const MAX_DURATION_SEC = 3600;

/**
 * Georgian counts in twenties: „ოცდახუთი" is 20 + 5, „ორმოცდათხუთმეტი" 40 + 15, one word each. Every word and its stem
 * („ოცდახუთ|წამიანი") is in the table; review 2026-10-13 found „ოცდახუთი წამი" read as nothing at all.
 */
const KA_ONES: ReadonlyArray<readonly [string, number]> = [
  ['ერთი', 1], ['ორი', 2], ['სამი', 3], ['ოთხი', 4], ['ხუთი', 5], ['ექვსი', 6], ['შვიდი', 7], ['რვა', 8], ['ცხრა', 9], ['ათი', 10],
  ['თერთმეტი', 11], ['თორმეტი', 12], ['ცამეტი', 13], ['თოთხმეტი', 14], ['თხუთმეტი', 15], ['თექვსმეტი', 16], ['ჩვიდმეტი', 17],
  ['თვრამეტი', 18], ['ცხრამეტი', 19],
];
const KA_TWENTIES: ReadonlyArray<readonly [string, number]> = [['ოცი', 20], ['ორმოცი', 40], ['სამოცი', 60], ['ოთხმოცი', 80], ['ასი', 100]];
const kaStem = (w: string): string => (w.endsWith('ი') ? w.slice(0, -1) : w);
const KA_WORDS: Array<readonly [string, number]> = [];
for (const [w, n] of [...KA_ONES, ...KA_TWENTIES]) KA_WORDS.push([w, n], [kaStem(w), n]);
for (const [tens, t] of KA_TWENTIES.slice(0, 4)) {
  for (const [one, o] of KA_ONES) KA_WORDS.push([`${kaStem(tens)}და${one}`, t + o], [`${kaStem(tens)}და${kaStem(one)}`, t + o]);
}

/**
 * Number words and stems. Georgian and Russian stems double as the prefix of a compound („ოთხ|წუთიანი",
 * «четырёх|минутный»). The alternation is built LONGEST FIRST so „ოცდაათ" wins over „ოც" and „ათ", "fifteen" over "five".
 */
const NUMBER_WORDS: ReadonlyArray<readonly [string, number]> = [
  ...KA_WORDS, ['ნახევარი', 0.5], ['ნახევარ', 0.5],
  // en
  ['eleven', 11], ['twelve', 12], ['thirteen', 13], ['fourteen', 14], ['fifteen', 15], ['sixteen', 16], ['seventeen', 17],
  ['eighteen', 18], ['nineteen', 19], ['twenty', 20], ['thirty', 30], ['forty', 40], ['fifty', 50], ['sixty', 60], ['seventy', 70],
  ['eighty', 80], ['ninety', 90], ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6], ['seven', 7],
  ['eight', 8], ['nine', 9], ['ten', 10], ['half', 0.5],
  // ru — words in their cases, then the compound stems («двух|минутный»)
  ['одиннадцать', 11], ['одиннадцати', 11], ['двенадцать', 12], ['двенадцати', 12], ['тринадцать', 13], ['тринадцати', 13],
  ['четырнадцать', 14], ['четырнадцати', 14], ['пятнадцать', 15], ['пятнадцати', 15], ['шестнадцать', 16], ['шестнадцати', 16],
  ['семнадцать', 17], ['семнадцати', 17], ['восемнадцать', 18], ['восемнадцати', 18], ['девятнадцать', 19], ['девятнадцати', 19],
  ['двадцать', 20], ['двадцати', 20], ['тридцать', 30], ['тридцати', 30], ['сорок', 40], ['сорока', 40],
  ['пятьдесят', 50], ['пятидесяти', 50], ['шестьдесят', 60], ['шестидесяти', 60], ['семьдесят', 70], ['семидесяти', 70],
  ['восемьдесят', 80], ['восьмидесяти', 80], ['девяносто', 90], ['девяноста', 90], ['сто', 100],
  ['одна', 1], ['одну', 1], ['одной', 1], ['один', 1], ['одно', 1], ['две', 2], ['два', 2], ['двух', 2], ['три', 3], ['трёх', 3], ['трех', 3],
  ['четыре', 4], ['четырёх', 4], ['четырех', 4], ['пять', 5], ['пяти', 5], ['шесть', 6], ['шести', 6], ['семь', 7], ['семи', 7],
  ['восемь', 8], ['восьми', 8], ['девять', 9], ['девяти', 9], ['десять', 10], ['десяти', 10], ['полторы', 1.5], ['полутора', 1.5], ['полу', 0.5], ['пол', 0.5],
];
const WORD_VALUE = new Map(NUMBER_WORDS.map(([w, n]) => [w, n] as const));

const WORD_ALTERNATION = [...WORD_VALUE.keys()].sort((a, b) => b.length - a.length).join('|');
/** "twenty five", "twenty-five", «двадцать пять», «тридцати двух»: tens and ones as two words (review 2026-10-13: read as 5). */
const TENS_ONES = [
  '(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\\s-]+(?:one|two|three|four|five|six|seven|eight|nine)',
  '(?:двадцат[ьи]|тридцат[ьи]|сорока?|пятьдесят|пятидесяти|шестьдесят|шестидесяти|семьдесят|семидесяти|восемьдесят|восьмидесяти|девяност[оа])\\s+'
    + '(?:одну|одна|одной|один|одно|две|два|двух|три|трёх|трех|четыре|четырёх|четырех|пять|пяти|шесть|шести|семь|семи|восемь|восьми|девять|девяти)',
].join('|');
/** A number as typed: digits (read whole: the guard refuses a digit that is the tail of „7.5") or one of the words. */
const NUM = `(?:(?<![\\d.,])\\d{1,4}(?:[.,]\\d{1,2})?|${TENS_ONES}|${WORD_ALTERNATION})`;

/**
 * The unit words, each ending at a token edge. Georgian and Russian units take their endings („წუთიანი", «минутный»), but
 * only a unit's own: „2 წამყვანი" (two hosts), "5 minimalist shots", «5 секретов», «3 минималистичных» name no length
 * (review 2026-10-13: they read as 2 s, 300 s, 5 s, 180 s). "s" and "m" alone are a unit only at a token end.
 */
const KA_UNIT_END = `(?:ი|ია|იც|ის|ით|ს|ში|ზე|ამდე|იდან|იან${L}*|ებ${L}*)?${B1}`;
const MIN_UNIT = `(?:(?:minutes?|mins?|m)${B1}|წუთ${KA_UNIT_END}|წთ\\.?${B1}|минут${L}*|мин\\.?${B1})`;
const SEC_UNIT = `(?:(?:seconds?|secs?|s)${B1}|წამ${KA_UNIT_END}|წმ\\.?${B1}|სეკუნდ${L}*|секунд${L}*|сек\\.?${B1})`;
/** „და ნახევარი", "and a half", «с половиной»: a half more than the number before the unit. */
const HALF_WORDS = `(?:და\\s+ნახევარი|and\\s+a\\s+half|с\\s+половиной)`;
const AND_A_HALF = `(?:\\s+${HALF_WORDS})?`;
/** The same half said after the unit: „ერთი წუთი და ნახევარი", "one minute and a half", «одна минута с половиной». */
const UNIT_AND_A_HALF = `(?:\\s+${HALF_WORDS}${B1})?`;

/** The words that say a clock is a LENGTH, not a place in a song: „ხანგრძლივობა 1:30", "1:30 long", «длиной 1:30». */
const LENGTH_CUE = `(?:ხანგრძლივობ${L}*|სიგრძ${L}*|length|long|duration|lasting|runtime|длин${L}*|продолжительност${L}*|хронометраж${L}*)`;
/** „9:16" and „9:21" are a frame's shape, never a length (review 2026-10-13: "a 30 second long 9:16 video" read as 556 s). */
const CLOCK = `(?!9:(?:16|21)${B1})(\\d{1,2}):([0-5]\\d)`;
/**
 * Between a length word and its clock: a colon, an "is", an "about", nothing else. A clock further on is another number
 * („30 seconds long, music from 0:45" is 30 s with the song starting at 0:45, never a 45-second film).
 */
const CUE_GAP = `\\s*(?:[:=–—-]\\s*)?(?:(?:is|of|about|around|exactly|approximately|არის|დაახლოებით|ზუსტად|около|примерно|ровно)\\s+)?`;

const RE = {
  minSec: new RegExp(`${B0}(${NUM})\\s*-?\\s*${MIN_UNIT}\\s*(?:and|და|и|,|\\+)?\\s*(${NUM})\\s*-?\\s*${SEC_UNIT}`, 'iu'),
  clockAfterCue: new RegExp(`${B0}${LENGTH_CUE}${CUE_GAP}${B0}${CLOCK}${B1}`, 'iu'),
  clockBeforeCue: new RegExp(`${B0}${CLOCK}(?:\\s+(?:in|of|по|на|საერთო|სრული|წამ${L}*|წუთ${L}*))?\\s*-?\\s*${LENGTH_CUE}`, 'iu'),
  sec: new RegExp(`${B0}(${NUM})${AND_A_HALF}\\s*-?\\s*${SEC_UNIT}${UNIT_AND_A_HALF}`, 'iu'),
  min: new RegExp(`${B0}(${NUM})${AND_A_HALF}\\s*-?\\s*${MIN_UNIT}${UNIT_AND_A_HALF}`, 'iu'),
  /** „წუთი და ნახევარი", «минута с половиной», "minute and a half" with no number: 90 s. */
  bareMinuteAndHalf: new RegExp(`${B0}(?:წუთი|минут[ауы]?|minute)\\s+${HALF_WORDS}${B1}`, 'iu'),
  /** A minute with no number before it: „წუთიანი ვიდეო", "a minute-long clip", «минутное видео». */
  oneMinute: new RegExp(`${B0}(?:წუთიან${L}*|minute[\\s-]long|минутн${L}*)`, 'iu'),
  /** „წუთნახევარი", „წუთნახევრიანი": a minute and a half as one Georgian word. */
  minuteAndHalf: new RegExp(`${B0}წუთნახევ${L}*`, 'iu'),
  andAHalf: /და\s+ნახევარი|and\s+a\s+half|с\s+половиной/iu,
};

/** The value of a number token: digits (a comma is a decimal point) or a word of the table; NaN for neither. */
export function readNumber(token: string): number {
  const t = token.trim().toLowerCase();
  if (/^\d/.test(t)) return Number(t.replace(',', '.'));
  const hit = WORD_VALUE.get(t);
  if (hit !== undefined) return hit;
  // tens and ones as two words ("twenty-five", «двадцать пять»)
  const parts = t.split(/[\s-]+/u);
  if (parts.length !== 2) return NaN;
  const [tens, ones] = parts.map((p) => WORD_VALUE.get(p));
  return tens !== undefined && ones !== undefined && tens >= 20 && tens % 10 === 0 && ones < 10 ? tens + ones : NaN;
}

const bounded = (sec: number): number | undefined => (Number.isFinite(sec) && sec > 0 ? Math.min(MAX_DURATION_SEC, Math.round(sec * 1000) / 1000) : undefined);

/**
 * The length a message names, in seconds, or undefined when it names none. The order is the one that reads "2 min 30 s"
 * as 150: minutes-and-seconds first, then a clock said to be a length, then seconds, then minutes (a bare „ერთი წუთი" is
 * 60; "an"/"a" alone counts only for minutes: "a second" is not a one-second film).
 */
export function mineDurationWords(text: string): number | undefined {
  const t = String(text ?? '');
  if (!t.trim()) return undefined;

  const both = RE.minSec.exec(t);
  if (both?.[1] && both[2]) {
    const m = readNumber(both[1]);
    const s = readNumber(both[2]);
    if (Number.isFinite(m) && Number.isFinite(s)) return bounded(m * 60 + s);
  }

  const clock = RE.clockAfterCue.exec(t) ?? RE.clockBeforeCue.exec(t);
  if (clock?.[1] && clock[2]) return bounded(parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10));

  const sec = RE.sec.exec(t);
  if (sec?.[1]) {
    const n = readNumber(sec[1]);
    if (Number.isFinite(n)) return bounded(n + (RE.andAHalf.test(sec[0]) ? 0.5 : 0));
  }

  const min = RE.min.exec(t);
  if (min?.[1]) {
    const n = readNumber(min[1]);
    if (Number.isFinite(n)) return bounded((n + (RE.andAHalf.test(min[0]) ? 0.5 : 0)) * 60);
  }
  // "a minute", "a minute-long", "half a minute", "a minute and a half" — the article alone is a one, for minutes only.
  const article = new RegExp(`${B0}(half\\s+)?an?\\s+(?:minute(?:[\\s-]long)?|min)${B1}(?:\\s+and\\s+a\\s+half${B1})?`, 'iu').exec(t);
  if (article) return bounded(article[1] ? 30 : /and\s+a\s+half/iu.test(article[0]) ? 90 : 60);

  if (RE.minuteAndHalf.test(t) || RE.bareMinuteAndHalf.test(t)) return 90;
  if (RE.oneMinute.test(t)) return 60;
  return undefined;
}

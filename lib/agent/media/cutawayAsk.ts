/**
 * lib/agent/media/cutawayAsk.ts — does a montage message ask for cutaway footage over the speaker (a split screen with
 * real shots of what is said)? GG 2026-11-05 14:32Z: „ეკრანის გაყოფა და რეალური კადრების მოძიება და ჩასმა".
 * Pure, safe in the browser (the card reads it before the quote is back) and on the server (montageExec).
 */

const SPLIT = new RegExp([
  'გაყ(?:ავ|ოფ)\\p{L}*\\s+(?:\\p{L}+\\s+){0,4}ეკრან|ეკრან\\p{L}*\\s+(?:\\p{L}+\\s+){0,4}გაყ(?:ავ|ოფ)|ორად\\s+გაყ|(?:ზედა|ზემო)\\s+(?:\\p{L}+\\s+)?ეკრან',
  '\\bsplit[-\\s]?screen|\\bsplit\\s+(?:\\w+\\s+){0,3}(?:screen|frame)|\\bscreen\\s+(?:\\w+\\s+){0,3}split',
  'раздел\\p{L}*\\s+экран|сплит[-\\s]?скрин|экран\\p{L}*\\s+пополам',
].join('|'), 'iu');

const FOOTAGE = new RegExp([
  '(?:რეალურ|შესაბამის|სტოკ|საილუსტრაციო|თემატურ|ფაქტობრივ|მიზნობრივ)\\p{L}*\\s+(?:\\p{L}+\\s+){0,4}(?:კადრ|ვიდეო)',
  'კადრ\\p{L}*\\s+(?:\\p{L}+\\s+){0,2}(?:ჩასვ|ჩაამატ|ჩაჯდ|მოძებნ|მოიძი|მოძიებ|ჩასმ|დაამატ)',
  '(?:ჩასვ|ჩაამატ|მოძებნ|მოიძი|დაამატ)\\p{L}*\\s+(?:\\p{L}+\\s+){0,2}კადრ',
  '\\bb[-\\s]?roll|\\bcutaways?\\b|\\bstock\\s+(?:footage|video|clips?)|\\b(?:real|matching|relevant)\\s+(?:footage|shots|clips)',
  'перебивк|видеоряд|сток\\p{L}*\\s+(?:кадр|видео)|(?:реальн|подходящ)\\p{L}*\\s+кадр',
].join('|'), 'iu');

/** True when the words ask for footage of what is said laid over the speaker, split screen or not. */
export function cutawayWords(text: string): boolean {
  const t = (text || '').slice(0, 2000);
  return FOOTAGE.test(t) || SPLIT.test(t);
}

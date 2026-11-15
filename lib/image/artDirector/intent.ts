/**
 * lib/image/artDirector/intent.ts — does a chat line after an image ask to CHANGE that image? Pure, client-safe.
 *
 * "Make her jacket red", "remove the tree in the background", „ქურთუკი წითელი გახადე", „ფონი შეცვალე", «убери дерево»
 * → an edit of the last image in the thread (or the one the user tapped). A line that describes a new picture is not an
 * edit. When unsure we return null and the line is handled as a new prompt: a wrong "edit" would silently reuse a base.
 */
export type EditIntent =
  | { kind: 'remove' }
  | { kind: 'background' }
  | { kind: 'edit' }
  | { kind: 'upscale' }
  | { kind: 'vary' }
  | { kind: 'extend' };

// Word stems, matched at word starts (Georgian has no case; Russian/English lower-cased first).
const RULES: ReadonlyArray<{ kind: EditIntent['kind']; re: RegExp }> = [
  { kind: 'upscale', re: /(\bupscale\b|\bhigher res|\b(2k|4k)\b|გააუმჯობესე|გაადიდე|გარჩევადობ|увелич|улучши качество|апскейл)/i },
  { kind: 'extend', re: /(\bextend\b|\boutpaint|\bzoom out\b|\bwider\b|გააფართოვე|გაზარდე კადრი|расширь|отдали)/i },
  { kind: 'vary', re: /(\bvariation|\bvary\b|\banother version|სხვა ვარიანტ|ვარიაცი|другой вариант|вариаци)/i },
  { kind: 'remove', re: /(\bremove\b|\berase\b|\bdelete\b|\bget rid of\b|მოაშორე|წაშალე|ამოიღე|მოაცილე|убери|удали|сотри)/i },
  { kind: 'background', re: /(\bbackground\b|\bbackdrop\b|ფონ|\bфон)/i },
  {
    kind: 'edit',
    re: /(\bmake (her|his|their|the|it)\b|\bchange\b|\breplace\b|\bturn (her|his|the|it)\b|\badd\b|\brecolou?r\b|\bswap\b|\bput\b|გახადე|შეცვალე|ჩაანაცვლე|დაამატე|გადააკეთე|გადაღებე|сделай (ее|её|его|их)|измени|замени|добавь|перекрась)/i,
  },
];

/** A fresh-picture opener ("draw", „დახატე") wins over an edit verb ("draw a man and add a hat" is a new image). */
const NEW_PICTURE = /^(\s*)(draw|generate|create|imagine|picture of|image of|a photo of|დახატე|შექმენი|დამიხატე|нарисуй|создай|сгенерируй)/i;

export function detectEditIntent(text: string, hasImageInThread: boolean): EditIntent | null {
  if (!hasImageInThread) return null;
  const t = (text ?? '').trim();
  if (!t || t.length > 600 || NEW_PICTURE.test(t)) return null;
  for (const r of RULES) if (r.re.test(t)) return { kind: r.kind };
  return null;
}

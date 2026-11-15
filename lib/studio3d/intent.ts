/**
 * lib/studio3d/intent.ts — does a chat / Agent G message ask for 3D, and for what? Georgian, English, Russian.
 * Pure word rules (no model call): the chat router (PR C) uses it to open the 3D card instead of an image.
 */
export type Studio3dIntent =
  | { kind: 'none' }
  | { kind: 'create'; mode: 'text' | 'image'; subject: string; high: boolean }
  | { kind: 'retexture'; style: string }
  | { kind: 'export'; format: 'glb' | 'obj' | 'stl' }
  | { kind: 'video' };

const THREE_D = /(?:^|[^\p{L}\d])(?:3\s?d|3\s?დ|3\s?д)(?=$|[^\p{L}]|-?[\p{L}])|სამ\s?განზომილებ|трёхмерн|трехмерн|three[-\s]dimensional|\bmesh\b|\bglb\b/iu;
const RETEXTURE = /retexture|re-texture|repaint|new (?:texture|skin|colou?r)|ხელახლა\s?შეღებ|გადაღებ|ტექსტურა\s?შეუცვალ|შეუცვალე\s?(?:ფერი|ტექსტურა)|перекрас|новую текстур|смени(?:ть)? текстур/iu;
const STL = /\bstl\b|3d[-\s]?print|print(?:able)? (?:it|this|version)|დასაბეჭდ|დაბეჭდვ|ბეჭდვისთვის|печат|распечат/iu;
const OBJ = /\bobj\b/i;
const GLB_DL = /(?:download|გადმოწერ|скача).{0,20}\bglb\b|\bglb\b.{0,20}(?:download|გადმოწერ|скача)/iu;
const VIDEO = /use (?:it )?in (?:a |my )?video|turntable|spin(?:ning)? video|rotating (?:clip|video)|ვიდეოში|მბრუნავ|ბრუნავ.{0,10}ვიდეო|в видео|вращающ/iu;
const HIGH = /high (?:detail|quality)|max(?:imum)? detail|detailed|მაღალი\s?(?:ხარისხ|დეტალ)|დეტალურ|высок(?:ая|ой|ое) (?:детал|качеств)|детальн/iu;
const ASK = /make|create|generate|build|turn|convert|გამიკეთე|შექმენი|გააკეთე|დამიგენერირე|აქციე|გადააქციე|сделай|создай|сгенерируй|преврат/iu;

const FILLER = new RegExp(
  [
    '\\b(?:please|pls|can you|could you|make|create|generate|build|turn|convert|me|a|an|the|this|into|in|as|model|object|of)\\b',
    'გთხოვ|გამიკეთე|შექმენი|გააკეთე|დამიგენერირე|გადააქციე|აქციე|მოდელი|მოდელად|ობიექტი',
    'пожалуйста|сделай|создай|сгенерируй|преврати|модель|модели|объект',
    '3\\s?[dდд]', 'სამ\\s?განზომილებიან\\S*', 'трёхмерн\\S*', 'трехмерн\\S*',
    'high (?:detail|quality)', 'მაღალი\\s?(?:ხარისხ|დეტალ)\\S*', 'детальн\\S*',
  ].join('|'),
  'giu',
);

const subjectOf = (text: string) =>
  text.replace(FILLER, ' ').replace(/[\s,.:;!?-]+/g, ' ').trim().slice(0, 300);

export function parseStudio3dIntent(text: string, opts: { hasImage?: boolean; hasModel?: boolean } = {}): Studio3dIntent {
  const t = String(text || '').trim();
  if (!t) return { kind: 'none' };
  const mentions3d = THREE_D.test(t);

  // Follow-ups only make sense on a model that is already in the chat.
  if (opts.hasModel) {
    if (STL.test(t)) return { kind: 'export', format: 'stl' };
    if (OBJ.test(t)) return { kind: 'export', format: 'obj' };
    if (GLB_DL.test(t)) return { kind: 'export', format: 'glb' };
    if (VIDEO.test(t)) return { kind: 'video' };
    if (RETEXTURE.test(t)) {
      const style = t.replace(RETEXTURE, ' ').replace(/^(?:[\s,.:;-]+|(?:it|to|with|as|into|როგორც|в|на)(?=\s))*/iu, '').trim();
      return { kind: 'retexture', style: style.slice(0, 300) || t.slice(0, 300) };
    }
  }

  if (!mentions3d) return { kind: 'none' };
  // "3D" alone in a question about the service ("what is 3D?") is not an order: we need an ask verb or a picture.
  if (!ASK.test(t) && !opts.hasImage) return { kind: 'none' };
  const high = HIGH.test(t);
  const subject = subjectOf(t);
  if (opts.hasImage) return { kind: 'create', mode: 'image', subject, high };
  if (subject.length < 3) return { kind: 'none' };
  return { kind: 'create', mode: 'text', subject, high };
}

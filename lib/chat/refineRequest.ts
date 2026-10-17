/**
 * lib/chat/refineRequest.ts — „უკეთესად გააკეთე" right after a result is a change to THAT result. Pure, client-safe.
 *
 * ⚠️ IT STARTED SOMETHING ELSE ENTIRELY (GG, Production 2026-10-17 07:39Z). A 4-second film was delivered; „უკეთესად
 * გააკეთე" („make it better") was then read by the Video tool as a brand-new brief, the Director had nothing but those two
 * words to plan from, and it invented a new subject. Nothing in the studio knew the words pointed at the film above.
 * Now a short request to improve, with no new subject, is recognised here; the studio re-plans the SAME brief (same
 * story, length, frame and references) with the improvement asked for, and the user sees the board before any charge.
 *
 * A new thing is not a refine: „ახალი ვიდეო გააკეთე", „make a new one", „другой" go on as before, and so does anything
 * long enough to be a brief of its own.
 */

export type RefineLang = 'ka' | 'en' | 'ru';

/** Longest message still read as „improve that one" (a longer one is a brief of its own). */
const REFINE_MAX_CHARS = 160;

// No \b: it is ASCII-only in JS, and never matches next to a Georgian or Cyrillic letter.
const EDGE = '(?:^|[\\s,.;:!?()"„“«»—-])';
const END = '(?=$|[\\s,.;:!?()"„“«»—-])';
const W = '[\\p{L}\\p{N}]*';

/** A verb that asks to improve: „გააუმჯობესე", „improve", „улучши", „переделай". */
const IMPROVE_VERB = new RegExp(
  `${EDGE}(?:გააუმჯობეს${W}|გაუმჯობეს${W}|დახვეწ${W}|გადააკეთ${W}|გადამიკეთ${W}|improve${W}|enhance${W}|polish${W}|redo|улучш${W}|доработ${W}|переделай${W})${END}`,
  'iu',
);
/** „better" — an improvement only beside a make-verb („უკეთესად გააკეთე"); „ეს უკეთესია" („this is better") is praise. */
const BETTER = new RegExp(`${EDGE}(?:უკეთესად|უკეთესი|better|лучше|получше)${END}`, 'iu');
const MAKE = new RegExp(`${EDGE}(?:გააკეთ${W}|გამიკეთ${W}|შექმენ${W}|შემიქმენ${W}|make|do|сделай${W}|делай)${END}`, 'iu');

/** One word that asks to improve („better", „лучше", „უკეთესად"): a short yes ending in it is a change, not a yes. */
export function isRefineWord(word: string): boolean {
  return /^(?:უკეთეს\p{L}*|გააუმჯობეს\p{L}*|better|improved?|лучше|получше|улучш\p{L}*)$/iu.test(word.normalize('NFKC'));
}

/** Words that ask for a NEW thing, never a change to the last one. */
const NEW_THING = new RegExp(`${EDGE}(?:ახალ${W}|სხვა|კიდევ ერთ${W}|new|another|different|новый|новую|новое|другой|другую|другое|ещё один|еще один)${END}`, 'iu');

/** The improve-words themselves, with what only points back at the result („ეს", „it", „это"): what is left is the change. */
const STRIP = new RegExp(
  `${EDGE}(?:უკეთეს${W}|გააუმჯობეს${W}|გაუმჯობეს${W}|დახვეწ${W}|გადააკეთ${W}|გადაკეთ${W}|გააკეთ${W}|გამიკეთ${W}|შექმენ${W}|უფრო|ცოტა|გთხოვ${W}|ეს|ესეც|ეგ|ის|ამ|ისევ|თავიდან|ვიდეო${W}|ფილმ${W}|სურათ${W}|ფოტო${W}|ავატარ${W}|`
  + `make|do|it|this|that|one|a|the|bit|little|please|again|better|improve${W}|enhance${W}|polish${W}|redo|video|film|picture|image|photo|avatar|`
  + `сделай${W}|это|его|её|ее|чуть|немного|пожалуйста|ещё раз|еще раз|лучше|улучш${W}|доработ${W}|переделай${W}|видео|фильм${W}|картинк${W}|фото|аватар${W})${END}`,
  'giu',
);

/**
 * „უკეთესად გააკეთე" → { change: '' }; „უკეთესად გააკეთე, უფრო ნათელი იყოს" → { change: 'ნათელი იყოს' }; „make a new one",
 * a question about improving, or a long brief → null.
 */
export function refineChange(text: string): { change: string } | null {
  const s = text.normalize('NFKC').trim();
  if (!s || s.length > REFINE_MAX_CHARS) return null;
  if (!(IMPROVE_VERB.test(s) || (BETTER.test(s) && MAKE.test(s))) || NEW_THING.test(s)) return null;
  // „როგორ გავაუმჯობესო?" / „can you make it better?" asks about improving; it is answered, not run.
  if (/^(?:როგორ|რატომ|შეგიძლია|შეიძლება|how|why|can|could|would|как|почему|можешь|можно)(?:\s|$)/iu.test(s) && /[?？]\s*$/u.test(s)) return null;
  let change = s;
  // Strip twice: adjacent words share the separator the first pass consumed.
  for (let i = 0; i < 2; i++) change = change.replace(STRIP, ' ');
  change = change.replace(/[\s,.;:!?—-]+/gu, ' ').trim();
  return { change };
}

export function refineLang(text: string, locale: string): RefineLang {
  if (/[Ⴀ-ჿᲐ-Ჿ]/u.test(text)) return 'ka';
  if (/[Ѐ-ӿ]/u.test(text)) return 'ru';
  if (/[a-z]/iu.test(text)) return 'en';
  return locale === 'en' || locale === 'ru' ? locale : 'ka';
}

const IMPROVE: Record<RefineLang, string> = {
  ka: 'გააუმჯობესე წინა ვერსია: იგივე სიუჟეტი, იგივე პერსონაჟები და ადგილი, მაგრამ უფრო მაღალი ხარისხი, უკეთესი კომპოზიცია, განათება და მოძრაობა.',
  en: 'Improve on the previous version: the same story, the same characters and place, with higher quality, better composition, lighting and motion.',
  ru: 'Улучши предыдущую версию: тот же сюжет, те же персонажи и место, но выше качество, лучше композиция, свет и движение.',
};
const ASKED: Record<RefineLang, string> = { ka: 'მომხმარებლის შენიშვნა', en: 'The user asked', ru: 'Пожелание пользователя' };

/** The same brief, with the improvement asked for written in the brief's own language — never a new subject. */
export function improvedBrief(brief: string, change: string, locale: string): string {
  const lang = refineLang(brief, locale);
  const base = brief.trim();
  return `${base}\n\n${IMPROVE[lang]}${change ? ` ${ASKED[lang]}: ${change}.` : ''}`;
}

const tr = (locale: string, ka: string, en: string, ru: string): string => (locale === 'en' ? en : locale === 'ru' ? ru : ka);

/** The note under „უკეთესად გააკეთე" for a film: the same film, planned again; nothing is charged before Generate. */
export function filmRefineNote(lengthLabel: string, change: string, locale: string): string {
  const head = tr(locale,
    `🎬 ვაუმჯობესებ ზემოთ მიღებულ ვიდეოს: იგივე სიუჟეტი და პერსონაჟები, ${lengthLabel}.`,
    `🎬 Improving the video above: the same story and characters, ${lengthLabel}.`,
    `🎬 Улучшаю видео выше: тот же сюжет и персонажи, ${lengthLabel}.`);
  const asked = change ? ` ${tr(locale, `შენიშვნა: „${change}“.`, `Your note: “${change}”.`, `Пожелание: «${change}».`)}` : '';
  const next = tr(locale,
    'ვგეგმავ სცენებს — გადახედე სტორიბორდს და დააჭირე „ვიდეოს გენერაციას“. მანამდე თანხა არ ჩამოიჭრება.',
    'Planning the scenes — review the storyboard, then tap Generate Video. Nothing is charged before that.',
    'Планирую сцены — проверьте раскадровку и нажмите «Сгенерировать видео». До этого ничего не списывается.');
  return `${head}${asked}\n${next}`;
}

/** Agent G's card text for another take of a delivered talking avatar: the same line, face and frame, at its price. */
export function avatarRetakeText(creditsLabel: string, locale: string): string {
  return tr(locale,
    `ავატარს კიდევ ერთხელ გადავიღებ: იგივე ტექსტი, იგივე სახე და ფორმატი, ახალი დუბლი.\n**ფასი:** ${creditsLabel}.\n\nდავიწყო?`,
    `I’ll shoot the avatar again: the same line, face and frame, a new take.\n**Price:** ${creditsLabel}.\n\nShall I start?`,
    `Сниму аватара ещё раз: тот же текст, лицо и формат, новый дубль.\n**Цена:** ${creditsLabel}.\n\nНачать?`);
}

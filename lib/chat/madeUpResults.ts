/**
 * lib/chat/madeUpResults.ts — a chat reply never shows a result the studio did not make. Pure and client-safe.
 *
 * ⚠️ GG 2026-10-26 15:40Z: a video's extend reached the chat as words. The model answered „ღირებულება: 75 კრედიტი", and
 * after „კი" printed "[generated video: https://…/renders/video-clip/…/omni.mp4?token=…]" — a link it made up (it answered
 * 400; nothing was made, nothing charged). Those markers are what the studio writes into the history it sends the model
 * (lib/chat/historySerializer): a reply that writes one claims a result that does not exist. The prompt has no room for
 * another rule (lib/chat/platformPrompt's 5,000-character budget is full), so every such marker in a reply is replaced here
 * by a plain line saying so; one still streaming in is hidden until it is complete. The extend itself no longer reaches the
 * chat: „გააგრძელე" opens the clip's own card (components/studio/OmniStudio).
 */
type Lang = 'ka' | 'en' | 'ru';

const NOTICE: Record<Lang, string> = {
  ka: '⚠️ ჩატი თვითონ ვერაფერს ქმნის: ეს ბმული მოგონილი იყო, არაფერი შექმნილა და თანხა არ ჩამოგეჭრა.',
  en: '⚠️ The chat cannot make anything itself: that link was made up. Nothing was made and nothing was charged.',
  ru: '⚠️ Чат сам ничего не создаёт: эта ссылка выдумана. Ничего не создано, деньги не списаны.',
};

/** The studio's result marker (lib/chat/historySerializer HISTORY_MARKER_RE's `[generated …]` half). */
const RESULT_MARKER = /\[generated (?:image|video|audio|file|3D model)\b[^\]\n]{0,2200}\]/g;

/** A marker that has begun but not closed at the end of the text (a reply still streaming in). */
const OPEN_MARKER_AT_END = /\[(?:g(?:e(?:n(?:e(?:r(?:a(?:t(?:e(?:d(?: [^\]\n]{0,2200})?)?)?)?)?)?)?)?)?)?$/;

/** The reply with every studio marker it wrote replaced by the notice (once), and an unfinished one at its end left out. */
export function withoutMadeUpResults(text: string, locale: string): string {
  if (typeof text !== 'string' || !text.includes('[')) return text;
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  let said = false;
  const out = text.replace(RESULT_MARKER, () => {
    if (said) return '';
    said = true;
    return NOTICE[lang];
  });
  return out.replace(OPEN_MARKER_AT_END, '');
}

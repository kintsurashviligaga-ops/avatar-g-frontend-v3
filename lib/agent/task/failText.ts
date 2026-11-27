/**
 * lib/agent/task/failText.ts — the words an Agent G task card shows when a step or the whole task fails
 * (Phase 8.20 pre-flight, GG 2026-11-27).
 *
 * Before this, AutoTaskCard printed the raw reason after „ვერ შესრულდა": `llm_error`, `HTTP 502`, or a runner's English
 * message. When Vertex timed out or answered 500, a Georgian visitor read „ვერ შესრულდა: llm_error". Now:
 *   - Google/our server could not answer (llm_error, a timeout, an abort, HTTP 0 or 5xx) → "temporarily unavailable,
 *     try again in a minute" in the visitor's language;
 *   - a message already written in the visitor's script (Georgian for ka, Cyrillic for ru) is kept: the server wrote it
 *     for them;
 *   - anything else (English technical text) is dropped: the card says only that it failed. Never the server's own text.
 *
 * A task run itself charges nothing (each paid step is quoted and confirmed first), so the line does not mention credits.
 */
export type FailLang = 'ka' | 'en' | 'ru';

const UNAVAILABLE: Record<FailLang, string> = {
  ka: 'სერვისი დროებით მიუწვდომელია. სცადე ერთ წუთში.',
  en: 'The service is temporarily unavailable. Try again in a minute.',
  ru: 'Сервис временно недоступен. Попробуйте через минуту.',
};

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿ]/;
const CYRILLIC = /[Ѐ-ӿ]/;

/** Our server or Google did not answer: a model error, a timeout, an aborted fetch, no status or a 5xx. */
export function isUnavailable(message: string): boolean {
  const m = message.trim().toLowerCase();
  return (
    m === 'llm_error' ||
    /\bhttp (0|5\d\d)\b/.test(m) ||
    /time(d)?[ _-]?out|timeout|abort|network|fetch failed|unavailable|runner_failed|econnreset|\bstatus (5\d\d)\b/.test(m)
  );
}

/** The text after the card's „failed" word, or '' when the raw reason should not be shown. */
export function taskFailDetail(message: string | null | undefined, lang: FailLang): string {
  const m = (message ?? '').trim();
  if (!m) return '';
  if (lang === 'ka' && GEORGIAN.test(m)) return m;
  if (lang === 'ru' && CYRILLIC.test(m)) return m;
  if (isUnavailable(m)) return UNAVAILABLE[lang];
  if (lang === 'en' && !GEORGIAN.test(m) && !CYRILLIC.test(m) && !/[_{}<>]|^[a-z]+_[a-z_]+$/.test(m)) return m;
  return '';
}

/** The full stop line: „ვერ შესრულდა" alone, or followed by the detail. */
export function taskFailLine(failedWord: string, message: string | null | undefined, lang: FailLang): string {
  const d = taskFailDetail(message, lang);
  return d ? `${failedWord}: ${d}` : failedWord;
}

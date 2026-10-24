/**
 * lib/speech/locale.ts — the language a read is voiced in: the text's own, not the page's.
 *
 * ⚠️ ENGLISH AND RUSSIAN REPLIES WERE READ AS GEORGIAN (GG, production 2026-10-24: „robotic" in English and Russian).
 * Every reader passed the page's language, so on the Georgian studio an English or Russian reply went to the route as
 * `ka`: the voice verified for Georgian and no speechConfig.languageCode (app/api/tts/gemini). Since the chat now answers
 * in the language the user writes in (lib/chat/replyLocale), the page's language says little about the reply's.
 *
 * The rule, over the whole text once (so one read keeps one voice), with code and links removed:
 *   · Georgian or Cyrillic letters that make up at least a fifth of the letters decide it (the larger of the two): a
 *     Georgian sentence full of English product and code terms is still Georgian;
 *   · otherwise Latin letters make it English: an English reply that names "თბილისი" once stays English;
 *   · a text with no letters to speak of ("👍", "12:30", "?") keeps the page's language.
 * Pure and deterministic; bounded regexes.
 */
import type { SpeechLocale } from './contract';

const GEORGIAN_RE = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/g;
const CYRILLIC_RE = /[Ѐ-ӿ]/g;
const LATIN_RE = /[A-Za-z]/g;

/** Below this share of the letters, Georgian or Cyrillic is a quoted word in another language's text. */
const SCRIPT_SHARE = 0.2;
/** Fewer letters than this say nothing about the language. */
const MIN_LETTERS = 2;
/** Long enough to tell the language of any reply; the rest of a long text is not read for it. */
const SCAN_CHARS = 8_000;

const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

export function speechLocaleOf(text: string, fallback: SpeechLocale): SpeechLocale {
  const prose = String(text ?? '')
    .slice(0, SCAN_CHARS)
    .replace(/```[\s\S]{0,8000}?```/g, ' ')
    .replace(/`[^`\n]{0,2000}`/g, ' ')
    .replace(/\bhttps?:\/\/[^\s)]{1,2000}/gi, ' ');
  const ka = count(prose, GEORGIAN_RE);
  const ru = count(prose, CYRILLIC_RE);
  const en = count(prose, LATIN_RE);
  const total = ka + ru + en;
  if (total < MIN_LETTERS) return fallback;
  const script = Math.max(ka, ru);
  if (script >= MIN_LETTERS && script >= total * SCRIPT_SHARE) return ka >= ru ? 'ka' : 'ru';
  return en >= MIN_LETTERS ? 'en' : fallback;
}

/**
 * lib/voice/replyLanguage.ts — the language the user speaks in a Live call, named in every answer the app gives the model.
 *
 * ⚠️ GG 2026-10-26 11:34Z, the test link, the sarcastic persona: GG asked in Georgian („9,16 ფორმატის სურათი") and said
 * „კი" (heard in Georgian letters), but the call answered both in English. Each English reply came right after the app
 * spoke to the model in English: a function's answer (lib/agents/voice liveActions `{ ok, summary }`) or an [App] note
 * (components/voice/GeminiLiveConversation). The instruction's LIVE_LANGUAGE_LOCK says to keep the user's language, but
 * the model mirrors the last text it read. So the app now says it where the model reads it last: every function answer
 * carries `reply_in`, and every [App] note ends with the same line, once the user has said something in this call.
 * Georgian, English or Russian only (the call's three). Pure and isomorphic.
 */
import { isMisheardScript } from '@/lib/voice/heardScript';

export type CallLanguage = 'Georgian' | 'English' | 'Russian';

const GEORGIAN = /\p{Script=Georgian}/gu;
const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LATIN = /\p{Script=Latin}/gu;
/** Letters of an alphabet the call never speaks: Georgian the transcription mis-heard (lib/voice/heardScript). */
const OTHER = /(?![\p{Script=Georgian}\p{Script=Latin}\p{Script=Cyrillic}])\p{L}/gu;

/**
 * Words that make Latin letters English. ⚠️ Not every Latin word: a Georgian line also comes back in Latin letters
 * („da-adasture", GG 2026-10-26 07:13Z), so words a Georgian line can be heard as do not count: short ones that are Georgian
 * too (a, i, me, an „or", at, are), sounds and loanwords Georgian says as well (ok, okay, hi, hello, start, stop, video, foto).
 */
const ENGLISH_WORDS = new Set([
  'the', 'and', 'you', 'your', 'please', 'what', 'how', 'why', 'when', 'where', 'who', 'can', 'could', 'would', 'should',
  'will', 'make', 'want', 'need', 'picture', 'image', 'with', 'this', 'that', 'these', 'it', 'its', "it's", "i'm", "don't",
  "let's", 'not', 'of', 'for', 'from', 'about', 'yes', 'yeah', 'sure', 'thanks', 'thank', 'go', 'ahead', 'do', 'does',
  'was', 'were', 'have', 'has', 'my', 'some', 'one', 'more', 'again', 'now', 'tell', 'show', 'let', 'there', 'they', 'we',
  'in', 'on', 'to', 'cancel', 'wait',
]);

const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

function hasEnglishWord(text: string): boolean {
  for (const raw of text.toLowerCase().split(/[^\p{L}']+/u)) {
    const w = raw.replace(/^'+|'+$/gu, '');
    if (w && ENGLISH_WORDS.has(w)) return true;
  }
  return false;
}

/**
 * The language of what the user just said, or null when the words do not tell (no letters, or Latin letters with no
 * English word in them): the caller keeps the last language it knew.
 */
export function spokenLanguageOf(text: unknown): CallLanguage | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const ka = count(text, GEORGIAN) + (isMisheardScript(text) ? count(text, OTHER) : 0);
  const ru = count(text, CYRILLIC);
  const en = hasEnglishWord(text) ? count(text, LATIN) : 0;
  const best = Math.max(ka, ru, en);
  if (best === 0) return null;
  if (ka === best) return 'Georgian';
  return ru === best ? 'Russian' : 'English';
}

/** The line every app answer ends with, in English for the model: whatever it tells the user, it says in `lang`. */
export function replyLanguageNote(lang: CallLanguage): string {
  return `Say this to the user in ${lang}, the language they speak in this call, even though this is written in English.`;
}

/** An [App] note with the language line after it; unchanged while the user has not spoken a language yet. */
export function withReplyLanguage(note: string, lang: CallLanguage | null): string {
  return lang ? `${note}\n${replyLanguageNote(lang)}` : note;
}

/** Function answers, each carrying `reply_in` (an answer that already names one keeps it); unchanged without a language. */
export function withReplyLanguageField<T extends { response: Record<string, unknown> }>(
  responses: readonly T[], lang: CallLanguage | null,
): T[] {
  if (!lang) return [...responses];
  return responses.map((r) => {
    const body = r.response;
    if (!body || typeof body !== 'object' || Array.isArray(body) || 'reply_in' in body) return r;
    return { ...r, response: { ...body, reply_in: replyLanguageNote(lang) } };
  });
}

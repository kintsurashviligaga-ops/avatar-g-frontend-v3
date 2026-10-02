/**
 * lib/voice/speechLang.ts — WHICH LANGUAGE THE USER SPEAKS, for the mic (dictation, the voice-call loop).
 *
 * The mic used to take its language from the UI locale alone: an English-UI user speaking Georgian got Chrome's
 * en-US recognizer (English gibberish), and the server's Gemini pass was told "Transcribe this audio in English" —
 * a translation, not a transcript. Now the language comes from what the user actually does:
 *
 *   1. the user's latest TYPED message, when it is written in a native script (Georgian → ka-GE, Cyrillic → ru-RU).
 *      Latin text is no signal: Georgians often type Latin ("gamarjoba") but speak Georgian;
 *   2. the language the server HEARD on an earlier clip (`language` in /api/voice/transcribe's answer), remembered
 *      in this browser;
 *   3. the UI locale when it is Georgian (the market default, and the server's strict Georgian-script check);
 *   4. otherwise 'auto': the recorder path, where Gemini identifies the language itself. Its answer is remembered
 *      (2), so the next dictation can use the instant Web Speech engine in that language.
 *
 * Pure apart from the two storage helpers, which never throw (private mode, blocked storage).
 */

export type SpeechLang = 'ka-GE' | 'en-US' | 'ru-RU';
/** What the mic asks the transcribe route for: a known language, or 'auto' (the engine identifies it). */
export type SttRequestLang = SpeechLang | 'auto';

export const SPEECH_LANG_KEY = 'myavatar:speech-lang';

const SPEECH_LANGS: readonly SpeechLang[] = ['ka-GE', 'en-US', 'ru-RU'];

export function isSpeechLang(v: unknown): v is SpeechLang {
  return typeof v === 'string' && (SPEECH_LANGS as readonly string[]).includes(v);
}

function counts(text: string): { georgian: number; cyrillic: number; latin: number } {
  const s = typeof text === 'string' ? text : '';
  return {
    georgian: (s.match(/[Ⴀ-ჿᲐ-Ჿ]/g) || []).length,
    cyrillic: (s.match(/[Ѐ-ӿ]/g) || []).length,
    latin: (s.match(/[A-Za-z]/g) || []).length,
  };
}

/**
 * The language a TRANSCRIPT is written in, from its script. A native script (≥2 letters) wins over any amount of
 * Latin — a brand name ("გახსენი Instagram") rides inside native speech all the time. null = no decisive letters.
 */
export function transcriptSpeechLang(text: string | null | undefined): SpeechLang | null {
  const { georgian, cyrillic, latin } = counts(text ?? '');
  if (Math.max(georgian, cyrillic) >= 2) return georgian >= cyrillic ? 'ka-GE' : 'ru-RU';
  if (latin >= 2) return 'en-US';
  return null;
}

/** Only an unambiguous native script counts in TYPED text (Latin is often transliterated Georgian). */
export function typedSpeechLang(text: string | null | undefined): SpeechLang | null {
  const lang = transcriptSpeechLang(text);
  return lang === 'ka-GE' || lang === 'ru-RU' ? lang : null;
}

export function loadLearnedSpeechLang(): SpeechLang | null {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(SPEECH_LANG_KEY) : null;
    return isSpeechLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLearnedSpeechLang(lang: SpeechLang): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(SPEECH_LANG_KEY, lang);
  } catch {
    /* a convenience; the next clip simply asks again */
  }
}

/** The order in the header: typed native script → heard before → Georgian UI → auto. */
export function resolveSpeechLang(input: {
  locale?: string | null;
  typed?: SpeechLang | null;
  learned?: SpeechLang | null;
}): SttRequestLang {
  if (input.typed) return input.typed;
  if (input.learned) return input.learned;
  const l = input.locale;
  if (l !== 'en' && l !== 'ru') return 'ka-GE';
  return 'auto';
}

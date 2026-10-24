/**
 * Whether a transcription leg's answer may be ACCEPTED, or whether the cascade must keep going.
 *
 * ⚠️ THE BUG THIS EXISTS FOR. /api/voice/transcribe tries three engines and advances only on
 * empty-or-throw: `if (!text && ...)`. That is "first non-empty string wins", and it assumes a wrong
 * answer arrives as an error. For Georgian it does not.
 *
 * The only engine in that chain with real Georgian ASR is Replicate whisper-large-v3, and it is LAST.
 * Ahead of it sit OpenAI gpt-4o-mini-transcribe (Georgian is not in its supported-language list) and a
 * Gemini LLM prompted to transcribe. Neither fails loudly on Georgian — they return HTTP 200 with a
 * confident, fluent, WRONG string: a Latin transliteration, an English rendering, or a plausible
 * paraphrase. That string is non-empty, so `!text` is false and the one engine that could have done the
 * job is never reached. English never exposes this because all three engines are competent at English,
 * so whichever answers first is right.
 *
 * The check is deliberately about SCRIPT, not accuracy. We cannot tell a good Georgian transcript from a
 * mediocre one, but we can tell Georgian from not-Georgian with certainty — and every failure mode above
 * produces text with no Mkhedruli in it at all. That makes this a cheap, total discriminator for exactly
 * the case that breaks, and a no-op for every other language.
 *
 * Since MASTER TASK v3.1 Gemini is the only engine, so there is no cascade left to keep going: see acceptTranscript for
 * what the 'ka-GE' check still refuses, and why it no longer refuses English.
 */

import { ownLocaleForText } from '@/lib/chat/replyLocale';

/** Mkhedruli, Asomtavruli and Nuskhuri — the Georgian block. */
const GEORGIAN_RE = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;

export function hasGeorgianScript(text: string | null | undefined): boolean {
  return typeof text === 'string' && GEORGIAN_RE.test(text);
}

const CYRILLIC_RE = /[Ѐ-ӿ].*[Ѐ-ӿ]/s;

/**
 * The model talking ABOUT the audio instead of transcribing it: a refusal ("I'm sorry, I can't transcribe this audio.")
 * or a label for silence ("[silence]", "(inaudible)", "No speech detected."). It is never what anyone said, in any
 * language. Anchored to the whole answer (labels) or to its start and to transcribing or the lack of speech (refusals),
 * so dictated speech that merely mentions audio ("I can't hear the audio on my laptop") is kept.
 */
const SILENCE_LABEL_RE = /^[[(]?\s{0,4}(?:silence|no speech(?: detected)?|inaudible|unintelligible|music|noise|background noise)\s{0,4}[\])]?[.!]?$/i;
const REFUSAL_RE = /^(?:i'?m sorry|i am sorry|sorry|unfortunately|i (?:cannot|can'?t|am unable to)|i'm unable to)\b[^\n]{0,160}?(?:\btranscri\w{0,8}|\bno (?:audible |discernible |clear )?speech\b|\b(?:audio|recording) (?:is|was|seems) (?:silent|empty|blank)\b)/i;

export function isNotATranscript(text: string): boolean {
  const t = text.trim();
  return SILENCE_LABEL_RE.test(t) || REFUSAL_RE.test(t);
}

/**
 * True when this leg's output is good enough to stop the cascade.
 *
 * Every language: an empty answer, a refusal or a silence label is a miss.
 *
 * 'ka-GE' — the language where a leg lied fluently instead of failing — also refuses Georgian or Russian written in
 * Latin letters ("gamarjoba rogor xar", "privet kak dela"): that is the transliteration failure above, never how
 * Gemini writes either language when it hears it. Georgian, Cyrillic (a RUSSIAN speaker in a Georgian session,
 * transcribed as spoken) and any other Latin text are accepted.
 *
 * ⚠️ LATIN WAS REFUSED OUTRIGHT, AND ENGLISH SPEECH VANISHED (GG, production 2026-10-24: "it writes neither Georgian,
 * nor English, nor Russian"). The rule was made for the old cascade, where a refusal moved on to Replicate's
 * whisper-large-v3, the one leg with real Georgian. The cascade is gone (MASTER TASK v3.1, audit F-04): Gemini is
 * the whole engine, so refusing its answer only dropped what an English speaker said in a Georgian session, after
 * paying for it. The trade: an English answer to Georgian speech (the "English rendering" above) is kept too. It is
 * now visible in the box, where the user sees it and can delete it, instead of a silent miss after every English
 * sentence. Transliteration, the failure we can tell from real speech, is still refused.
 */
export function acceptTranscript(text: string | null | undefined, language: string): boolean {
  const t = (text ?? '').trim();
  if (!t || isNotATranscript(t)) return false;
  if (language !== 'ka-GE') return true;
  if (hasGeorgianScript(t) || CYRILLIC_RE.test(t)) return true;
  const own = ownLocaleForText(t.replace(/^["'“„«]+|["'”»]+$/g, ''), 'ka');
  return own !== 'ka' && own !== 'ru';
}

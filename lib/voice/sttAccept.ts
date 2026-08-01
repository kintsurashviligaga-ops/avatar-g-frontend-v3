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
 */

/** Mkhedruli, Asomtavruli and Nuskhuri — the Georgian block. */
const GEORGIAN_RE = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;

export function hasGeorgianScript(text: string | null | undefined): boolean {
  return typeof text === 'string' && GEORGIAN_RE.test(text);
}

/**
 * True when this leg's output is good enough to stop the cascade.
 *
 * Non-Georgian requests keep today's behaviour exactly: any non-empty string is accepted. Only 'ka-GE'
 * gains the extra requirement, because it is the only language where a leg lies fluently instead of
 * failing.
 */
export function acceptTranscript(text: string | null | undefined, language: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (language !== 'ka-GE') return true;
  return hasGeorgianScript(t);
}

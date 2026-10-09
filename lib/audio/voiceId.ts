/**
 * An ElevenLabs voice id that is safe to put in a provider URL path: 1–64 letters and digits (ElevenLabs issues 20).
 *
 * ⚠️ Several routes take the voice from the request body and build `…/v1/text-to-speech/${voiceId}` with the platform's
 * `xi-api-key`. Unchecked, `../` or `?` in that value moved the POST to another ElevenLabs endpoint (fetch resolves the
 * dot segments), and the TTS route streamed whatever came back to the caller. An id that fails this check never
 * reaches a fetch.
 */
const VOICE_ID_RE = /^[A-Za-z0-9]{1,64}$/;

export function isElevenLabsVoiceId(value: unknown): value is string {
  return typeof value === 'string' && VOICE_ID_RE.test(value);
}

/**
 * What a request asked for: `undefined` when it named no voice (absent, null or blank), the trimmed id when it is
 * well-formed, `null` when it named something that is not a voice id (the route answers 400).
 */
export function requestedVoiceId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id) return undefined;
  return isElevenLabsVoiceId(id) ? id : null;
}

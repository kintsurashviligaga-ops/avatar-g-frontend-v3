/**
 * lib/speech/contract.ts — the speech contract, version 1 (MASTER TASK v3.1 §5.1).
 *
 * One request/response shape for every text-to-speech read the app plays: the chat speaker icon (OmniStudio), the old
 * chat screens (lib/audio/premium-tts) and the voice call (VoiceConversation) all post to /api/tts/gemini. Live native
 * audio is NOT on this contract: it is its own real-time transport (components/voice/live/useGeminiLiveSession) and
 * never asks for TTS.
 *
 * Pure: no I/O, no DOM, no Node-only API, so the route, the browser player and the tests share it.
 */

/** Bumped when the request or the audio it answers changes shape. A cached read carries the version it was made under. */
export const SPEECH_CONTRACT_VERSION = 1 as const;

export type SpeechLocale = 'ka' | 'en' | 'ru';

/**
 * How the route speaks a text with a given model and voice: the directive it prepends, the language codes it sends,
 * the voice it maps a locale to. Bumped when any of those changes, so the browser's replay cache (lib/speech/cache)
 * stops replaying audio made the old way.
 */
export const SPEECH_PACING_VERSION = 1 as const;

/**
 * The X-Speech-Pacing value for audio made with `languageCode` (undefined: the model detected the language itself, as
 * it always does for Georgian). E.g. "1;lang=en-US", "1;lang=auto".
 */
export function speechPacing(languageCode?: string): string {
  return `${SPEECH_PACING_VERSION};lang=${languageCode || 'auto'}`;
}

/** The most characters one request may carry. The client splits a longer message into chunks below it. */
export const SPEECH_MAX_CHARS = 2000;

/** What the route answers with: one complete WAV, signed 16-bit little-endian PCM. */
export const SPEECH_RESPONSE_MIME = 'audio/wav';

/** Response headers that describe the audio. Values are plain decimal numbers or names; never a token or the text. */
export const SPEECH_HEADERS = {
  contract: 'X-Speech-Contract',
  sampleRate: 'X-Speech-Sample-Rate',
  channels: 'X-Speech-Channels',
  /** Sample frames in the WAV's data chunk (one frame = one sample per channel). Duration = frames / sample rate. */
  frames: 'X-Speech-Frames',
  model: 'X-Speech-Model',
  voice: 'X-Voice-Name',
  /** How the audio was made: speechPacing(the language code the answering call carried). */
  pacing: 'X-Speech-Pacing',
} as const;

/**
 * What made an answer's audio, from its headers: contract, pacing, model, voice and PCM layout, e.g.
 * "c1|p1;lang=auto|gemini-2.5-flash-preview-tts|Aoede|24000x1". Two answers with the same profile were made the same
 * way, so the replay cache (lib/speech/cache) keys on it. Null when a header is missing or the contract is another
 * version: such audio is played but never kept.
 */
export function speechProfile(headers: { get(name: string): string | null } | null | undefined): string | null {
  if (!headers) return null;
  const contract = headers.get(SPEECH_HEADERS.contract);
  const parts = [
    headers.get(SPEECH_HEADERS.pacing),
    headers.get(SPEECH_HEADERS.model),
    headers.get(SPEECH_HEADERS.voice),
    headers.get(SPEECH_HEADERS.sampleRate),
    headers.get(SPEECH_HEADERS.channels),
  ];
  if (contract !== String(SPEECH_CONTRACT_VERSION) || parts.some((v) => !v || v.includes('|'))) return null;
  const [pacing, model, voice, rate, channels] = parts as string[];
  return `c${contract}|p${pacing}|${model}|${voice}|${rate}x${channels}`;
}

export function normalizeSpeechLocale(raw: unknown): SpeechLocale {
  return raw === 'en' || raw === 'ru' ? raw : 'ka';
}

/** The PCM layout a provider declared for its audio bytes. */
export interface PcmLayout {
  sampleRate: number;
  channels: number;
}

/**
 * The layout a provider's audio mimeType declares, or null when it is not raw 16-bit PCM.
 *
 * Gemini TTS labels its inline audio `audio/L16;codec=pcm;rate=24000` (RFC 2586 L16: signed 16-bit). Some versions say
 * `audio/pcm;rate=24000`. A mimeType with no rate, or a rate that is not a whole number in 8–96 kHz, is not trusted:
 * guessing a rate is how audio comes out too fast or too slow. `channels` defaults to 1 (RFC 2586's default).
 *
 * ⚠️ RFC 2586 L16 is network (big-endian) byte order, but Gemini sends little-endian samples under that label: Google's
 * own TTS sample code writes these bytes into a WAV file unchanged (WAV is little-endian), and the read-aloud has
 * played them that way since it was first verified live. This contract follows the bytes, not the RFC. If the pinned
 * model changes, check the byte order against real bytes before trusting this again.
 */
export function pcmLayoutFromMime(mimeType: unknown): PcmLayout | null {
  if (typeof mimeType !== 'string') return null;
  const [type, ...params] = mimeType.split(';').map((s) => s.trim().toLowerCase());
  if (type !== 'audio/l16' && type !== 'audio/pcm') return null;
  let sampleRate: number | null = null;
  let channels = 1;
  for (const p of params) {
    const [k, v] = p.split('=').map((s) => s.trim());
    if (k === 'rate') sampleRate = /^\d+$/.test(v ?? '') ? Number(v) : NaN;
    if (k === 'channels') channels = /^\d+$/.test(v ?? '') ? Number(v) : NaN;
    if (k === 'codec' && v !== 'pcm') return null;
  }
  if (sampleRate === null || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) return null;
  if (!Number.isInteger(channels) || channels < 1 || channels > 2) return null;
  return { sampleRate, channels };
}

/** True for a mimeType that says the bytes are already a WAV file (so they must not be wrapped again). */
export function isWavMime(mimeType: unknown): boolean {
  if (typeof mimeType !== 'string') return false;
  const type = mimeType.split(';')[0]!.trim().toLowerCase();
  return type === 'audio/wav' || type === 'audio/x-wav' || type === 'audio/wave' || type === 'audio/vnd.wave';
}

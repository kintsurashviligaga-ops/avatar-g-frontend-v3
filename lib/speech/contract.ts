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
} as const;

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

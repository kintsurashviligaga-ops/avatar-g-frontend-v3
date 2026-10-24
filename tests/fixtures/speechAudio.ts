/**
 * Deterministic audio fixtures for the speech contract (lib/speech, MASTER TASK v3.1 §5.2).
 *
 * Every byte comes from integer arithmetic (a triangle wave), so a fixture is identical on every machine, in Node and
 * in a browser, and no recording is checked in. Jest uses these for the WAV/route checks; the Playwright speech specs
 * serve them through a mocked /api/tts/gemini, so no test ever calls a provider or spends money.
 *
 * These prove bytes, order and duration. They say nothing about how a voice sounds: pacing and naturalness need the
 * owner's authorised listening samples (Phase 4 plan, decision 1).
 */
import { wrapPcm16 } from '../../lib/speech/wav';

export interface ToneSpec {
  channels: 1 | 2;
  frames: number;
  /** Samples per triangle period. A different period per fixture makes a swapped or reordered chunk visible. */
  period?: number;
  /** Peak, at most 32767. */
  peak?: number;
}

/** Signed 16-bit little-endian PCM of a triangle wave. Channel 2 (if any) is the inverse of channel 1. */
export function pcm16Tone({ channels, frames, period = 120, peak = 8000 }: ToneSpec): Uint8Array {
  const out = new Uint8Array(frames * channels * 2);
  const dv = new DataView(out.buffer);
  const half = period / 2;
  for (let i = 0; i < frames; i++) {
    const p = i % period;
    // -peak → peak → -peak over one period, in whole numbers.
    const tri = p < half ? Math.round(((2 * p) / half - 1) * peak) : Math.round((3 - (2 * p) / half) * peak);
    dv.setInt16(i * channels * 2, tri, true);
    if (channels === 2) dv.setInt16(i * 4 + 2, -tri, true);
  }
  return out;
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

export const L16_24K = 'audio/L16;codec=pcm;rate=24000';

/** One second of 24 kHz mono, as Gemini TTS labels it. */
export const MONO_24K = pcm16Tone({ channels: 1, frames: 24000, period: 120 });
/** Half a second of 16 kHz mono. */
export const MONO_16K = pcm16Tone({ channels: 1, frames: 8000, period: 80 });
/** A quarter second of 24 kHz stereo. */
export const STEREO_24K = pcm16Tone({ channels: 2, frames: 6000, period: 96 });

/** A complete WAV of MONO_24K (what a model that answers in WAV would send). */
export const WAV_MONO_24K = wrapPcm16(MONO_24K, { sampleRate: 24000, channels: 1 });
/** The fault a blind wrapper makes: a WAV wrapped again, so its header becomes 22 "samples" (a click). */
export const WAV_DOUBLE_WRAPPED = wrapPcm16(WAV_MONO_24K, { sampleRate: 24000, channels: 1 });
/** A WAV whose last 1,000 bytes never arrived: the header still claims all of them. */
export const WAV_TRUNCATED = WAV_MONO_24K.subarray(0, WAV_MONO_24K.length - 1000);
/** PCM that ends half-way through a sample. */
export const PCM_ODD_BYTES = (() => {
  const b = new Uint8Array(MONO_24K.length + 1);
  b.set(MONO_24K);
  return b;
})();

/** The same 1.2 s of 24 kHz mono, split into three inline parts of 0.3 s, 0.5 s and 0.4 s with distinct periods. */
export const MULTI_PART_24K = [
  pcm16Tone({ channels: 1, frames: 7200, period: 100 }),
  pcm16Tone({ channels: 1, frames: 12000, period: 140 }),
  pcm16Tone({ channels: 1, frames: 9600, period: 180 }),
] as const;

export type GeminiPart = { pcm: Uint8Array; mimeType: string } | { text: string };

/** A generateContent body the way Gemini TTS answers, with the given parts in order. */
export function geminiAudioBody(parts: GeminiPart[], usage?: Record<string, number>): Record<string, unknown> {
  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts: parts.map((p) => ('text' in p ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: b64(p.pcm) } })),
        },
        finishReason: 'STOP',
      },
    ],
    ...(usage ? { usageMetadata: usage } : {}),
  };
}

/** The same body as a fetch Response (status 200). */
export function geminiAudioResponse(parts: GeminiPart[], usage?: Record<string, number>): Response {
  return new Response(JSON.stringify(geminiAudioBody(parts, usage)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

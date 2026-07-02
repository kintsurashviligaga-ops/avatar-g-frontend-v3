import 'server-only';

/**
 * ElevenLabs with-timestamps TTS — STEP 2.3/2.6. Calls
 * POST /v1/text-to-speech/{voice_id}/with-timestamps and returns the audio + the
 * character-level `alignment` (the exact shape word-synced captions consume). Routed
 * through the shared EL concurrency gate + bounded retry; defensive (returns null on any
 * miss). This is the ONLY source of REAL word timings — never estimate.
 */
import { withElevenLabsSlot } from './concurrency';
import { withRetry } from '@/lib/utils/withRetry';
import type { ElevenAlignment } from '@/lib/pipeline/compositing/word-synced-captions';

const endpoint = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`;

export interface TtsTimestampsResult {
  audioBase64: string;
  contentType: string;
  alignment: ElevenAlignment;
}

/** True when the parsed body has the with-timestamps alignment shape we depend on. */
export function isElevenAlignment(a: unknown): a is ElevenAlignment {
  const o = a as ElevenAlignment | undefined;
  return Boolean(
    o &&
      Array.isArray(o.characters) &&
      Array.isArray(o.character_start_times_seconds) &&
      Array.isArray(o.character_end_times_seconds) &&
      o.characters.length > 0,
  );
}

export async function synthesizeWithTimestamps(
  text: string,
  voiceId: string,
  opts?: { modelId?: string; stability?: number; signal?: AbortSignal },
): Promise<TtsTimestampsResult | null> {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!key || !text.trim() || !voiceId) return null;
  try {
    return await withRetry(
      () =>
        withElevenLabsSlot(async () => {
          const res = await fetch(endpoint(voiceId), {
            method: 'POST',
            headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              text: text.slice(0, 2000),
              model_id: opts?.modelId ?? 'eleven_multilingual_v2',
              voice_settings: { stability: opts?.stability ?? 0.48, similarity_boost: 0.8 },
            }),
            ...(opts?.signal ? { signal: opts.signal } : {}),
          });
          if (!res.ok) {
            throw new Error(`ElevenLabs with-timestamps ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
          }
          const j = (await res.json()) as { audio_base64?: string; alignment?: unknown };
          if (!j.audio_base64 || !isElevenAlignment(j.alignment)) {
            throw new Error('ElevenLabs with-timestamps: missing audio_base64 or alignment');
          }
          return { audioBase64: j.audio_base64, contentType: 'audio/mpeg', alignment: j.alignment };
        }),
      { maxAttempts: 2, baseDelayMs: 1500, label: 'el-tts-timestamps' },
    );
  } catch {
    return null;
  }
}

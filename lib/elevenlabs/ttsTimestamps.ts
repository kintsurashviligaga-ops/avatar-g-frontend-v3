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

/**
 * Default with-timestamps model. `eleven_multilingual_v2` is reliable + supports with-timestamps,
 * but reads Georgian with an accent (ka is not in its official language list). To switch, set the
 * ELEVENLABS_TTS_MODEL env var (global) or pass opts.modelId (per-call) — a clean config flip, no
 * code change. See NOTES_TTS_GEORGIAN.md for the ka-capable alternatives.
 */
export const DEFAULT_TTS_MODEL = 'eleven_multilingual_v2';

/** Resolve the model id: per-call override → ELEVENLABS_TTS_MODEL env → default. */
export function resolveTtsModel(override?: string): string {
  return (override || '').trim() || (process.env.ELEVENLABS_TTS_MODEL || '').trim() || DEFAULT_TTS_MODEL;
}

export interface TtsTimestampsResult {
  audioBase64: string;
  contentType: string;
  alignment: ElevenAlignment;
}

/** Outcome carrying the real failure reason (so the route can surface WHY, not a blank 502). */
export type TtsTimestampsOutcome =
  | ({ ok: true } & TtsTimestampsResult)
  | { ok: false; error: string };

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
): Promise<TtsTimestampsOutcome> {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'missing ELEVENLABS_API_KEY' };
  if (!text.trim()) return { ok: false, error: 'empty text' };
  if (!voiceId) return { ok: false, error: 'missing voiceId' };
  try {
    const result = await withRetry(
      () =>
        withElevenLabsSlot(async () => {
          const res = await fetch(endpoint(voiceId), {
            method: 'POST',
            headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              text: text.slice(0, 2000),
              model_id: resolveTtsModel(opts?.modelId),
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
    return { ok: true, ...result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // Surface the reason (EL status/message — never the key) so the caller can report WHY.
    console.error('[el-tts-timestamps] failed:', error);
    return { ok: false, error };
  }
}

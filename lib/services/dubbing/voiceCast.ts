/**
 * lib/services/dubbing/voiceCast.ts — which voice reads which part (dubbing leg 4).
 *
 * A LEAF module on purpose. This lives outside dubbingPipeline because the pipeline imports the job store,
 * which imports Supabase, which is ESM that jest cannot parse — pulling the casting rules into a leaf keeps
 * them directly testable. Type-only imports carry no runtime edge.
 */
import type { DubbingSegment } from './dubbingPlan';

/**
 * Assign a voice per diarized speaker. Two cloned Georgian voices are configured platform-wide; beyond two
 * speakers they alternate, which still beats one voice reading every part.
 *
 * `override` means "read the whole thing in this voice" and is honoured exactly — including for segments
 * diarization never labelled.
 */
export function assignVoices(segments: readonly DubbingSegment[], override?: string | null): Map<string, string> {
  const female = (process.env.ELEVENLABS_VOICE_ID_FEMALE || '').trim();
  const male = (process.env.ELEVENLABS_VOICE_ID_MALE || '').trim();
  const pool = [female, male].filter(Boolean);
  const fallback = override?.trim() || pool[0] || (process.env.ELEVENLABS_VOICE_ID || '').trim();

  const map = new Map<string, string>();
  if (override?.trim()) {
    for (const s of segments) map.set(s.speaker ?? '_', override.trim());
    return map;
  }
  const speakers = [...new Set(segments.map((s) => s.speaker ?? '_'))];
  speakers.forEach((sp, i) => map.set(sp, (pool.length ? pool[i % pool.length] : fallback) ?? fallback));
  return map;
}

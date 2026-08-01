import 'server-only';
import { createPrediction, pollUntilDone } from '@/lib/replicate/client';

/**
 * Separate an instrumental (music + ambience, voices removed) stem from a source's audio.
 *
 * ⚠️ WHY DUBBING NEEDS THIS. The dub mix laid the new voice over a bed that was the ORIGINAL AUDIO
 * merely ducked by 14dB — dubbingFfmpeg says so in its own header: "this repo has no source-separation
 * stem splitter, so the music/ambience bed is the ORIGINAL audio DUCKED, not an instrumental stem. The
 * original voices stay faintly present underneath the dub (the 'UN interpreter' sound)."
 *
 * −14dB is quiet, not absent. Two people speaking different languages at once is exactly what the
 * product sounded like, and no amount of ducking fixes it: duck harder and the music dies with the
 * voices, because they are the same signal. The only real fix is to separate them, which is what this
 * does. That same header names the insertion point — "wiring a separator later only changes `bedUrl`".
 *
 * The capability was already here and already proven: /api/ai/edit-audio runs this exact Demucs model
 * for its vocal-isolation and splitter tools, including the instrumental-stem key list below. It was
 * simply never reachable from the dubbing pipeline. This module is that missing wire, not new science.
 *
 * ⚠️ NEVER THROWS, AND RETURNS null ON EVERY MISS. The caller must fall back to its current bed. A dub
 * that ships with the old ducked bed is the product as it stands today; a dub that fails outright
 * because a separator was unavailable would be a regression introduced by an improvement.
 */

/** Demucs on Replicate. Bare slug → latest version; env-overridable. Same default as /api/ai/edit-audio. */
const DEMUCS_MODEL = (process.env.REPLICATE_DEMUCS_MODEL || 'ryan5453/demucs').trim();

/**
 * Demucs names the no-vocals stem differently across versions, so every known key is tried. Mirrors the
 * list in /api/ai/edit-audio — kept identical on purpose: if one place learns a new key, the other is
 * wrong, and a silently-missed stem here degrades to the old bed with nothing to show why.
 */
const INSTRUMENTAL_KEYS = ['no_vocals', 'other', 'accompaniment', 'instrumental'] as const;

function pickStem(output: unknown, keys: readonly string[]): string | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

export interface InstrumentalResult {
  /** Provider URL of the instrumental stem. Callers should re-host if they need durability. */
  url: string;
  model: string;
}

/**
 * @param sourceUrl a public/signed http(s) URL to the audio or video whose bed is wanted.
 * @param maxPollMs total budget. Demucs on a full track takes tens of seconds — /api/ai/edit-audio
 *        polls 120×2s for exactly this reason, after a single poll made it fail every time.
 */
export async function extractInstrumentalStem(
  sourceUrl: string,
  maxPollMs = 240_000,
): Promise<InstrumentalResult | null> {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;
  if (!(process.env.REPLICATE_API_TOKEN || '').trim()) return null;
  try {
    const created = await createPrediction(DEMUCS_MODEL, { audio: sourceUrl });
    let out = created;
    if (created.status !== 'succeeded' && created.status !== 'failed') {
      // Same cadence as the audio studio: 2s intervals, bounded by the caller's budget.
      out = await pollUntilDone(created.id, Math.max(1, Math.floor(maxPollMs / 2000)), 2000);
    }
    if (out.status !== 'succeeded') return null;
    const url = pickStem(out.output, INSTRUMENTAL_KEYS);
    return url ? { url, model: DEMUCS_MODEL } : null;
  } catch {
    return null;
  }
}

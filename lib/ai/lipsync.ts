import 'server-only';

/**
 * Wav2Lip lip-sync — the OPT-IN, FAIL-OPEN final pass for a music film.
 *
 * When the user toggles lip-sync on, the finished 30-second master is run through
 * a Wav2Lip model on Replicate (the SAME REPLICATE_API_TOKEN the video pipeline
 * already uses — no new operator secret) with the soundtrack/vocal as the driver:
 * the model finds a face per frame and keys ONLY the mouth region to the audio,
 * leaving wide / drone / faceless frames essentially untouched.
 *
 * This is deliberately experimental and isolated: lip-sync quality on
 * AI-generated faces is uneven, so EVERYTHING here is fail-OPEN — any error, a
 * missing token, a model timeout, an empty result → returns null, and the caller
 * simply keeps the original (already-perfect) master. Lip-sync can only ever make
 * the film better, never break it.
 *
 * The model is the model-LATEST endpoint (no pinned version hash that can go
 * stale); override the model or the input field names via env if needed.
 */

// `owner/name` — runs the model's latest version via /v1/models/{model}/predictions.
const LIPSYNC_MODEL = (process.env.LIPSYNC_REPLICATE_MODEL || 'devxpy/cog-wav2lip').trim();
// Wav2Lip input field names differ slightly between forks; keep them overridable.
const FACE_FIELD = (process.env.LIPSYNC_FACE_FIELD || 'face').trim();
const AUDIO_FIELD = (process.env.LIPSYNC_AUDIO_FIELD || 'audio').trim();

interface ReplicatePrediction {
  id?: string;
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string | null;
  urls?: { get?: string };
}

function token(): string {
  return String(process.env.REPLICATE_API_TOKEN || '').trim();
}

/** True when the Wav2Lip pass can run (the shared Replicate token is present). */
export function hasLipsyncProvider(): boolean {
  return token().length > 0;
}

/** Pull the first usable URL out of whatever shape the model returned. */
function extractUrl(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const first = output.find((o) => typeof o === 'string' && o);
    return typeof first === 'string' ? first : '';
  }
  if (output && typeof output === 'object') {
    const o = output as { output?: unknown; video?: unknown; url?: unknown };
    return extractUrl(o.output ?? o.video ?? o.url ?? '');
  }
  return '';
}

/**
 * Lip-sync `videoUrl` to `audioUrl`. Returns the synced video URL, or NULL on any
 * failure (the caller keeps the original master). Bounded so it never hangs the
 * request beyond the route budget.
 */
export async function lipsyncVideo(videoUrl: string, audioUrl: string): Promise<string | null> {
  const key = token();
  if (!key || !videoUrl || !audioUrl) return null;

  try {
    const createRes = await fetch(`https://api.replicate.com/v1/models/${LIPSYNC_MODEL}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ input: { [FACE_FIELD]: videoUrl, [AUDIO_FIELD]: audioUrl } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!createRes.ok) return null;

    let pred = (await createRes.json().catch(() => ({}))) as ReplicatePrediction;
    const pollUrl = pred.urls?.get || (pred.id ? `https://api.replicate.com/v1/predictions/${pred.id}` : '');
    if (!pollUrl) return null;

    // Wav2Lip on a 30s clip runs ~30–90s; poll within a bounded budget.
    const deadline = Date.now() + 200_000;
    while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
      if (Date.now() > deadline) return null;
      await new Promise((r) => setTimeout(r, 2500));
      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${key}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!pollRes.ok) continue; // transient — keep polling until the deadline
      pred = (await pollRes.json().catch(() => pred)) as ReplicatePrediction;
    }

    if (pred.status !== 'succeeded') return null;
    const url = extractUrl(pred.output).trim();
    return url || null;
  } catch {
    return null; // FAIL-OPEN — the caller keeps the original master
  }
}

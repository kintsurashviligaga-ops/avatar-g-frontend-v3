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
 * cog-wav2lip is a COMMUNITY model, so predictions run via /v1/predictions with a
 * PINNED version hash — the /v1/models/{model}/predictions "latest" endpoint is
 * official-models-only and 404s here. Model, version and input field names are all
 * env-overridable if the model is updated or swapped.
 */

// SadTalker (image + audio → talking head). Switched from devxpy/cog-wav2lip, whose
// Replicate container stopped booting (predictions stuck in "starting" indefinitely
// → every lip-sync silently timed out). SadTalker is purpose-built for the talking
// PHOTO/character case and boots reliably. Model/version/fields are env-overridable.
const LIPSYNC_MODEL = (process.env.LIPSYNC_REPLICATE_MODEL || 'lucataco/sadtalker').trim();
const LIPSYNC_VERSION = (process.env.LIPSYNC_REPLICATE_VERSION || '85c698db7c0a66d5011435d0191db323034e1da04b912a6d365833141b6a285b').trim();
// SadTalker fields: source_image + driven_audio (was face/audio on wav2lip).
const FACE_FIELD = (process.env.LIPSYNC_FACE_FIELD || 'source_image').trim();
const AUDIO_FIELD = (process.env.LIPSYNC_AUDIO_FIELD || 'driven_audio').trim();

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

/**
 * Names-only readiness snapshot for the lipsync wiring — never returns the token
 * value, only whether it is present + which model the toggle will hit. Surfaced
 * via GET /api/video/lipsync so the wiring can be verified without a paid render.
 */
export function lipsyncStatus(): { ready: boolean; model: string; version: string; faceField: string; audioField: string } {
  return { ready: hasLipsyncProvider(), model: LIPSYNC_MODEL, version: LIPSYNC_VERSION, faceField: FACE_FIELD, audioField: AUDIO_FIELD };
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
export async function lipsyncVideo(videoUrl: string, audioUrl: string, _resizeFactor = 1): Promise<string | null> {
  const key = token();
  if (!key || !videoUrl || !audioUrl) return null;

  try {
    const createRes = await fetch(`https://api.replicate.com/v1/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      // SadTalker: source_image + driven_audio → talking head. `still:true` keeps the
      // head motion subtle/stable; `preprocess:full` retains the whole framing.
      body: JSON.stringify({ version: LIPSYNC_VERSION, input: { [FACE_FIELD]: videoUrl, [AUDIO_FIELD]: audioUrl, still: true, preprocess: 'full' } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!createRes.ok) return null;

    let pred = (await createRes.json().catch(() => ({}))) as ReplicatePrediction;
    const pollUrl = pred.urls?.get || (pred.id ? `https://api.replicate.com/v1/predictions/${pred.id}` : '');
    if (!pollUrl) return null;

    // Bounded poll budget (leaves ~40s of the 300s route for the Supabase re-host).
    const deadline = Date.now() + 230_000;
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

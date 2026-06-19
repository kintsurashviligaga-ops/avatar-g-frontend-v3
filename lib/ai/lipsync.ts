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

function heygenKey(): string {
  return String(process.env.HEYGEN_API_KEY || '').trim();
}

/** True when a lip-sync provider is available (HeyGen preferred, Replicate fallback). */
export function hasLipsyncProvider(): boolean {
  return heygenKey().length > 0 || token().length > 0;
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
      // SadTalker: source_image + driven_audio → talking head. Keep the input MINIMAL —
      // the default 'crop' preprocess runs ~180s (fits the budget); 'full' overran 230s.
      body: JSON.stringify({ version: LIPSYNC_VERSION, input: { [FACE_FIELD]: videoUrl, [AUDIO_FIELD]: audioUrl } }),
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

// ─── HeyGen talking-photo engine (PRIMARY) ──────────────────────────────────
// A reliable, professional lip-sync path: upload the face photo → talking_photo →
// video/generate driven by OUR ElevenLabs audio (voice.type:'audio'). This keeps the
// Georgian voice quality AND removes the dependency on the flaky Replicate SadTalker
// container (whose model-side Python throws "ANTIALIAS" / "exceptions must derive from
// BaseException" — not our code). Fail-open: any miss → null → SadTalker fallback.
const HEYGEN_BASE = 'https://api.heygen.com';

async function faceUrlToBase64(url: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const mime = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.byteLength ? { base64: buf.toString('base64'), mime } : null;
  } catch {
    return null;
  }
}

/** HeyGen: face URL + audio URL → "heygen:<videoId>" job handle (or null). */
async function heygenLipsyncCreate(faceUrl: string, audioUrl: string): Promise<string | null> {
  const key = heygenKey();
  if (!key) return null;
  try {
    const img = await faceUrlToBase64(faceUrl);
    if (!img) return null;

    // 1) upload the photo as a HeyGen asset
    const bin = Buffer.from(img.base64, 'base64');
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(bin)], { type: img.mime }), 'face.jpg');
    fd.append('type', 'image');
    const upRes = await fetch(`${HEYGEN_BASE}/v1/asset`, { method: 'POST', headers: { 'X-Api-Key': key }, body: fd, signal: AbortSignal.timeout(30_000) });
    if (!upRes.ok) return null;
    const upData = (await upRes.json().catch(() => ({}))) as { data?: { id?: string; asset_id?: string } };
    const assetId = upData.data?.id ?? upData.data?.asset_id;
    if (!assetId) return null;

    // 2) make a talking_photo from the asset
    const tpRes = await fetch(`${HEYGEN_BASE}/v1/talking_photo`, { method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ image_asset_id: assetId }), signal: AbortSignal.timeout(20_000) });
    if (!tpRes.ok) return null;
    const tpData = (await tpRes.json().catch(() => ({}))) as { data?: { talking_photo_id?: string } };
    const talkingPhotoId = tpData.data?.talking_photo_id;
    if (!talkingPhotoId) return null;

    // 3) generate the video driven by OUR audio (preserves the Georgian voice)
    const genRes = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: 'POST',
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: 'talking_photo', talking_photo_id: talkingPhotoId, talking_photo_style: 'square' },
          voice: { type: 'audio', audio_url: audioUrl },
        }],
        dimension: { width: 720, height: 1280 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!genRes.ok) return null;
    const genData = (await genRes.json().catch(() => ({}))) as { data?: { video_id?: string }; video_id?: string };
    const videoId = genData.data?.video_id ?? genData.video_id;
    return videoId ? `heygen:${videoId}` : null;
  } catch {
    return null;
  }
}

/** HeyGen: poll a video_id once → normalized { status, url, error }. */
async function heygenLipsyncFetch(videoId: string): Promise<{ status: string; url: string | null; error: string | null }> {
  const key = heygenKey();
  if (!key || !videoId) return { status: 'failed', url: null, error: null };
  try {
    const res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { headers: { 'X-Api-Key': key }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { status: 'processing', url: null, error: null };
    const d = ((await res.json().catch(() => ({}))) as { data?: { status?: string; video_url?: string; error?: unknown } }).data ?? {};
    const st = d.status === 'completed' ? 'succeeded' : d.status === 'failed' ? 'failed' : 'processing';
    const url = st === 'succeeded' ? (d.video_url ?? null) : null;
    const error = typeof d.error === 'string' ? d.error.slice(0, 300) : d.error ? JSON.stringify(d.error).slice(0, 300) : null;
    return { status: st, url, error };
  } catch {
    return { status: 'processing', url: null, error: null };
  }
}

/**
 * One-shot server-side verification of the HeyGen "Avatar" path (asset → talking_photo →
 * audio-driven generate → poll). Bypasses the LIPSYNC_HEYGEN flag so the engine can be
 * PROVEN end-to-end before it is switched on for real traffic. Names-only: never returns
 * the key — only whether each step worked and the final job status.
 */
export async function heygenSelfTest(faceUrl: string, audioUrl: string): Promise<{
  configured: boolean; createOk: boolean; jobId: string | null; status: string; videoUrl: string | null; error: string | null; ms: number;
}> {
  const t0 = Date.now();
  if (!heygenKey()) return { configured: false, createOk: false, jobId: null, status: 'no-key', videoUrl: null, error: 'HEYGEN_API_KEY missing at runtime', ms: 0 };
  const jobId = await heygenLipsyncCreate(faceUrl, audioUrl);
  if (!jobId) return { configured: true, createOk: false, jobId: null, status: 'create-failed', videoUrl: null, error: 'asset/talking_photo/generate did not return a video_id', ms: Date.now() - t0 };
  let status = 'processing';
  let videoUrl: string | null = null;
  let error: string | null = null;
  const deadline = Date.now() + 180_000; // poll up to ~3min within the 300s route budget
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await heygenLipsyncFetch(jobId.slice(7));
    status = r.status; videoUrl = r.url; error = r.error;
    if (status === 'succeeded' || status === 'failed') break;
  }
  return { configured: true, createOk: true, jobId, status, videoUrl, error, ms: Date.now() - t0 };
}

/**
 * ASYNC start: create the prediction and return its ID immediately (no polling). The
 * client then polls /api/video/lipsync?id=… in SHORT requests — a single ~150s
 * synchronous fetch gets dropped on mobile networks (the "lip-sync doesn't do it" bug).
 *
 * PRIMARY: HeyGen talking-photo (reliable). FALLBACK: Replicate SadTalker.
 */
export async function lipsyncCreate(videoUrl: string, audioUrl: string, opts?: { skipHeygen?: boolean }): Promise<string | null> {
  if (!videoUrl || !audioUrl) return null;
  // Prefer HeyGen (the "Avatar" engine) when enabled (LIPSYNC_HEYGEN=1) — a reliable,
  // professional talking-photo render driven by OUR ElevenLabs audio. Fail-open: if the
  // HeyGen create path misses, fall straight through to the proven SadTalker pass.
  // `skipHeygen` lets the client force SadTalker on a retry after a HeyGen job failed, so
  // the Avatar service is bulletproof: HeyGen quality when it works, SadTalker always.
  if (!opts?.skipHeygen && heygenKey() && process.env.LIPSYNC_HEYGEN === '1') {
    const heygenId = await heygenLipsyncCreate(videoUrl, audioUrl);
    if (heygenId) return heygenId;
  }
  const key = token();
  if (!key) return null;
  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      // preprocess:'full' keeps the WHOLE image and animates the face in place — far
      // more tolerant of real photos (face off-centre, lots of background) than the
      // default tight 'crop', and it returns the full scene (not a cropped head).
      body: JSON.stringify({ version: LIPSYNC_VERSION, input: { [FACE_FIELD]: videoUrl, [AUDIO_FIELD]: audioUrl, preprocess: 'full' } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const pred = (await res.json().catch(() => ({}))) as ReplicatePrediction;
    return pred.id || null;
  } catch {
    return null;
  }
}

/** Poll a prediction ONCE → its status, the output URL (when succeeded), + any error. */
export async function lipsyncFetch(predictionId: string): Promise<{ status: string; url: string | null; error: string | null }> {
  if (!predictionId) return { status: 'failed', url: null, error: null };
  // HeyGen jobs are tagged "heygen:<videoId>" by lipsyncCreate.
  if (predictionId.startsWith('heygen:')) {
    return heygenLipsyncFetch(predictionId.slice(7));
  }
  const key = token();
  if (!key) return { status: 'failed', url: null, error: null };
  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(predictionId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { status: 'processing', url: null, error: null };
    const pred = (await res.json().catch(() => ({}))) as ReplicatePrediction;
    const status = pred.status || 'processing';
    const url = status === 'succeeded' ? (extractUrl(pred.output).trim() || null) : null;
    const error = typeof pred.error === 'string' && pred.error ? pred.error.slice(0, 300) : null;
    return { status, url, error };
  } catch {
    return { status: 'processing', url: null, error: null };
  }
}

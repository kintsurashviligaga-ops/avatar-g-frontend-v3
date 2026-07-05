import 'server-only';
import { getFeatureFlag } from '@/lib/server/feature-flags';

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
// Asset uploads use a SEPARATE host — api.heygen.com/v1/asset 404s — and take a RAW
// binary body with Content-Type = the file's mime (NOT multipart form-data).
const HEYGEN_UPLOAD = 'https://upload.heygen.com';

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

/** HeyGen: face URL + audio URL → "heygen:<videoId>" job handle (or null).
 *  Exported so the presenter route can drive a DEFAULT face through the same fast
 *  talking_photo path (the /v2/avatars list is unusably slow on our account). */
export async function heygenLipsyncCreate(faceUrl: string, audioUrl: string, orientation?: 'vertical' | 'landscape' | 'square'): Promise<string | null> {
  const key = heygenKey();
  if (!key) return null;
  try {
    const img = await faceUrlToBase64(faceUrl);
    if (!img) return null;

    // 1) upload the photo straight to HeyGen as a TALKING PHOTO — RAW binary body to the
    //    upload host → returns the talking_photo_id directly (no separate asset step).
    const bin = Buffer.from(img.base64, 'base64');
    const tpRes = await fetch(`${HEYGEN_UPLOAD}/v1/talking_photo`, { method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': img.mime }, body: new Uint8Array(bin), signal: AbortSignal.timeout(30_000) });
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
        // Honour the avatar panel's Format selector; default to 9:16 vertical (mobile).
        dimension: orientation === 'landscape' ? { width: 1280, height: 720 }
          : orientation === 'square' ? { width: 720, height: 720 }
          : { width: 720, height: 1280 },
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
export async function heygenSelfTest(faceUrl: string, audioUrl: string): Promise<Record<string, unknown>> {
  const key = heygenKey();
  const out: Record<string, unknown> = { configured: key.length > 0, flag: process.env.LIPSYNC_HEYGEN ?? null };
  if (!key) { out.verdict = 'NO_KEY'; return out; }
  try {
    // 1 · fetch the face image server-side
    const fr = await fetch(faceUrl, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    const faceMime = fr.headers.get('content-type') || 'image/jpeg';
    const faceBuf = fr.ok ? Buffer.from(await fr.arrayBuffer()) : null;
    out.face = { ok: fr.ok, status: fr.status, bytes: faceBuf?.byteLength ?? 0, mime: faceMime };
    if (!faceBuf || !faceBuf.byteLength) { out.verdict = 'FACE_FETCH_FAILED'; return out; }

    // 2 · upload the photo straight to HeyGen as a TALKING PHOTO (upload host, raw binary)
    const tr = await fetch(`${HEYGEN_UPLOAD}/v1/talking_photo`, { method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': faceMime }, body: new Uint8Array(faceBuf), signal: AbortSignal.timeout(30_000) });
    const tText = await tr.text();
    let tpId: string | undefined;
    try { tpId = JSON.parse(tText).data?.talking_photo_id; } catch { /* non-JSON */ }
    out.talkingPhoto = { httpStatus: tr.status, ok: tr.ok, talkingPhotoId: tpId ?? null, body: tText.slice(0, 300) };
    if (!tpId) { out.verdict = 'TALKING_PHOTO_UPLOAD_FAILED'; return out; }

    // 4 · generate the video driven by OUR audio (voice.type:audio) — the unverified path
    const gr = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_inputs: [{ character: { type: 'talking_photo', talking_photo_id: tpId, talking_photo_style: 'square' }, voice: { type: 'audio', audio_url: audioUrl } }], dimension: { width: 720, height: 1280 } }),
      signal: AbortSignal.timeout(20_000),
    });
    const gText = await gr.text();
    let videoId: string | undefined;
    try { const j = JSON.parse(gText); videoId = j.data?.video_id ?? j.video_id; } catch { /* non-JSON */ }
    out.generate = { httpStatus: gr.status, ok: gr.ok, videoId: videoId ?? null, body: gText.slice(0, 400) };
    if (!videoId) { out.verdict = 'GENERATE_FAILED'; return out; }

    // 5 · poll the render to a final state
    let status = 'processing';
    let url: string | null = null;
    let error: string | null = null;
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const r = await heygenLipsyncFetch(videoId);
      status = r.status; url = r.url; error = r.error;
      if (status === 'succeeded' || status === 'failed') break;
    }
    out.poll = { status, videoUrl: url, error };
    out.verdict = status === 'succeeded' ? 'HEYGEN_WORKS' : status === 'failed' ? 'RENDER_FAILED' : 'RENDER_TIMEOUT';
    return out;
  } catch (e) {
    out.error = (e as Error).message;
    out.verdict = 'EXCEPTION';
    return out;
  }
}

/**
 * ASYNC start: create the prediction and return its ID immediately (no polling). The
 * client then polls /api/video/lipsync?id=… in SHORT requests — a single ~150s
 * synchronous fetch gets dropped on mobile networks (the "lip-sync doesn't do it" bug).
 *
 * PRIMARY: HeyGen talking-photo (reliable). FALLBACK: Replicate SadTalker.
 */
export async function lipsyncCreate(videoUrl: string, audioUrl: string, opts?: { skipHeygen?: boolean; orientation?: 'vertical' | 'landscape' | 'square' }): Promise<string | null> {
  if (!videoUrl || !audioUrl) return null;
  // Prefer HeyGen (the "Avatar" engine) by DEFAULT whenever a key is present — a
  // reliable, professional talking-photo render driven by OUR ElevenLabs (cloned
  // Georgian) audio. Set LIPSYNC_HEYGEN=0 to force the SadTalker fallback. Fail-open:
  // if the HeyGen create path misses, we fall straight through to SadTalker.
  // `skipHeygen` lets the client force SadTalker on a retry after a HeyGen job failed,
  // so the Avatar service is bulletproof: HeyGen quality when it works, SadTalker always.
  if (!opts?.skipHeygen && heygenKey() && (await getFeatureFlag('LIPSYNC_HEYGEN', true))) {
    const heygenId = await heygenLipsyncCreate(videoUrl, audioUrl, opts?.orientation);
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

// ─── FILM lip-sync (sync/lipsync-2) ─────────────────────────────────────────
// The avatar lipsync above uses SadTalker (still image → talking head). For a
// MULTI-SHOT video master (music videos) we need a video-input engine. Replicate's
// official `sync/lipsync-2` model takes { video, audio } and returns a lip-synced
// video — verified working end-to-end (prediction q9m5k5nexdrmr0cyyhnt2ca090,
// predict_time ~113s on the canonical example clip). Official models don't need a
// version hash — POST to `/v1/models/sync/lipsync-2/predictions` directly.

/** Start a film lip-sync (video + audio → lip-synced video). Returns the prediction
 *  id (prefixed "sync:") on success, null otherwise. Fail-open. */
export async function filmLipsyncCreate(videoUrl: string, audioUrl: string): Promise<string | null> {
  const key = token();
  if (!key || !videoUrl || !audioUrl) return null;
  try {
    const res = await fetch('https://api.replicate.com/v1/models/sync/lipsync-2/predictions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ input: { video: videoUrl, audio: audioUrl, sync_mode: 'loop' } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const pred = (await res.json().catch(() => ({}))) as ReplicatePrediction;
    return pred.id ? `sync:${pred.id}` : null;
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
  // Film lip-sync (sync/lipsync-2) jobs are tagged "sync:<predictionId>" —
  // they use the same Replicate poll endpoint, just with the prefix stripped.
  const isSync = predictionId.startsWith('sync:');
  const id = isSync ? predictionId.slice(5) : predictionId;
  const key = token();
  if (!key) return { status: 'failed', url: null, error: null };
  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, {
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

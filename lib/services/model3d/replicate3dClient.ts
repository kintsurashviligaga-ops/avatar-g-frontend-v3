/**
 * lib/services/model3d/replicate3dClient.ts — image-to-3D on Replicate (TRELLIS), submit → poll → download.
 *
 * WHY REPLICATE, NOT MESHY: Meshy was the original spec, but no MESHY_API_KEY exists on any environment,
 * so that service could never run. REPLICATE_API_TOKEN is already configured and already drives four other
 * pipelines here (anchor frames, lip-sync, the video cascade, FLUX).
 *
 * Predictions are created on `/v1/predictions` with an explicit `version`, NOT on the version-less
 * `/v1/models/{owner}/{name}/predictions` endpoint. That version-less shape (which lipsyncNode uses for
 * `sync/lipsync-2`) works ONLY for models Replicate flags `is_official: true`. firtoz/trellis is a
 * community model, and the version-less endpoint answers 404 "The requested resource could not be found."
 * for it — verified live. The version is resolved from the model's `latest_version` and cached, so a new
 * model release still needs no code change; the pinned hash is only the fallback if that lookup fails.
 *
 * ⚠️ NOT VERIFIED AGAINST THE LIVE API. REPLICATE_API_TOKEN is empty locally (real values live in Vercel),
 * so every path below is exercised with a stubbed fetch and none with a real call. The output parsing is
 * deliberately shape-agnostic (see `pickGlbUrl`) precisely because I could not confirm the exact field
 * names. Treat the first production run as the real integration test.
 *
 * NEVER THROWS: typed misses only, so the route answers a reason rather than a stack trace.
 */
import { mapReplicateStatus, pickGlbUrl, QUALITY_STEPS, type Model3dStatus, type Model3dRequest } from './model3dPlan';

/**
 * TRELLIS — Microsoft's image-to-3D, the strongest open reconstruction on Replicate that emits GLB
 * directly. Chosen over InstantMesh/Wonder3D for mesh quality, and over shap-e (text-to-3D) because
 * shap-e's output is not shippable.
 */
const MODEL = 'firtoz/trellis';
/**
 * `firtoz/trellis` is `is_official: false`. Replicate's version-less `/v1/models/{owner}/{name}/predictions`
 * endpoint is OFFICIAL-MODELS-ONLY; for a community model it returns 404 ("The requested resource could not
 * be found"), which is exactly the `replicate_http_404` every 3D job was reporting. Community models must be
 * run via `/v1/predictions` with a `version`. Resolved from `latest_version` at first use and cached for the
 * lambda's life; this hash is the verified fallback if that lookup is unavailable.
 */
const MODEL_VERSION_FALLBACK = 'e8f6c45206993f297372f5436b90350817bd9b4a0d52d2a76df50c1c8afa2b3c';
let _cachedVersion = '';
const BASE = 'https://api.replicate.com/v1';
const SUBMIT_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Past this a GLB is not viewable in a browser tab anyway, and would blow the lambda's memory. */
const MAX_GLB_BYTES = 60 * 1024 * 1024;

export type FetchImpl = typeof fetch;

export function hasReplicate3dProvider(): boolean {
  return Boolean((process.env.REPLICATE_API_TOKEN || '').trim());
}

function token(): string {
  return (process.env.REPLICATE_API_TOKEN || '').trim();
}

export type SubmitResult =
  | { ok: true; predictionId: string; pollUrl: string }
  | { ok: false; error: string; retryable: boolean };

/** Credentials/funding/bad-request never succeed on retry; rate limits and 5xx do. */
function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Current version hash for MODEL. NEVER THROWS — a failed lookup degrades to the pinned fallback rather
 * than failing a submit, because a stale-but-valid version still renders while no version renders nothing.
 */
async function resolveModelVersion(k: string, fetchImpl: FetchImpl): Promise<string> {
  if (_cachedVersion) return _cachedVersion;
  try {
    const res = await fetchImpl(`${BASE}/models/${MODEL}`, {
      headers: { Authorization: `Bearer ${k}` },
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as { latest_version?: { id?: unknown } } | null;
      const id = j?.latest_version?.id;
      if (typeof id === 'string' && id) {
        _cachedVersion = id;
        return id;
      }
    }
  } catch {
    /* fall through to the pinned hash */
  }
  return MODEL_VERSION_FALLBACK;
}

/**
 * Submit a reconstruction. `imageUrl` must be PUBLICLY FETCHABLE — Replicate pulls it from its own
 * network, so a signed URL has to still be valid and a private-range host will simply fail there.
 */
export async function submitReconstruction(
  imageUrl: string,
  req: Model3dRequest,
  fetchImpl: FetchImpl = fetch,
): Promise<SubmitResult> {
  const k = token();
  if (!k) return { ok: false, error: 'REPLICATE_API_TOKEN is not configured', retryable: false };
  if (!/^https?:\/\//i.test(imageUrl)) return { ok: false, error: 'a reference image is required', retryable: false };

  try {
    const version = await resolveModelVersion(k, fetchImpl);
    const res = await fetchImpl(`${BASE}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version,
        input: {
          images: [imageUrl],
          generate_model: true,
          texture_size: req.quality === 'standard' ? 2048 : 1024,
          ss_sampling_steps: QUALITY_STEPS[req.quality],
          slat_sampling_steps: QUALITY_STEPS[req.quality],
          // TRELLIS reconstructs whatever fills the frame; a background becomes geometry.
          remove_background: req.removeBackground,
        },
      }),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, error: `replicate_http_${res.status}: ${text.slice(0, 200)}`, retryable: retryableStatus(res.status) };
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'replicate returned a non-JSON response', retryable: true };
    }
    const p = parsed as { id?: unknown; urls?: { get?: unknown } };
    const predictionId = typeof p?.id === 'string' ? p.id : '';
    if (!predictionId) return { ok: false, error: 'replicate returned no prediction id', retryable: false };
    // Prefer the URL Replicate hands back; fall back to the conventional path.
    const pollUrl = typeof p?.urls?.get === 'string' ? p.urls.get : `${BASE}/predictions/${predictionId}`;
    return { ok: true, predictionId, pollUrl };
  } catch (err) {
    // A timeout may have created the prediction server-side but we have no id — not safely retryable.
    return { ok: false, error: err instanceof Error ? err.message : 'replicate submit failed', retryable: false };
  }
}

export interface PollResult {
  status: Model3dStatus;
  glbUrl: string | null;
  error?: string;
}

export async function pollReconstruction(pollUrl: string, fetchImpl: FetchImpl = fetch): Promise<PollResult> {
  const k = token();
  if (!k || !pollUrl) return { status: 'failed', glbUrl: null, error: 'not configured' };
  try {
    const res = await fetchImpl(pollUrl, {
      headers: { Authorization: `Bearer ${k}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    // A transient poll failure must NOT look like a failed job — the prediction is still running.
    if (!res.ok) return { status: 'processing', glbUrl: null };

    const j = (await res.json().catch(() => null)) as { status?: unknown; output?: unknown; error?: unknown } | null;
    if (!j) return { status: 'processing', glbUrl: null };

    const status = mapReplicateStatus(j.status);
    const err = typeof j.error === 'string' && j.error ? j.error : '';
    return {
      status,
      glbUrl: pickGlbUrl(j.output),
      ...(err ? { error: err } : {}),
    };
  } catch {
    return { status: 'processing', glbUrl: null };
  }
}

/**
 * Download the finished GLB so it can be re-hosted on our own storage.
 *
 * MANDATORY: the app's CSP has no replicate.delivery in `connect-src`, so a viewer pointed straight at
 * Replicate's CDN is blocked in production while working perfectly in local dev. Bounded read — an
 * unbounded download of a vendor-controlled URL is an OOM waiting to happen.
 */
export async function fetchGlbBuffer(url: string, fetchImpl: FetchImpl = fetch): Promise<Buffer | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_GLB_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Re-check after reading: content-length is a hint, not a guarantee.
    if (!buf.byteLength || buf.byteLength > MAX_GLB_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

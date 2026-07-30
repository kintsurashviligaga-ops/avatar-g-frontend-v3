/**
 * lib/services/model3d/meshyClient.ts — Meshy text/image-to-3D, submit → poll → download.
 *
 * Shaped exactly like lib/ai/geminiVeo.ts and lib/ai/runway.ts: three small functions, a `fetchImpl` seam
 * for tests, and a definitive-vs-transient failure taxonomy so a 500 retries but a 401 gives up.
 *
 * ⚠️ NEVER VERIFIED AGAINST THE LIVE API. There is no MESHY_API_KEY in this project. The wire contract
 * below is from Meshy's documentation; the tests drive it with a stubbed fetch. Treat a first real run as
 * the actual integration test.
 *
 * NEVER THROWS: every function returns a typed miss so the route answers a real reason, not a stack trace.
 */
import { mapMeshyStatus, pickGlbUrl, QUALITY_MODEL, type MeshyStatus, type Model3dRequest } from './meshyPlan';

const BASE = 'https://api.meshy.ai/openapi';
const SUBMIT_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** A GLB past this is not viewable in a browser tab anyway, and would blow the lambda's memory. */
const MAX_GLB_BYTES = 60 * 1024 * 1024;

export type FetchImpl = typeof fetch;

export function hasMeshyProvider(): boolean {
  return Boolean((process.env.MESHY_API_KEY || '').trim());
}

function key(): string {
  return (process.env.MESHY_API_KEY || '').trim();
}

export type SubmitResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string; retryable: boolean };

/**
 * A 4xx that is about credentials, funding or the request itself will never succeed on retry; a 5xx or a
 * rate-limit will. Mirrors the taxonomy in lib/ai/runway.ts.
 */
function retryableStatus(status: number): boolean {
  if (status === 429) return true;
  return status >= 500;
}

export async function submitMeshyTask(
  req: Model3dRequest,
  fetchImpl: FetchImpl = fetch,
): Promise<SubmitResult> {
  const k = key();
  if (!k) return { ok: false, error: 'MESHY_API_KEY is not configured', retryable: false };

  const endpoint = req.mode === 'image' ? `${BASE}/v1/image-to-3d` : `${BASE}/v2/text-to-3d`;
  const body: Record<string, unknown> =
    req.mode === 'image'
      ? { image_url: req.imageUrl, should_texture: true, target_polycount: req.targetPolycount, topology: req.topology }
      : {
          mode: 'preview',
          prompt: req.prompt,
          art_style: req.artStyle,
          topology: req.topology,
          target_polycount: req.targetPolycount,
          should_remesh: true,
          ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
        };

  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, error: `meshy_http_${res.status}: ${text.slice(0, 200)}`, retryable: retryableStatus(res.status) };
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'meshy returned a non-JSON response', retryable: true };
    }
    const p = parsed as { result?: unknown; id?: unknown };
    // Meshy has returned the id as a bare `result` string and as `{id}` across versions — accept both
    // rather than breaking on a shape change we can trivially absorb.
    const taskId = typeof p?.result === 'string' ? p.result : typeof p?.id === 'string' ? p.id : '';
    if (!taskId) return { ok: false, error: 'meshy returned no task id', retryable: false };
    return { ok: true, taskId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'meshy submit failed';
    // A timeout may well have created the task server-side, but we have no id — not retryable safely.
    return { ok: false, error: msg, retryable: false };
  }
}

export interface PollResult {
  status: MeshyStatus;
  /** Meshy-hosted GLB, present only once succeeded. */
  glbUrl: string | null;
  /** Thumbnail, when Meshy provides one. */
  thumbnailUrl: string | null;
  progress: number;
  error?: string;
}

export async function pollMeshyTask(
  taskId: string,
  mode: Model3dRequest['mode'],
  fetchImpl: FetchImpl = fetch,
): Promise<PollResult> {
  const k = key();
  if (!k || !taskId) return { status: 'failed', glbUrl: null, thumbnailUrl: null, progress: 0, error: 'not configured' };

  const endpoint = mode === 'image' ? `${BASE}/v1/image-to-3d/${taskId}` : `${BASE}/v2/text-to-3d/${taskId}`;
  try {
    const res = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${k}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    // A transient poll failure must NOT look like a failed job — the render is still running and paid for.
    if (!res.ok) return { status: 'processing', glbUrl: null, thumbnailUrl: null, progress: 0 };

    const j = (await res.json().catch(() => null)) as
      | { status?: unknown; progress?: unknown; model_urls?: unknown; thumbnail_url?: unknown; task_error?: unknown }
      | null;
    if (!j) return { status: 'processing', glbUrl: null, thumbnailUrl: null, progress: 0 };

    const status = mapMeshyStatus(j.status);
    const progressRaw = Number(j.progress);
    const err = j.task_error && typeof j.task_error === 'object'
      ? String((j.task_error as { message?: unknown }).message ?? '')
      : '';

    return {
      status,
      glbUrl: pickGlbUrl(j.model_urls),
      thumbnailUrl: typeof j.thumbnail_url === 'string' ? j.thumbnail_url : null,
      progress: Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : 0,
      ...(err ? { error: err } : {}),
    };
  } catch {
    return { status: 'processing', glbUrl: null, thumbnailUrl: null, progress: 0 };
  }
}

/**
 * Download the finished GLB so it can be re-hosted on our own storage.
 *
 * MANDATORY, not an optimisation: the app's CSP has no Meshy host in `connect-src`, so a viewer pointed
 * at a Meshy CDN URL is blocked in production while working perfectly in local dev. Bounded read — an
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

/** The billing model id for this request's quality tier. */
export function meshyModelFor(req: Model3dRequest): string {
  return QUALITY_MODEL[req.quality];
}

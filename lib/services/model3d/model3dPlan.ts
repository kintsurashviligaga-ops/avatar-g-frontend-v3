/**
 * lib/services/model3d/model3dPlan.ts — the pure core of the 3D studio.
 *
 * PURE + TOTAL: no imports, no I/O, never throws.
 *
 * BACKEND: Replicate (REPLICATE_API_TOKEN), not Meshy. Meshy was specified originally but no MESHY_API_KEY
 * exists on any environment, so the service could never run. Replicate's token is already configured and
 * already used by four other pipelines here.
 *
 * TEXT MODE IS TWO HOPS. The strong open 3D models on Replicate are IMAGE-to-3D; there is no text-to-3D
 * worth shipping. So a text prompt goes Imagen 4 → reference image → image-to-3D. That is a real
 * improvement rather than a workaround: the user sees and can regenerate the reference image before
 * spending a 3D generation on it.
 */

export type Model3dMode = 'text' | 'image';
export type Model3dQuality = 'draft' | 'standard';

export interface Model3dRequest {
  mode: Model3dMode;
  /** Text prompt (mode 'text') — drives the reference image. */
  prompt: string;
  /** Source image URL (mode 'image'). */
  imageUrl?: string;
  quality: Model3dQuality;
  /** Strip the background before reconstruction. Off for an already-cut-out subject. */
  removeBackground: boolean;
  /** Things to keep out of the reference image. */
  negativePrompt?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  request?: Model3dRequest;
}

export const MAX_PROMPT_CHARS = 600;
export const MIN_PROMPT_CHARS = 3;

/**
 * Quality → the model tier billed for it. These strings must stay in sync with
 * ECONOMY_MODELS/PREMIUM_MODELS.model3d in lib/services/billing/budgetPolicy.ts, or the budget ladder
 * selects a tier that does not exist and the economy controls become decorative.
 */
export const QUALITY_MODEL: Record<Model3dQuality, string> = {
  draft: 'meshy-draft',
  standard: 'meshy-standard',
};

/**
 * Reconstruction steps per tier. Draft is roughly half the sampling work — noticeably faster and cheaper,
 * good enough to judge a shape before committing to the standard pass.
 */
export const QUALITY_STEPS: Record<Model3dQuality, number> = { draft: 12, standard: 25 };

export function isModel3dQuality(v: unknown): v is Model3dQuality {
  return v === 'draft' || v === 'standard';
}

export function validateModel3dRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;

  const mode: Model3dMode = b.mode === 'image' ? 'image' : 'text';
  const prompt = String(b.prompt ?? '').replace(/\s+/g, ' ').trim();
  const imageUrl = String(b.imageUrl ?? '').trim();

  if (mode === 'text') {
    if (prompt.length < MIN_PROMPT_CHARS) return { ok: false, error: 'prompt is too short' };
    if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: `prompt must be under ${MAX_PROMPT_CHARS} characters` };
  } else if (!/^https?:\/\//i.test(imageUrl)) {
    return { ok: false, error: 'imageUrl must be an http(s) URL' };
  }

  const negativePrompt = String(b.negativePrompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

  return {
    ok: true,
    request: {
      mode,
      prompt,
      ...(mode === 'image' ? { imageUrl } : {}),
      quality: isModel3dQuality(b.quality) ? b.quality : 'draft',
      removeBackground: b.removeBackground !== false,
      ...(negativePrompt ? { negativePrompt } : {}),
    },
  };
}

/** Billing units are 'models' — one generation is one model. */
export function model3dUnits(): number {
  return 1;
}

export type Model3dStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

/**
 * Map Replicate's status vocabulary onto ours.
 *
 * UNKNOWN STATUSES MAP TO 'processing', NOT 'failed'. A new intermediate state must not make the client
 * abandon a job that is still running and already paid for. Only an explicit terminal failure fails.
 */
export function mapReplicateStatus(raw: unknown): Model3dStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'succeeded') return 'succeeded';
  if (s === 'failed' || s === 'canceled' || s === 'cancelled') return 'failed';
  if (s === 'starting') return 'pending';
  return 'processing';
}

export function isTerminal(status: Model3dStatus): boolean {
  return status === 'succeeded' || status === 'failed';
}

/** Poll backoff — reconstruction runs for minutes; a fixed short interval is thousands of dead requests. */
export const MAX_POLL_ATTEMPTS = 120;

export function pollDelayMs(attempt: number): number {
  const a = Number.isFinite(attempt) && attempt > 0 ? attempt : 0;
  return Math.min(15_000, 3_000 + a * 1_000);
}

/**
 * Find the GLB in a Replicate prediction's `output`.
 *
 * DELIBERATELY SHAPE-AGNOSTIC. Replicate outputs differ per model and change between versions — a bare
 * URL string, an array of files, or an object keyed `model_file` / `mesh` / `glb`. Rather than pin one
 * shape and break silently on the next version, walk the value and take the first `.glb`. Bounded depth so
 * a pathological payload cannot spin.
 *
 * Note it accepts a `.glb` with a query string (Replicate serves signed URLs), but nothing else — a `.ply`
 * or `.obj` would load as nothing in the viewer.
 */
export function pickGlbUrl(output: unknown, depth = 0): string | null {
  if (depth > 4 || output == null) return null;

  if (typeof output === 'string') {
    return /^https?:\/\/\S+\.glb(\?\S*)?$/i.test(output) ? output : null;
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const hit = pickGlbUrl(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof output === 'object') {
    const o = output as Record<string, unknown>;
    // Check the conventional keys first so a payload carrying several files yields the mesh, not a preview.
    for (const key of ['model_file', 'glb', 'mesh', 'model', 'file']) {
      const hit = pickGlbUrl(o[key], depth + 1);
      if (hit) return hit;
    }
    for (const value of Object.values(o)) {
      const hit = pickGlbUrl(value, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * lib/services/model3d/meshyPlan.ts — the pure core of the 3D studio.
 *
 * PURE + TOTAL: no imports, no I/O, never throws.
 *
 * ⚠️ CREDENTIAL STATUS: there is no MESHY_API_KEY anywhere in this project — not in lib/env/schema.ts,
 * not in .env.example, not in any env file. Everything here and in meshyClient.ts is written against
 * Meshy's documented contract and is fully exercised by tests with a stubbed fetch, but NOT ONE REAL CALL
 * HAS BEEN MADE. The catalogue tile stays `live: false` until a key returns an actual GLB. Do not flip it
 * on the strength of these tests.
 */

export type MeshyMode = 'text' | 'image';
export type MeshyQuality = 'draft' | 'standard';
/** Meshy's art-style vocabulary for text-to-3D. */
export type MeshyArtStyle = 'realistic' | 'sculpture';
export type MeshyTopology = 'triangle' | 'quad';

export interface Model3dRequest {
  mode: MeshyMode;
  /** Text prompt (mode 'text') — what the object IS. */
  prompt: string;
  /** Source image URL (mode 'image'). */
  imageUrl?: string;
  quality: MeshyQuality;
  artStyle: MeshyArtStyle;
  topology: MeshyTopology;
  targetPolycount: number;
  /** Things to keep out of the mesh. */
  negativePrompt?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  request?: Model3dRequest;
}

export const MAX_PROMPT_CHARS = 600;
export const MIN_PROMPT_CHARS = 3;

/** Meshy's supported polycount band. Outside it the API 400s rather than clamping for us. */
export const MIN_POLYCOUNT = 100;
export const MAX_POLYCOUNT = 300_000;
export const DEFAULT_POLYCOUNT = 30_000;

/**
 * Quality → the model tier billed for it. These strings match ECONOMY_MODELS/PREMIUM_MODELS.model3d in
 * lib/services/billing/budgetPolicy.ts, so the budget ladder actually selects something real rather than
 * being decorative.
 */
export const QUALITY_MODEL: Record<MeshyQuality, string> = {
  draft: 'meshy-draft',
  standard: 'meshy-standard',
};

export function isMeshyQuality(v: unknown): v is MeshyQuality {
  return v === 'draft' || v === 'standard';
}

export function isMeshyArtStyle(v: unknown): v is MeshyArtStyle {
  return v === 'realistic' || v === 'sculpture';
}

export function isMeshyTopology(v: unknown): v is MeshyTopology {
  return v === 'triangle' || v === 'quad';
}

export function validateModel3dRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;

  const mode: MeshyMode = b.mode === 'image' ? 'image' : 'text';
  const prompt = String(b.prompt ?? '').replace(/\s+/g, ' ').trim();
  const imageUrl = String(b.imageUrl ?? '').trim();

  if (mode === 'text') {
    if (prompt.length < MIN_PROMPT_CHARS) return { ok: false, error: 'prompt is too short' };
    if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: `prompt must be under ${MAX_PROMPT_CHARS} characters` };
  } else if (!/^https?:\/\//i.test(imageUrl)) {
    return { ok: false, error: 'imageUrl must be an http(s) URL' };
  }

  const polyRaw = Number(b.targetPolycount);
  const targetPolycount = Number.isFinite(polyRaw)
    ? Math.max(MIN_POLYCOUNT, Math.min(MAX_POLYCOUNT, Math.round(polyRaw)))
    : DEFAULT_POLYCOUNT;

  const negativePrompt = String(b.negativePrompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

  return {
    ok: true,
    request: {
      mode,
      prompt,
      ...(mode === 'image' ? { imageUrl } : {}),
      quality: isMeshyQuality(b.quality) ? b.quality : 'draft',
      artStyle: isMeshyArtStyle(b.artStyle) ? b.artStyle : 'realistic',
      topology: isMeshyTopology(b.topology) ? b.topology : 'triangle',
      targetPolycount,
      ...(negativePrompt ? { negativePrompt } : {}),
    },
  };
}

/** Billing units are 'models' — one generation is one model. */
export function model3dUnits(): number {
  return 1;
}

export type MeshyStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

/**
 * Map Meshy's status vocabulary onto ours.
 *
 * UNKNOWN STATUSES MAP TO 'processing', NOT 'failed'. A vendor adding a new intermediate state must not
 * make the client abandon a job that is still running and already paid for. Only an explicit terminal
 * failure is treated as failure.
 */
export function mapMeshyStatus(raw: unknown): MeshyStatus {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'SUCCEEDED' || s === 'SUCCESS' || s === 'COMPLETED') return 'succeeded';
  if (s === 'FAILED' || s === 'ERROR' || s === 'CANCELED' || s === 'CANCELLED' || s === 'EXPIRED') return 'failed';
  if (s === 'PENDING' || s === 'QUEUED') return 'pending';
  return 'processing';
}

/** Terminal states — the browser poll loop stops here. */
export function isTerminal(status: MeshyStatus): boolean {
  return status === 'succeeded' || status === 'failed';
}

/**
 * Poll backoff. Text-to-3D routinely takes minutes, so a fixed 2s interval is thousands of pointless
 * requests; this ramps 3s → 15s and is capped so a hung job cannot poll forever.
 */
export const MAX_POLL_ATTEMPTS = 120;

export function pollDelayMs(attempt: number): number {
  const a = Number.isFinite(attempt) && attempt > 0 ? attempt : 0;
  return Math.min(15_000, 3_000 + a * 1_000);
}

/**
 * Pick the GLB from Meshy's `model_urls` bag.
 *
 * GLB ONLY, and deliberately NOT a Draco-compressed variant: the drei/three GLTF loader fetches Draco
 * decoder wasm from a Google CDN, which this app's CSP `script-src`/`connect-src` will block in
 * production — a viewer that works locally and silently fails on the deployed site.
 */
export function pickGlbUrl(modelUrls: unknown): string | null {
  if (!modelUrls || typeof modelUrls !== 'object') return null;
  const m = modelUrls as Record<string, unknown>;
  const glb = m.glb;
  return typeof glb === 'string' && /^https?:\/\//i.test(glb) ? glb : null;
}

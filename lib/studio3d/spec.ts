/**
 * lib/studio3d/spec.ts — what a 3D Studio request is, and the validator every route runs first. Pure, client-safe.
 *
 * THREE MODES (the plan doc, Phase 8.8):
 *  - 'image'     a photo the user uploaded → our GPU worker (TRELLIS.2) → textured mesh. No Google call except the safety
 *                check of the upload.
 *  - 'text'      a prompt → a Gemini reference picture (gemini-3.1-flash-image; Imagen is shut down on Vertex) that the
 *                user APPROVES → the same worker. The picture is its own paid step so nobody pays for a mesh of a wrong idea.
 *  - 'retexture' an existing model of ours + a style → Gemini paints a new reference from the model's front view → the
 *                worker paints the SAME shape with it (TRELLIS.2 shape-conditioned texturing).
 *
 * ⚠️ URLS ARE OURS ONLY. Every image and mesh the worker is pointed at must be one of our Supabase Storage objects: the
 * worker downloads whatever it is given, so an arbitrary URL here would make our GPU fetch anything on a user's say-so.
 */

export type Studio3dMode = 'image' | 'text' | 'retexture';
/** Voxel grid of the shape pass. 1024³ is the default; 1536³ is the paid "high detail" option. */
export type Studio3dDetail = 'standard' | 'high';
/** Face count of the downloads. Decimation happens in the worker and costs nothing extra. */
export type Studio3dFaces = 'low' | 'medium' | 'high';

export const FACE_TARGET: Record<Studio3dFaces, number> = { low: 10_000, medium: 50_000, high: 200_000 };
export const DETAIL_GRID: Record<Studio3dDetail, number> = { standard: 1024, high: 1536 };

export const MIN_PROMPT_CHARS = 3;
export const MAX_PROMPT_CHARS = 600;
/** STL height the user picks, in millimetres. 100 mm is the default (decision D6). */
export const STL_MM = { min: 10, max: 500, default: 100 } as const;

export interface Studio3dRequest {
  mode: Studio3dMode;
  /** The object (text), the style (retexture), or an optional note (image). Whitespace-collapsed. */
  prompt: string;
  /** Source photo (image) or the approved reference picture (text, retexture), always our storage. */
  imageUrl?: string;
  /** The model being retextured (retexture only), always our storage. */
  meshUrl?: string;
  detail: Studio3dDetail;
  faces: Studio3dFaces;
}

export type Validated = { ok: true; request: Studio3dRequest } | { ok: false; error: string };

/** `https://<project>.supabase.co/storage/v1/object/...` — the only host the worker and the viewer accept. */
export function isOwnStorageUrl(url: unknown, ext?: RegExp): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname)) return false;
  if (!u.pathname.startsWith('/storage/v1/object/')) return false;
  return ext ? ext.test(u.pathname) : true;
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const MESH_EXT = /\.glb$/i;

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;

export function validateStudio3d(body: unknown): Validated {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;
  const mode = pick<Studio3dMode>(b.mode, ['image', 'text', 'retexture'], 'text');
  const prompt = String(b.prompt ?? '').replace(/\s+/g, ' ').trim();
  if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: `prompt must be under ${MAX_PROMPT_CHARS} characters` };
  if ((mode === 'text' || mode === 'retexture') && prompt.length < MIN_PROMPT_CHARS) return { ok: false, error: 'prompt is too short' };

  const imageUrl = b.imageUrl;
  if (mode === 'image' && !isOwnStorageUrl(imageUrl, IMAGE_EXT)) return { ok: false, error: 'imageUrl must be an uploaded png, jpg or webp' };
  if (imageUrl !== undefined && imageUrl !== null && imageUrl !== '' && !isOwnStorageUrl(imageUrl, IMAGE_EXT)) {
    return { ok: false, error: 'imageUrl must be our own storage' };
  }
  const meshUrl = b.meshUrl;
  if (mode === 'retexture' && !isOwnStorageUrl(meshUrl, MESH_EXT)) return { ok: false, error: 'meshUrl must be one of your 3D models' };

  return {
    ok: true,
    request: {
      mode,
      prompt,
      ...(typeof imageUrl === 'string' && imageUrl ? { imageUrl } : {}),
      ...(mode === 'retexture' ? { meshUrl: meshUrl as string } : {}),
      detail: mode === 'retexture' ? 'standard' : pick<Studio3dDetail>(b.detail, ['standard', 'high'], 'standard'),
      faces: pick<Studio3dFaces>(b.faces, ['low', 'medium', 'high'], 'medium'),
    },
  };
}

/** Clamp a user-picked STL height; NaN or junk gets the default. */
export function clampStlMm(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return STL_MM.default;
  return Math.min(STL_MM.max, Math.max(STL_MM.min, Math.round(n)));
}

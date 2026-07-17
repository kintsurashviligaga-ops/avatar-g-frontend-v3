/**
 * POST /api/ai/edit-photo — the AI Photo Studio (remove background · 4× upscale · face restore · colorize).
 *
 * SECURITY + BILLING (reserve-before-render): a valid Supabase session is required (401 anon). The exact per-action
 * cost is DEBITED up front — an insufficient balance returns 402 and NEVER reaches the paid provider — and REFUNDED
 * if the Replicate job fails or yields no output. The debit ref is per-transaction idempotent.
 *
 * MODELS are env-configurable (REPLICATE_<ACTION>_MODEL) with sensible defaults; a default is used with a dev-log
 * warning. A bad/absent slug fails cleanly (createPrediction throws) → the credit is refunded, not lost. So the
 * feature is safe to ship before the operator has pinned/verified their exact checkpoints.
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardGeneration, insufficientCreditsMessage } from '@/lib/api/generationGuard';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { reSignIfInternal, createSignedAssetUrl, parseSupabaseObjectUrl, uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';

type PhotoAction = 'remove_bg' | 'upscale' | 'face_restore' | 'colorize';
const ACTIONS: PhotoAction[] = ['remove_bg', 'upscale', 'face_restore', 'colorize'];
const COST: Record<PhotoAction, number> = { remove_bg: 2, upscale: 5, face_restore: 3, colorize: 3 };

// Default Replicate checkpoints per action — each fully overridable via env (Vercel dashboard). A wrong/absent
// version fails cleanly and REFUNDS, so the feature is safe to ship before the operator pins real values.
// NOTE: these fallback version hashes are TRUNCATED (Replicate versions are 64-char); the fallback will NOT resolve
// at runtime — set the env var to a valid `owner/name:fullversion` (or a bare `owner/name` to use its latest).
const DEFAULT_MODEL: Record<PhotoAction, string> = {
  remove_bg: 'lucataco/birefnet-general:a64010a3', // BiRefNet transparent-PNG background removal
  upscale: 'nightmareai/real-esrgan:f121d6f5',     // Real-ESRGAN super-resolution
  face_restore: 'tencentarc/gfpgan:8a0fcd04',      // GFPGAN v1.4 face restoration
  colorize: 'tencentarc/ddcolor:afd1d42a',         // DDColor B/W → colour
};
const ENV_KEY: Record<PhotoAction, string> = {
  remove_bg: 'REPLICATE_REMOVE_BG_MODEL',
  upscale: 'REPLICATE_UPSCALE_MODEL',
  face_restore: 'REPLICATE_FACE_RESTORE_MODEL',
  colorize: 'REPLICATE_COLORIZE_MODEL',
};
function modelFor(action: PhotoAction): string {
  const pinned = process.env[ENV_KEY[action]]?.trim();
  if (!pinned && process.env.NODE_ENV !== 'production') {
    console.warn(`[edit-photo] ${ENV_KEY[action]} unset — using default "${DEFAULT_MODEL[action]}". Pin your own to be safe.`);
  }
  return pinned || DEFAULT_MODEL[action];
}
/** Per-model input schema (GFPGAN notably uses `img`, not `image`). */
function inputFor(action: PhotoAction, image: string): Record<string, unknown> {
  switch (action) {
    case 'upscale': return { image, scale: 4 };
    case 'face_restore': return { img: image, version: 'v1.4', scale: 2 };
    default: return { image }; // remove_bg, colorize
  }
}

/** Resolve a client media ref (bare storage path / OUR signed URL) → fetchable URL. SSRF-guarded (own storage only). */
async function resolveMedia(v: unknown): Promise<string | null> {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 4000) return null;
  if (/^https:\/\//i.test(s)) return parseSupabaseObjectUrl(s) ? reSignIfInternal(s) : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  return createSignedAssetUrl(UPLOAD_BUCKET, s, 3600);
}
function firstUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) { const s = output.find((v) => typeof v === 'string'); return typeof s === 'string' ? s : null; }
  return null;
}

/**
 * Re-host the ephemeral Replicate output into OUR storage → returns a persistent signed URL + storage PATH.
 * The PATH is what enables CHAINING: it's an own-storage ref the SSRF-guarded resolveMedia accepts, so the
 * result can be fed straight back into the next action. Fail-soft → null (caller shows the raw Replicate URL).
 */
async function rehost(srcUrl: string): Promise<{ url: string; path: string } | null> {
  try {
    const res = await fetch(srcUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/png';
    const ext = /jpe?g/.test(ct) ? 'jpg' : /webp/.test(ct) ? 'webp' : 'png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 64) return null;
    const path = `photo-studio/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const signed = await uploadAndSign(UPLOAD_BUCKET, path, buf.toString('base64'), ct, 604_800);
    return signed ? { url: signed, path } : null;
  } catch {
    return null;
  }
}
/** Best-effort save to the user's library (never blocks the response). */
async function saveCreation(req: NextRequest, userId: string, url: string, action: PhotoAction, cost: number): Promise<void> {
  try {
    const { supabase } = await authedClientFromRequest(req);
    await supabase.from('creations').insert({
      user_id: userId, kind: 'image', service: 'photo-studio',
      prompt: `photo:${action}`, url, thumbnail_url: url, credits_used: cost,
    });
  } catch { /* fail-open — the asset is already returned */ }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { action?: string; mediaUrl?: string } | null;
  const action = String(body?.action || '').trim() as PhotoAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ url: null, error: 'unknown action' }, { status: 400 });
  }

  // Strict auth + a floor balance check (guard 402 if below the smallest cost). Anonymous → 401.
  const guard = await guardGeneration(req, 'image');
  if (!guard.ok) return guard.response;

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ url: null, error: 'photo_studio_unconfigured', message: 'AI Photo Studio needs REPLICATE_API_TOKEN.' }, { status: 503 });
  }
  const src = await resolveMedia(body?.mediaUrl);
  if (!src) return NextResponse.json({ url: null, error: 'could not resolve image (upload it first)' }, { status: 400 });

  const cost = COST[action];
  const ref = `photo:${action}:${guard.userId}:${Date.now()}`;
  // RESERVE-before-render: debit and HONOR the result. A positive 'insufficient' blocks the paid call (the pre-gate
  // is fail-open, so a broke user can reach here); 'skipped'/'error' degrade to proceeding (ledger's documented behavior).
  const debit = await deductCredits(guard.userId, cost, ref);
  if (!debit.ok && debit.reason === 'insufficient') {
    return NextResponse.json({ url: null, error: 'insufficient_credits', message: insufficientCreditsMessage(guard.locale) }, { status: 402 });
  }

  try {
    const created = await createPrediction(modelFor(action), inputFor(action, src));
    let out = created;
    if (created.status !== 'succeeded' && created.status !== 'failed') {
      out = await pollPrediction(created.id);
    }
    const raw = out.status === 'succeeded' ? firstUrl(out.output) : null;
    if (!raw) {
      if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {}); // refund only a real charge
      return NextResponse.json({ url: null, error: `${action} produced no output` }, { status: 502 });
    }
    // Re-host into our storage → persistent URL + a chainable path (the ephemeral Replicate URL expires and
    // wouldn't pass the SSRF-guarded resolveMedia on the next action). Falls back to the raw URL for display.
    const hosted = await rehost(raw);
    const displayUrl = hosted?.url ?? raw;
    void saveCreation(req, guard.userId, displayUrl, action, cost);
    return NextResponse.json({ url: displayUrl, path: hosted?.path });
  } catch (e) {
    if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {});
    return NextResponse.json({ url: null, error: e instanceof Error ? e.message.slice(0, 200) : `${action} failed` }, { status: 502 });
  }
}

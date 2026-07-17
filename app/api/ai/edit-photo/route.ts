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

type PhotoAction = 'remove_bg' | 'upscale' | 'face_restore' | 'colorize' | 'background_replace';
const ACTIONS: PhotoAction[] = ['remove_bg', 'upscale', 'face_restore', 'colorize', 'background_replace'];
const COST: Record<PhotoAction, number> = { remove_bg: 2, upscale: 5, face_restore: 3, colorize: 3, background_replace: 5 };

// Default Replicate checkpoints per action — BARE SLUGS (owner/name, no :version). resolveModelVersion resolves a
// bare slug to the model's LATEST active version via the /models API, so there is no truncated/stale-hash runtime
// crash. Each is overridable via env (Vercel dashboard); a wrong/absent model fails cleanly and REFUNDS.
// These are the stable, high-traffic, currently-active checkpoints for each op. Overridable via env; a wrong/absent
// slug fails cleanly (createPrediction throws) → the credit is REFUNDED, not lost. Fallbacks an operator may pin:
// remove_bg → cjwbw/rembg or 851-labs/background-remover; upscale → lucataco/real-esrgan-large.
const DEFAULT_MODEL: Record<PhotoAction, string> = {
  remove_bg: 'briaai/bria-rmbg',       // BRIA RMBG — commercial-grade, ultra-clean background removal (input: image)
  upscale: 'nightmareai/real-esrgan',  // Real-ESRGAN super-resolution (most-run, bulletproof)
  face_restore: 'tencentarc/gfpgan',   // GFPGAN v1.4 face restoration (industry standard)
  colorize: 'tencentarc/ddcolor',      // DDColor B/W → colour (stable, realistic)
  background_replace: 'bria/replace-background', // prompt-driven background swap (input: image + prompt). PIN via env to your verified checkpoint.
};
const ENV_KEY: Record<PhotoAction, string> = {
  remove_bg: 'REPLICATE_REMOVE_BG_MODEL',
  upscale: 'REPLICATE_UPSCALE_MODEL',
  face_restore: 'REPLICATE_FACE_RESTORE_MODEL',
  colorize: 'REPLICATE_COLORIZE_MODEL',
  background_replace: 'REPLICATE_BACKGROUND_REPLACE_MODEL',
};
function modelFor(action: PhotoAction): string {
  const pinned = process.env[ENV_KEY[action]]?.trim();
  if (!pinned && process.env.NODE_ENV !== 'production') {
    console.warn(`[edit-photo] ${ENV_KEY[action]} unset — using default "${DEFAULT_MODEL[action]}". Pin your own to be safe.`);
  }
  return pinned || DEFAULT_MODEL[action];
}
/** Per-model input schema (GFPGAN notably uses `img`, not `image`; background_replace also takes a text prompt). */
function inputFor(action: PhotoAction, image: string, prompt?: string): Record<string, unknown> {
  switch (action) {
    case 'upscale': return { image, scale: 4 };
    case 'face_restore': return { img: image, version: 'v1.4', scale: 2 };
    case 'background_replace': return { image, prompt: (prompt || '').slice(0, 800), bg_prompt: (prompt || '').slice(0, 800) };
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
  const body = (await req.json().catch(() => null)) as { action?: string; actions?: unknown; mediaUrl?: string; prompt?: string } | null;
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  // A CHAIN of actions ("remove bg AND upscale") OR a single action. De-dupe-preserving order, cap at the 4 real ops.
  const requested = Array.isArray(body?.actions) ? (body!.actions as unknown[]).map(String) : body?.action ? [String(body.action)] : [];
  const chain: PhotoAction[] = [];
  for (const a of requested) if ((ACTIONS as string[]).includes(a) && !chain.includes(a as PhotoAction)) chain.push(a as PhotoAction);
  const CHAIN = chain.slice(0, 4);
  if (!CHAIN.length) return NextResponse.json({ url: null, error: 'unknown action' }, { status: 400 });

  // Strict auth + a floor balance check (guard 402 if below the smallest cost). Anonymous → 401.
  const guard = await guardGeneration(req, 'image');
  if (!guard.ok) return guard.response;

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ url: null, error: 'photo_studio_unconfigured', message: 'AI Photo Studio needs REPLICATE_API_TOKEN.' }, { status: 503 });
  }
  const src = await resolveMedia(body?.mediaUrl);
  if (!src) return NextResponse.json({ url: null, error: 'could not resolve image (upload it first)' }, { status: 400 });

  // ATOMIC chain billing: reserve the SUM of all links up front (reserve-before-render). A positive 'insufficient'
  // blocks the whole chain; any mid-chain failure refunds the ENTIRE sum (all-or-nothing) — the user is never left
  // charged for a partial result they can't use.
  const totalCost = CHAIN.reduce((s, a) => s + COST[a], 0);
  const ref = `photo:chain:${CHAIN.join('-')}:${guard.userId}:${Date.now()}`;
  const debit = await deductCredits(guard.userId, totalCost, ref);
  if (!debit.ok && debit.reason === 'insufficient') {
    return NextResponse.json({ url: null, error: 'insufficient_credits', message: insufficientCreditsMessage(guard.locale) }, { status: 402 });
  }

  try {
    let curUrl = src;                                   // fetchable URL fed into each model in turn
    let finalHosted: { url: string; path: string } | null = null;
    for (const act of CHAIN) {
      const created = await createPrediction(modelFor(act), inputFor(act, curUrl, prompt));
      let out = created;
      if (created.status !== 'succeeded' && created.status !== 'failed') out = await pollPrediction(created.id);
      const raw = out.status === 'succeeded' ? firstUrl(out.output) : null;
      if (!raw) throw new Error(`${act} produced no output`);
      // Re-host each intermediary so the NEXT model consumes a persistent URL (Replicate outputs expire).
      const hosted = await rehost(raw);
      finalHosted = hosted;
      curUrl = hosted?.url ?? raw;
    }
    const displayUrl = finalHosted?.url ?? curUrl;
    const last = CHAIN[CHAIN.length - 1];
    if (last) void saveCreation(req, guard.userId, displayUrl, last, totalCost);
    return NextResponse.json({ url: displayUrl, path: finalHosted?.path, actions: CHAIN });
  } catch (e) {
    if (debit.ok) await refundCredits(guard.userId, totalCost, ref).catch(() => {}); // ATOMIC refund of the whole chain
    return NextResponse.json({ url: null, error: e instanceof Error ? e.message.slice(0, 200) : 'chain failed' }, { status: 502 });
  }
}

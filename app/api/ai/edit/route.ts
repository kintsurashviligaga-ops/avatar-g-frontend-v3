/**
 * POST /api/ai/edit — THE SURGICAL EDITOR backend.
 *
 * ARCHITECTURE (honest): a Vercel serverless function CANNOT receive 35 raw video files in its body
 * (the ~4.5MB body limit + time/memory bounds). So this route is URL-BASED: the client uploads media to
 * storage first (it already has a signed-upload flow) and sends the media URL here. The route runs the
 * proven ffmpeg-static ops (lib/video/{trimClip,surgicalOps}) and returns hosted result URLs. This mirrors
 * the assemble/remix pipelines, which is why ffmpeg-static is traced into this lambda (see next.config.js).
 *
 * TWO CLASSES OF ACTION:
 *   • DETERMINISTIC (split · crop · detach · color · fade) — non-generative, lossless-where-possible pixel
 *     math. NO AI provider call, so these are FREE (auth-only gate; anonymous is still blocked).
 *   • GENERATIVE (inpaint) — object removal via a masked-inpaint model. This IS generative: it SYNTHESISES
 *     new pixels inside the mask (good inpainting keeps the surrounding pixels intact, but the filled region
 *     is invented, not "surgical"). It is auth+balance gated and metered like an image generation, and is
 *     inert (clean 503) until REPLICATE_API_TOKEN + REPLICATE_INPAINT_MODEL are configured.
 *
 * Every op is FAIL-OPEN: a miss returns { url: null, error } (never a 500 dead-end).
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardGeneration, insufficientCreditsMessage } from '@/lib/api/generationGuard';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { reSignIfInternal, createSignedAssetUrl, parseSupabaseObjectUrl } from '@/lib/orchestrator/storage-adapter';
import { trimClip } from '@/lib/video/trimClip';
import { cropClip, gradeClip, detachAudio, fadeClip, renderVideoDraft, renderPhotoDraft, renderConcat, type RenderDraft } from '@/lib/video/surgicalOps';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // ffmpeg re-encode / inpaint poll headroom

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
// Standard LaMa-based object-removal model (inputs: image + mask). Best-effort default when the operator hasn't
// pinned REPLICATE_INPAINT_MODEL — createPrediction resolves its latest version; a bad slug fails cleanly + refunds.
const DEFAULT_INPAINT_MODEL = 'zylim0702/remove-object';

/** Resolve a client media ref (https / bare storage path from uploadBigFile) to a fetchable https URL. */
async function resolveMedia(v: unknown): Promise<string | null> {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 4000) return null;
  // SSRF guard — an https ref is honored ONLY when it's one of OUR OWN Supabase storage objects; an arbitrary
  // external host must never be handed to `ffmpeg -i` (it could reach internal metadata/services). Editor
  // uploads always send a bare storage path, so this rejects nothing legitimate.
  if (/^https:\/\//i.test(s)) return parseSupabaseObjectUrl(s) ? reSignIfInternal(s) : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // reject data:/other schemes
  return createSignedAssetUrl(UPLOAD_BUCKET, s, 3600);
}

type EditAction = 'split' | 'crop' | 'detach' | 'color' | 'fade' | 'inpaint' | 'render';
const DETERMINISTIC = new Set<EditAction>(['split', 'crop', 'detach', 'color', 'fade', 'render']);

interface Bounds { x?: number; y?: number; w?: number; h?: number }

/** The client-accumulated non-linear edit draft, sent ONCE on "Export". */
interface DraftPayload {
  grade?: { saturation?: number; contrast?: number; brightness?: number; temperature?: number };
  fade?: { inSec?: number; outSec?: number };
  crop?: { x: number; y: number; w: number; h: number } | null;
  mutedRanges?: { start: number; end: number }[];
  /** Ordered export sequence (delete = omitted, reorder = array order). */
  segments?: { start: number; end: number; muted: boolean }[];
}

/** Best-effort save of an edited asset to the user's library (never blocks the response). */
async function saveCreation(req: NextRequest, userId: string, url: string, action: EditAction): Promise<void> {
  try {
    const { supabase } = await authedClientFromRequest(req);
    await supabase.from('creations').insert({
      user_id: userId,
      kind: 'video',
      service: 'surgical',
      prompt: `surgical:${action}`,
      url,
      thumbnail_url: url,
      credits_used: DETERMINISTIC.has(action) ? 0 : creditCostFor('image'),
    });
  } catch { /* fail-open — the asset is already returned to the client */ }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    mediaUrl?: string;
    maskUrl?: string;
    prompt?: string;
    startSec?: number;
    durationSec?: number;
    bounds?: Bounds;
    target_bounds?: Bounds;
    saturation?: number;
    contrast?: number;
    brightness?: number;
    temperature?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    // Batch 'render' export:
    kind?: string;
    draft?: DraftPayload;
    // Multi-clip concat export:
    sources?: string[];
    sequence?: { src: number; start: number; end: number; muted: boolean }[];
    targetW?: number;
    targetH?: number;
  } | null;

  const action = String(body?.action || '').trim() as EditAction;
  const mediaUrl = typeof body?.mediaUrl === 'string' ? body.mediaUrl : '';
  if (!action || (!DETERMINISTIC.has(action) && action !== 'inpaint')) {
    return NextResponse.json({ url: null, error: 'unknown action' }, { status: 400 });
  }

  // ── MULTI-CLIP concat export — uses `sources` (not a single mediaUrl). Handled first. ──────────────
  if (action === 'render' && Array.isArray(body?.sources) && body.sources.length > 1 && Array.isArray(body?.sequence)) {
    const guard = await guardGeneration(req, 'video', { gate: false });
    if (!guard.ok) return guard.response;
    // Resolve ALL sources (positions must stay aligned with the sequence's `src` indices) — abort if any misses.
    const resolved = await Promise.all(body.sources.slice(0, 5).map((s) => resolveMedia(s)));
    if (resolved.some((u) => !u)) {
      return NextResponse.json({ url: null, error: 'could not resolve all clip sources' }, { status: 400 });
    }
    const d = body?.draft ?? {};
    const params: RenderDraft = { grade: d.grade, fadeInSec: d.fade?.inSec, fadeOutSec: d.fade?.outSec };
    const seq = body.sequence
      .filter((e) => e && Number.isInteger(e.src) && e.src >= 0 && e.src < resolved.length && e.end > e.start)
      .map((e) => ({ src: e.src, start: Number(e.start), end: Number(e.end), muted: !!e.muted }));
    if (!seq.length) return NextResponse.json({ url: null, error: 'empty sequence' }, { status: 400 });
    try {
      const url = await renderConcat(resolved as string[], seq, params, Number(body?.targetW) || 1280, Number(body?.targetH) || 720);
      if (url) void saveCreation(req, guard.userId, url, 'render');
      return NextResponse.json({ url, error: url ? undefined : 'concat render failed' });
    } catch (e) {
      return NextResponse.json({ url: null, error: e instanceof Error ? e.message.slice(0, 200) : 'concat failed' }, { status: 502 });
    }
  }

  if (!mediaUrl) {
    return NextResponse.json({ url: null, error: 'mediaUrl required (upload the media first)' }, { status: 400 });
  }

  // ── DETERMINISTIC ops — auth-only (no balance gate, no charge: no AI/provider call). ──────────────
  if (DETERMINISTIC.has(action)) {
    const guard = await guardGeneration(req, 'video', { gate: false });
    if (!guard.ok) return guard.response;

    const src = await resolveMedia(mediaUrl);
    if (!src) return NextResponse.json({ url: null, error: 'could not resolve media' }, { status: 400 });

    try {
      // BATCH EXPORT — the non-linear editor's single round-trip: apply the whole accumulated draft in ONE
      // ffmpeg pass (crop → grade → fade + per-range audio mute for video; crop → grade for photo).
      if (action === 'render') {
        const d = body?.draft ?? {};
        const params: RenderDraft = {
          grade: d.grade,
          fadeInSec: d.fade?.inSec,
          fadeOutSec: d.fade?.outSec,
          crop: d.crop ?? null,
          mutedRanges: d.mutedRanges,
          segments: d.segments,
          durationSec: Number(body?.durationSec) || 0,
        };
        const url = body?.kind === 'photo'
          ? await renderPhotoDraft(src, params)
          : await renderVideoDraft(src, params);
        if (url) void saveCreation(req, guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'render failed' });
      }
      if (action === 'split') {
        const url = await trimClip(src, Number(body?.startSec) || 0, Math.max(1, Number(body?.durationSec) || 5));
        if (url) void saveCreation(req, guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'split failed' });
      }
      if (action === 'crop') {
        const b = body?.bounds ?? body?.target_bounds ?? {};
        const url = await cropClip(src, Number(b.x) || 0, Number(b.y) || 0, Number(b.w) || 0, Number(b.h) || 0);
        if (url) void saveCreation(req, guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'crop failed' });
      }
      if (action === 'detach') {
        const { video, audio } = await detachAudio(src);
        if (video) void saveCreation(req, guard.userId, video, action);
        return NextResponse.json({ url: video, audioUrl: audio, error: video ? undefined : 'detach failed' });
      }
      if (action === 'color') {
        const url = await gradeClip(src, {
          saturation: Number(body?.saturation), contrast: Number(body?.contrast),
          brightness: Number(body?.brightness), temperature: Number(body?.temperature),
        });
        if (url) void saveCreation(req, guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'color grade failed' });
      }
      if (action === 'fade') {
        const url = await fadeClip(src, {
          fadeInSec: Number(body?.fadeInSec) || 0, fadeOutSec: Number(body?.fadeOutSec) || 0,
          durationSec: Math.max(0.1, Number(body?.durationSec) || 0),
        });
        if (url) void saveCreation(req, guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'fade failed' });
      }
    } catch (e) {
      return NextResponse.json({ url: null, error: e instanceof Error ? e.message.slice(0, 200) : 'edit failed' }, { status: 502 });
    }
  }

  // ── GENERATIVE inpaint — object removal via a masked-inpaint model. Auth + balance gate + metered. ──
  // Honest labelling: this SYNTHESISES pixels inside the mask; it is not a deterministic "surgical" op.
  const guard = await guardGeneration(req, 'image');
  if (!guard.ok) return guard.response;

  // Read the operator's pinned model; if unset, fall back to a standard LaMa-style object-removal model (which
  // takes {image, mask}) and WARN in non-prod so nobody ships on an unverified default. Still needs the token.
  const model = process.env.REPLICATE_INPAINT_MODEL?.trim() || DEFAULT_INPAINT_MODEL;
  if (!process.env.REPLICATE_INPAINT_MODEL && process.env.NODE_ENV !== 'production') {
    console.warn(`[ai/edit] REPLICATE_INPAINT_MODEL unset — falling back to default inpaint model "${DEFAULT_INPAINT_MODEL}". Pin your own via the env var.`);
  }
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { url: null, error: 'inpaint_unconfigured', message: 'AI object-removal needs REPLICATE_API_TOKEN.' },
      { status: 503 },
    );
  }
  const rawMask = typeof body?.maskUrl === 'string' ? body.maskUrl : '';
  if (!rawMask) {
    return NextResponse.json({ url: null, error: 'maskUrl required (paint the region to remove)' }, { status: 400 });
  }
  const src = await resolveMedia(mediaUrl);
  // A mask is a data: URI (painted client-side) or a storage path — accept the data URI verbatim.
  const mask = /^data:/i.test(rawMask) ? rawMask : await resolveMedia(rawMask);
  if (!src || !mask) {
    return NextResponse.json({ url: null, error: 'could not resolve media or mask' }, { status: 400 });
  }

  const cost = creditCostFor('image');
  const ref = `edit:inpaint:${guard.userId}:${Date.now()}`;
  // Reserve-before-render: debit FIRST and HONOR the result. The pre-gate is fail-OPEN (a transient balance
  // read-miss lets a user through), so a genuinely broke user can reach here — an insufficient debit must block
  // the paid provider call, not fall through to a free inpaint. Only a POSITIVE 'insufficient' blocks; a
  // 'skipped' (RPC absent) or transient 'error' degrades to proceeding (the ledger's documented behavior).
  const debit = await deductCredits(guard.userId, cost, ref);
  if (!debit.ok && debit.reason === 'insufficient') {
    return NextResponse.json(
      { url: null, error: 'insufficient_credits', message: insufficientCreditsMessage(guard.locale) },
      { status: 402 },
    );
  }
  try {
    const created = await createPrediction(model, { image: src, mask, prompt: body?.prompt || '' });
    let out = created;
    if (created.status !== 'succeeded' && created.status !== 'failed') {
      out = await pollPrediction(created.id);
    }
    const url = out.status === 'succeeded' ? firstUrl(out.output) : null;
    if (!url) {
      if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {}); // compensation ONLY if we charged
      return NextResponse.json({ url: null, error: 'inpaint produced no output' }, { status: 502 });
    }
    void saveCreation(req, guard.userId, url, 'inpaint');
    return NextResponse.json({ url });
  } catch (e) {
    if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {}); // refund only a real charge
    return NextResponse.json({ url: null, error: e instanceof Error ? e.message.slice(0, 200) : 'inpaint failed' }, { status: 502 });
  }
}

/** Replicate outputs vary (string | string[] | object) — take the first URL-ish value. */
function firstUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const s = output.find((v) => typeof v === 'string');
    return typeof s === 'string' ? s : null;
  }
  return null;
}

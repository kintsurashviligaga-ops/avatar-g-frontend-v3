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
// Provider bodies must never reach the client — see lib/api/providerError.
import { providerErrorBody } from '@/lib/api/providerError';
import { guardGeneration, insufficientCreditsMessage } from '@/lib/api/generationGuard';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { reSignIfInternal, createSignedAssetUrl, parseSupabaseObjectUrl, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { trimClip } from '@/lib/video/trimClip';
import { cropClip, gradeClip, detachAudio, fadeClip, renderVideoDraft, renderPhotoDraft, renderConcat, type RenderDraft } from '@/lib/video/surgicalOps';
import { createPrediction, pollUntilDone } from '@/lib/replicate/client';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { maxrateForTarget } from '@/lib/services/montage/montagePlan';
import { saveEditorOutput } from '@/lib/orchestrator/saveEditorOutput';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // ffmpeg re-encode / inpaint poll headroom

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
// TEXT-GUIDED inpainting (inputs: image + mask + prompt) — the panel takes an optional description
// ("replace the background with a beach"), so a prompt-aware model makes that description actually matter. This is
// the very stable, widely-run SD-inpainting checkpoint; createPrediction resolves its latest version, and a bad
// slug fails cleanly + refunds. Operators wanting pure LaMa object-removal can pin REPLICATE_INPAINT_MODEL instead.
const DEFAULT_INPAINT_MODEL = 'stability-ai/stable-diffusion-inpainting';

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
/** Distinct sources allowed in ONE concat sequence. Must match MAX_SEQ_CLIPS in SurgicalEditor.tsx. */
const MAX_CONCAT_SOURCES = 12;

interface Bounds { x?: number; y?: number; w?: number; h?: number }

/** The client-accumulated non-linear edit draft, sent ONCE on "Export". */
interface DraftPayload {
  grade?: { saturation?: number; contrast?: number; brightness?: number; temperature?: number };
  fade?: { inSec?: number; outSec?: number };
  crop?: { x: number; y: number; w: number; h: number } | null;
  mutedRanges?: { start: number; end: number }[];
  /** Ordered export sequence (delete = omitted, reorder = array order). */
  segments?: { start: number; end: number; muted: boolean; transition?: 'none' | 'crossfade' | 'fade'; textOverlay?: TextOverlayPayload }[];
  /** Playback speed multiplier (0.25..4). */
  speed?: number;
}

interface TextOverlayPayload { text: string; position: 'top-left' | 'top-right' | 'bottom-center' | 'center'; fontSize: number; fontColor: string }

/** Best-effort save of an edited asset to the user's library (never blocks the response). */
// AWAITED at every call site, not fire-and-forget: a serverless function can be frozen the moment it
// responds, dropping an un-awaited write. The op itself is an ffmpeg render, so one small insert is
// noise next to it — and a result the user cannot find later is worse than a slightly slower response.
async function saveCreation(
  userId: string,
  url: string,
  action: EditAction,
  // ⚠️ MUST BE PASSED. This was hard-coded 'video' while the route also serves photo renders
  // (kind==='photo') and inpaint, both of which produce a PNG. saveEditorOutput maps 'video' →
  // service_type 'film', so a still was filed as a film — and the Library then puts it in a <video>
  // element whose onLoad never fires (permanent shimmer) and offers it for download as .mp4.
  media: 'video' | 'image' | 'audio' = 'video',
): Promise<void> {
  // LIBRARY ROW FIRST, in its own try: the `creations` insert below goes to a table nothing reads, and
  // wrapping both in one try meant a failure there would skip the row the Library actually shows.
  // saveEditorOutput writes the generation_jobs row the Library actually reads — that is the whole
  // job of this function.
  //
  // ⚠️ A SECOND INSERT INTO `creations` USED TO FOLLOW, AND THE TABLE DOES NOT EXIST. Verified against
  // the live database: GET /rest/v1/creations → 404 "Could not find the table 'public.creations' in
  // the schema cache". The migration creates `user_creations`; nothing anywhere creates `creations`.
  // So every single editor operation paid for a guaranteed-failing round trip and pushed a guaranteed
  // error into reportError — noise on the hot path that made the real errors harder to see, for a
  // write nothing ever read. Deleted rather than repointed: the Library row already exists.
  await saveEditorOutput({ userId, url, media, action });
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
    sequence?: { src: number; start: number; end: number; muted: boolean; transition?: 'none' | 'crossfade' | 'fade'; textOverlay?: TextOverlayPayload }[];
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
    // MAX_CONCAT_SOURCES must match MAX_SEQ_CLIPS in SurgicalEditor. It used to be a bare `slice(0, 5)`
    // that SILENTLY DROPPED clips 6+ — the sequence still referenced them by index, so the render either
    // failed or quietly used the wrong footage. Now it is a named cap, and the client refuses to build a
    // sequence past it, so the truncation can no longer be reached.
    const resolved = await Promise.all(body.sources.slice(0, MAX_CONCAT_SOURCES).map((s) => resolveMedia(s)));
    if (resolved.some((u) => !u)) {
      return NextResponse.json({ url: null, error: 'could not resolve all clip sources' }, { status: 400 });
    }
    const d = body?.draft ?? {};
    // `crop` was missing here while runSequence applies it post-fold — so a crop drawn on a multi-clip
    // sequence was accepted by the UI and then dropped on the way to ffmpeg. Forwarding it makes the
    // control real for sequences too, instead of only for a single clip.
    const params: RenderDraft = { grade: d.grade, fadeInSec: d.fade?.inSec, fadeOutSec: d.fade?.outSec, speed: d.speed, crop: d.crop ?? null };
    // NOTE the ABSENT `e.end > e.start` filter. That filter was the silent clip-dropper: a clip whose
    // duration the BROWSER could not measure (an iPhone HEVC .mov, 10-bit footage, any codec it lacks)
    // arrives with end === 0, and discarding it here meant the export came back one clip short with no
    // error anywhere. Such windows now pass through as OPEN and are resolved inside renderConcat by
    // ffmpeg, which decodes what the browser cannot. Only a source ffmpeg ALSO cannot read is dropped —
    // and it is reported below rather than vanishing.
    const seq = body.sequence
      .filter((e) => e && Number.isInteger(e.src) && e.src >= 0 && e.src < resolved.length)
      .map((e) => ({ src: e.src, start: Number(e.start), end: Number(e.end), muted: !!e.muted, transition: e.transition, textOverlay: e.textOverlay }));
    if (!seq.length) return NextResponse.json({ url: null, error: 'empty sequence' }, { status: 400 });
    // ── ENCODE BUDGET ───────────────────────────────────────────────────────────────────────────────
    //
    // ⚠️ THIS CALL USED TO PASS NOTHING, and the two guards that exist for exactly this failure — the
    // VBV cap in videoTail() and the buffer sink — were therefore only ever used by Montage.
    //
    // 'ultrafast' is bitrate-INEFFICIENT, so an uncapped CRF20 stitch of twelve clips balloons past the
    // Supabase upload limit, and host() then base64s that whole master (a 1.33× string on top of the
    // buffer, ~2.3× peak) before uploading — the precise OOM shape uploadBufferAndSign was written to
    // avoid. Long exports died as an unexplained "concat render failed" or a killed lambda.
    //
    // The cap only trims bitrate SPIKES; CRF quality is untouched wherever it already fits. The timeout
    // is set BELOW maxDuration=300 on purpose: ffmpeg must lose first, so the route can answer with a
    // real reason instead of the platform returning a gateway timeout with an unparseable body.
    const totalOutSec = seq.reduce((a, e) => a + Math.max(0, (Number(e.end) || 0) - (Number(e.start) || 0)), 0);
    try {
      let dropped: Array<{ index: number; reason: string }> = [];
      const url = await renderConcat(resolved as string[], seq, params, Number(body?.targetW) || 1280, Number(body?.targetH) || 720, {
        maxrateKbps: maxrateForTarget(totalOutSec), // the SAME formula Montage uses — one bitrate policy, not two
        timeoutMs: 240_000,
        // Stream the finished master straight to storage as BYTES — no base64 inflation, and
        // uploadBufferAndSign self-heals a size rejection where uploadAndSign silently returns null.
        sink: (buf) => uploadBufferAndSign(
          UPLOAD_BUCKET,
          `edits/concat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`,
          buf,
          'video/mp4',
          604_800,
        ),
        onDrop: (d) => { dropped = d.map((x) => ({ index: x.index, reason: x.reason })); },
      });
      if (url) await saveCreation(guard.userId, url, 'render', 'video');
      return NextResponse.json({
        url,
        error: url ? undefined : 'concat render failed',
        // Stated, not hidden: the editor shows "N clips could not be read" beside the result instead of
        // passing a short export off as a complete one.
        ...(dropped.length ? { droppedClips: dropped, renderedClips: seq.length - dropped.length } : {}),
      });
    } catch (e) {
      const safe = providerErrorBody(e);
      return NextResponse.json({ url: null, error: safe.error, message: safe.message }, { status: safe.status });
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
          speed: d.speed,
          durationSec: Number(body?.durationSec) || 0,
        };
        const isPhotoRender = body?.kind === 'photo';
        const url = isPhotoRender
          ? await renderPhotoDraft(src, params)
          : await renderVideoDraft(src, params);
        // A photo render produces a PNG. Filing it as 'video' is what put a still inside a <video>
        // element in the Library and named its download .mp4.
        if (url) await saveCreation(guard.userId, url, action, isPhotoRender ? 'image' : 'video');
        return NextResponse.json({ url, error: url ? undefined : 'render failed' });
      }
      if (action === 'split') {
        const url = await trimClip(src, Number(body?.startSec) || 0, Math.max(1, Number(body?.durationSec) || 5));
        if (url) await saveCreation(guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'split failed' });
      }
      if (action === 'crop') {
        const b = body?.bounds ?? body?.target_bounds ?? {};
        const url = await cropClip(src, Number(b.x) || 0, Number(b.y) || 0, Number(b.w) || 0, Number(b.h) || 0);
        if (url) await saveCreation(guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'crop failed' });
      }
      if (action === 'detach') {
        const { video, audio } = await detachAudio(src);
        if (video) await saveCreation(guard.userId, video, action, 'video');
        // The detached AUDIO was produced and returned to the client but never filed, so the half of
        // this operation the user actually asked for vanished on refresh.
        if (audio) await saveCreation(guard.userId, audio, action, 'audio');
        return NextResponse.json({ url: video, audioUrl: audio, error: video ? undefined : 'detach failed' });
      }
      if (action === 'color') {
        const url = await gradeClip(src, {
          saturation: Number(body?.saturation), contrast: Number(body?.contrast),
          brightness: Number(body?.brightness), temperature: Number(body?.temperature),
        });
        if (url) await saveCreation(guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'color grade failed' });
      }
      if (action === 'fade') {
        const url = await fadeClip(src, {
          fadeInSec: Number(body?.fadeInSec) || 0, fadeOutSec: Number(body?.fadeOutSec) || 0,
          durationSec: Math.max(0.1, Number(body?.durationSec) || 0),
        });
        if (url) await saveCreation(guard.userId, url, action);
        return NextResponse.json({ url, error: url ? undefined : 'fade failed' });
      }
    } catch (e) {
      const safe = providerErrorBody(e);
      return NextResponse.json({ url: null, error: safe.error, message: safe.message }, { status: safe.status });
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
    // The inpaint prompt DESCRIBES what to synthesise inside the mask ("ზღვის ფონი დაუყენე") and the
    // checkpoint reading it is English-only — a Georgian description was noise, so the model invented
    // something unrelated inside the mask and the credit was spent on it. Nothing on this path is
    // reproduced verbatim: the mask region is generated pixels, never text. Fail-open by construction.
    const inpaintPrompt = await promptToEnglish(typeof body?.prompt === 'string' ? body.prompt : '', 'image');
    const created = await createPrediction(model, { image: src, mask, prompt: inpaintPrompt });
    let out = created;
    if (created.status !== 'succeeded' && created.status !== 'failed') {
      // ⚠️ THIS WAS A SINGLE `pollPrediction`, AND IT MADE OBJECT REMOVAL FAIL 100% OF THE TIME.
      //
      // createPrediction sends `Prefer: respond-async` (lib/replicate/client.ts:53), so it returns as
      // soon as the job is QUEUED — status 'starting'. Polling once, milliseconds later, still reads
      // 'starting', so `url` came out null, the credit was refunded and the route answered 502
      // "inpaint produced no output". An inpaint takes tens of seconds; it was never given any of them.
      // The Replicate token is valid — this failed with a perfectly good key.
      //
      // pollUntilDone already existed for exactly this (client.ts:94) and is what the storyboard and
      // pipeline routes use. Bounded to 240s so it always loses to maxDuration=300 and the caller gets
      // a real JSON reason rather than a gateway timeout with an unparseable body.
      out = await pollUntilDone(created.id, 120, 2000);
    }
    const url = out.status === 'succeeded' ? firstUrl(out.output) : null;
    if (!url) {
      if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {}); // compensation ONLY if we charged
      return NextResponse.json({ url: null, error: 'inpaint produced no output' }, { status: 502 });
    }
    await saveCreation(guard.userId, url, 'inpaint', 'image'); // inpaint output is always an image
    return NextResponse.json({ url });
  } catch (e) {
    if (debit.ok) await refundCredits(guard.userId, cost, ref).catch(() => {}); // refund only a real charge
    const safe = providerErrorBody(e);
    return NextResponse.json({ url: null, error: safe.error, message: safe.message }, { status: safe.status });
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

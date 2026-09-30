import 'server-only';
import { BudgetExceededError, guardedCall } from '@/lib/services/billing/guardedCall';
import { costPerSecondUsd, DEFAULT_TIER, resolutionFor, resolveModel } from '@/lib/veo/capabilities';
import { createVeoClip, deliverableUrl, pollVeoClip, veoTransport, type CreateVeoClipResult } from '@/lib/veo/engine';
import { downloadGeminiVideo } from '@/lib/veo/geminiTransport';
import type { OutputFormat, VeoAspect, VeoDuration, VeoPollOutcome, VeoTransport, VeoVideo } from '@/lib/veo/types';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { stripBottomWatermark } from '@/lib/video/remixOps';

/**
 * Render ONE Veo clip and return a hosted URL — blocking, for routes that render inside a single request.
 *
 * ⚠️ WHY THIS EXISTS. Veo was reachable from exactly one place in the codebase: ServiceManager, whose
 * Veo leg is split across a create method and a separate task-ref poller because the film pipeline is
 * asynchronous (submit → task-ref → poll → callback). Every other surface that wanted Veo — Product-Ad
 * most of all — had no way to call it, which is the real reason those surfaces were still on Kling. It
 * was never a capability gap; it was a wiring gap.
 *
 * So this collapses the same steps into one blocking call: create → poll → deliver. The signature
 * deliberately mirrors `klingI2v` — image + prompt + aspect in, hosted URL or null out — so it drops into
 * an existing `veo || kling || kenBurns` chain without restructuring the caller.
 *
 * ⚠️ IT GOES THROUGH lib/veo/engine, NOT A PRIVATE CLIENT. This file used to call lib/ai/geminiVeo
 * directly, which (a) could only ever render on the Gemini API — adding GCP credentials moved the film
 * pipeline to Vertex AI and left this surface behind — and (b) spent Google money OUTSIDE the daily budget
 * guard: every product ad was a Veo clip the platform envelope never saw. The engine picks the transport;
 * the submit runs inside guardedCall, priced exactly like ServiceManager.veoGuardPrice prices a film clip.
 *
 * ⚠️ IT RETURNS null RATHER THAN THROWING, ON EVERY PATH. That is the contract the fallback chains
 * already depend on: a miss must degrade to the next engine, never take down a paid render. The one
 * thing it must never do is return a URL it has not verified is playable. A budget refusal is a miss too:
 * the caller's next engine is not Google spend.
 *
 * ⚠️ AN AMBIGUOUS CREATE IS NEVER RE-SUBMITTED. The transports classify a timed-out / 5xx submit as
 * `ambiguous` — Google MAY have accepted it and MAY bill it, so a second POST can mean two billed clips for
 * one ad. It returns null (the caller falls through) and the budget keeps the estimate for it; only a
 * definitive refusal (nothing was created) is booked at $0.
 *
 * ⚠️ SQUARE IS REFUSED ON PURPOSE. Veo has no 1:1 — the engine renders a square request as a 16:9 frame
 * for post-production to crop, and this path has no post — so accepting it would silently hand back a
 * landscape video for an ad the user sized for a square placement. Returning null lets the caller keep an
 * engine that can actually do it. Silently changing the user's chosen shape is the exact defect class this
 * codebase has been clearing out.
 */

/** Veo's own ceiling. The API rejects >8s with a 400 "out of bound". */
const VEO_MAX_SEC = 8;
const VEO_MIN_SEC = 4;
/** The film pipeline's cadence: a Veo clip takes roughly a minute, so a tighter interval only burns quota. */
const POLL_INTERVAL_MS = 5_000;
/** 7 days — like every other clip URL handed to the assembler and the library (and V4 signing's own maximum). */
const DELIVERY_TTL_SEC = 604_800;
/** Anything smaller is not a playable clip — the floor ServiceManager.deliverVeoVideo uses too. */
const MIN_CLIP_BYTES = 1_024;
/** The engine sends the prompt as given; 2000 keeps the legacy client's cap (Veo accepts far longer, but not unbounded). */
const PROMPT_MAX_CHARS = 2_000;
/** The legacy client's negative cap, cut on a comma boundary so a truncated fragment is never submitted. */
const NEGATIVE_MAX_CHARS = 800;

export interface VeoSyncArgs {
  /** i2v anchor (https or data URL). Omit for text-to-video. */
  startImage?: string;
  promptText: string;
  /** '1:1' is REFUSED — see the note above. */
  aspect: '9:16' | '16:9' | '1:1' | string;
  durationSec?: number;
  negativePrompt?: string;
  /** Storage path prefix, so callers can keep their renders separable. Also the Veo session (Vertex GCS prefix). */
  folder?: string;
  /** Total wall-clock budget for create + poll. Must sit inside the caller's route maxDuration. */
  budgetMs?: number;
  /** Who the Google spend is booked against in the budget ledger. Optional: an unattributed clip is still guarded. */
  userId?: string | null;
}

export interface VeoSyncResult {
  url: string;
  engine: string;
}

/** True when Veo can serve this request at all — a transport is configured (and not killed), and a shape it supports. */
export function veoCanRender(aspect: string): boolean {
  return veoTransport() !== null && aspect !== '1:1';
}

/** The engine string the route reports — the same wording ServiceManager's badge uses for either transport. */
function engineLabel(transport: VeoTransport | null, model: string): string {
  const name = transport === 'vertex' ? 'Veo on Vertex AI' : 'Gemini Veo';
  return model ? `${name} (${model})` : name;
}

/**
 * The seconds Veo renders: its 4 / 6 / 8 s grid, rounded UP (the budget never under-counts). For the whole
 * seconds 4–8 this module submits, that is exactly the engine's own snap (nearest, a tie goes up), so the
 * guard books the clip that is actually rendered.
 */
function renderedSeconds(durationSec: number): VeoDuration {
  return durationSec <= 4 ? 4 : durationSec <= 6 ? 6 : 8;
}

/** The output format for the engine; anything unrecognised renders landscape, as the legacy client did. */
function outputFormat(aspect: string): OutputFormat {
  return aspect === '9:16' || aspect === '16:9' || aspect === '4:5' ? aspect : '16:9';
}

function negativeFor(raw: string | undefined): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  return s.length <= NEGATIVE_MAX_CHARS ? s : s.slice(0, NEGATIVE_MAX_CHARS).replace(/,[^,]*$/, '');
}

/**
 * A definitive refusal created no job and bills nothing → $0. An `ambiguous` submit MAY have created a billed
 * job, so it keeps the estimate — the budget errs toward counting money that may be spent.
 */
function submitActualCost(result: unknown): number | undefined {
  const outcome = (result as CreateVeoClipResult | null)?.outcome;
  return outcome && !outcome.ok && outcome.reason !== 'ambiguous' ? 0 : undefined;
}

/**
 * Crop the Gemini API's visible bottom mark off a downloaded clip and host the result (audio kept).
 *
 * ⚠️ ORDER MATTERS FOR COST. This used to upload the raw clip and then hand stripBottomWatermark the
 * resulting signed URL — so ffmpeg pulled the same ~10MB clip straight back down over the network to
 * crop it, and the uncropped object then sat in the bucket for its full 7-day TTL with nothing
 * pointing at it (one orphan per scene, every film). ffmpeg reads a path exactly like a URL, so the
 * crop works off the bytes we already have. The raw upload only happens if the crop does not produce a
 * hosted result.
 */
async function cropAndHost(buf: Buffer, aspect: VeoAspect): Promise<string | null> {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const scratch = await mkdtemp(join(tmpdir(), 'veo-sync-'));
  try {
    const local = join(scratch, 'veo.mp4');
    await writeFile(local, buf);
    const cropped = await stripBottomWatermark(local, aspect).catch(() => null);
    // ⚠️ stripBottomWatermark returns its INPUT unchanged when the crop percentage is 0, so only a real
    // hosted https result may become the delivered URL — a /tmp path must never escape this function.
    return cropped && /^https?:\/\//i.test(cropped) ? cropped : null;
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * A playable URL for a finished clip, or null. Never throws.
 *   · gcs (Vertex AI)  → a V4 signed read URL on our own bucket. Nothing to download, and no crop: Vertex
 *                        stamps no visible mark, so cropping would only cut real picture off the bottom.
 *   · gemini-file      → the raw URI needs the API key to read, so it can never be handed to a client:
 *                        downloaded SERVER-SIDE (the key never leaves), watermark cropped, hosted ONCE.
 *   · bytes            → inline output (only Vertex returns it — no GCS prefix): hosted as-is, uncropped
 *                        for the same reason as gcs.
 */
async function deliver(video: VeoVideo | undefined, nativeAspect: VeoAspect, folder: string): Promise<string | null> {
  if (!video) return null;
  if (video.kind === 'gcs') {
    try {
      return await deliverableUrl(video, DELIVERY_TTL_SEC);
    } catch {
      return null; // signing failed (VeoGcsError) — a miss, never a dead URL
    }
  }
  const buf = video.kind === 'bytes' ? Buffer.from(video.base64, 'base64') : await downloadGeminiVideo(video.uri);
  if (!buf || buf.byteLength < MIN_CLIP_BYTES) return null;
  const cropped = video.kind === 'gemini-file' ? await cropAndHost(buf, nativeAspect) : null;
  // Crop disabled (VEO_WATERMARK_CROP_PCT=0), missed, or not needed → host the clip as rendered.
  return cropped ?? (await uploadBufferAndSign('renders', `${folder}/${Date.now()}.mp4`, buf, 'video/mp4', DELIVERY_TTL_SEC));
}

export async function renderVeoClipSync(args: VeoSyncArgs): Promise<VeoSyncResult | null> {
  const aspect = args.aspect;
  // veoCanRender, with the transport kept: it prices the budget guard below.
  const transport = veoTransport();
  if (!transport || aspect === '1:1') return null;
  const promptText = typeof args.promptText === 'string' ? args.promptText.trim() : '';
  if (!promptText) return null;

  const budgetMs = Number.isFinite(args.budgetMs) && (args.budgetMs as number) > 0 ? (args.budgetMs as number) : 240_000;
  // The clock covers create + poll, as budgetMs promises — create can spend ~15 s fetching the start image.
  const deadline = Date.now() + budgetMs;
  const durationSec = Number.isFinite(args.durationSec)
    ? Math.min(VEO_MAX_SEC, Math.max(VEO_MIN_SEC, Math.round(args.durationSec as number)))
    : VEO_MAX_SEC;
  const seconds = renderedSeconds(durationSec);
  // The default tier is what the legacy client rendered (veo-3.1-generate-preview, GEMINI_VEO_MODEL honoured).
  const model = resolveModel(transport, DEFAULT_TIER);
  const folder = (args.folder || 'veo').replace(/[^a-z0-9/_-]/gi, '');
  const negativePrompt = negativeFor(args.negativePrompt);

  try {
    const created = await guardedCall(
      {
        service: 'video',
        model,
        // ⚠️ The seconds Veo RENDERS at the exact tier × resolution × audio rate — the flat video line
        // under-reserves a Standard clip ~3×. Audio is always on here (the ad's whole point is native audio).
        units: seconds,
        unitCostUsd: costPerSecondUsd(model, resolutionFor(seconds), true, transport),
        ...(args.userId ? { userId: args.userId } : {}),
        promptSummary: promptText.slice(0, 200),
        actualCost: submitActualCost,
      },
      () =>
        createVeoClip({
          request: {
            prompt: promptText.slice(0, PROMPT_MAX_CHARS),
            aspect: outputFormat(aspect),
            durationSec,
            generateAudio: true,
            ...(negativePrompt ? { negativePrompt } : {}),
            ...(args.startImage ? { startImage: { kind: 'url' as const, url: args.startImage } } : {}),
          },
          sessionId: folder,
          ordinal: 0,
        }),
    );
    // Refused, not configured, or ambiguous — never re-submitted (see the header); the caller's chain takes over.
    if (!created.outcome.ok) return null;
    const operation = created.outcome.operation.name;

    // Poll to completion inside the budget. A throw is a transient miss, like every other transient: keep waiting.
    let poll: VeoPollOutcome = { state: 'processing' };
    while (poll.state === 'processing' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      poll = await pollVeoClip(operation).catch((): VeoPollOutcome => ({ state: 'processing' }));
    }
    // filtered (Google's safety rules) / failed / deadline passed → the caller falls through to its next engine.
    if (poll.state !== 'succeeded') return null;

    // The NATIVE frame Veo rendered (the engine's normalised request), which is what the crop must fit.
    const url = await deliver(poll.videos[0], created.request.aspect, folder);
    if (!url) return null; // generated but undeliverable — treat as a miss, never return a dead URL
    return { url, engine: engineLabel(created.transport, created.model) };
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      // eslint-disable-next-line no-console
      console.warn(`[veoClipSync] refused by the budget guard (${err.reason}) → the caller's next engine`);
    }
    // Fail-open by contract — the caller's fallback chain handles it.
    return null;
  }
}

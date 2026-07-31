import 'server-only';
import {
  hasGeminiVeoProvider, geminiVeoModel, createGeminiVeoClip, pollGeminiVeoTask, fetchVeoVideoBuffer,
} from '@/lib/ai/geminiVeo';
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
 * So this collapses the same five steps into one blocking call: create → poll → download server-side →
 * re-host → strip the bottom watermark. The signature deliberately mirrors `klingI2v` — image + prompt +
 * aspect in, hosted URL or null out — so it drops into an existing `veo || kling || kenBurns` chain
 * without restructuring the caller.
 *
 * ⚠️ IT RETURNS null RATHER THAN THROWING, ON EVERY PATH. That is the contract the fallback chains
 * already depend on: a miss must degrade to the next engine, never take down a paid render. The one
 * thing it must never do is return a URL it has not verified is playable.
 *
 * ⚠️ SQUARE IS REFUSED ON PURPOSE. Veo has no 1:1 — geminiVeo maps anything that is not 9:16 to 16:9 —
 * so accepting a square request would silently hand back a landscape video for an ad the user sized for
 * a square placement. Returning null lets the caller keep an engine that can actually do it. Silently
 * changing the user's chosen shape is the exact defect class this codebase has been clearing out.
 */

/** Veo's own ceiling. The API rejects >8s with a 400 "out of bound". */
const VEO_MAX_SEC = 8;
const VEO_MIN_SEC = 4;

export interface VeoSyncArgs {
  /** i2v anchor (https or data URL). Omit for text-to-video. */
  startImage?: string;
  promptText: string;
  /** '1:1' is REFUSED — see the note above. */
  aspect: '9:16' | '16:9' | '1:1' | string;
  durationSec?: number;
  negativePrompt?: string;
  /** Storage path prefix, so callers can keep their renders separable. */
  folder?: string;
  /** Total wall-clock budget for create + poll. Must sit inside the caller's route maxDuration. */
  budgetMs?: number;
}

export interface VeoSyncResult {
  url: string;
  engine: string;
}

/** True when Veo can serve this request at all — key present, not killed, and a shape it supports. */
export function veoCanRender(aspect: string): boolean {
  return hasGeminiVeoProvider() && aspect !== '1:1';
}

export async function renderVeoClipSync(args: VeoSyncArgs): Promise<VeoSyncResult | null> {
  const aspect = args.aspect;
  if (!veoCanRender(aspect)) return null;
  if (!args.promptText?.trim()) return null;

  const budgetMs = Number.isFinite(args.budgetMs) && (args.budgetMs as number) > 0 ? (args.budgetMs as number) : 240_000;
  const durationSec = Number.isFinite(args.durationSec)
    ? Math.min(VEO_MAX_SEC, Math.max(VEO_MIN_SEC, Math.round(args.durationSec as number)))
    : VEO_MAX_SEC;

  try {
    const created = await createGeminiVeoClip({
      promptText: args.promptText,
      ...(args.startImage ? { promptImage: args.startImage } : {}),
      aspect: aspect as '9:16' | '16:9',
      durationSec,
      ...(args.negativePrompt ? { negativePrompt: args.negativePrompt } : {}),
    });
    if (!created?.operation) return null;

    // Poll to completion inside the budget. 5s matches the film pipeline's cadence; a Veo clip takes
    // roughly a minute, so a tighter interval only burns quota against an operation that is not ready.
    const deadline = Date.now() + budgetMs;
    let uri: string | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5_000));
      const poll = await pollGeminiVeoTask(created.operation);
      if (poll.status === 'succeeded' && poll.uri) { uri = poll.uri; break; }
      if (poll.status === 'failed') return null;
    }
    if (!uri) return null; // deadline passed — caller falls through to its next engine

    // The raw Veo URI needs the API key to read, so it can never be handed to a client. Download
    // server-side, re-host, then crop the watermark (audio preserved — that is the whole point of
    // moving this surface to Veo).
    const buf = await fetchVeoVideoBuffer(uri);
    if (!buf) return null;
    const folder = (args.folder || 'veo').replace(/[^a-z0-9/_-]/gi, '');
    const hosted = await uploadBufferAndSign('renders', `${folder}/${Date.now()}.mp4`, buf, 'video/mp4', 604_800);
    if (!hosted) return null; // generated but undeliverable — treat as a miss, never return a dead URL

    const cropAspect = (aspect === '9:16' ? '9:16' : '16:9') as '9:16' | '16:9';
    const finalUrl = (await stripBottomWatermark(hosted, cropAspect).catch(() => null)) || hosted;
    return { url: finalUrl, engine: `Gemini Veo (${geminiVeoModel()})` };
  } catch {
    // Fail-open by contract — the caller's fallback chain handles it.
    return null;
  }
}

/**
 * lib/video/director/server.ts — the live bindings: GoogleVeoProvider on lib/veo/engine, planStoryboard on Gemini.
 *
 * Its own module (and NOT in the ./index barrel) because it carries 'server-only', the Veo engine, storage, the budget
 * guard and the text-LLM client. The pure director, provider and storyboard rules stay importable from a client
 * component or a test without any of that; the route that will run the pipeline imports this file.
 *
 *   liveVeoEngine           VeoEnginePort over lib/veo/engine — the same primitives every other Veo caller uses
 *                           (createVeoClip · pollVeoClip · hostGcsVideo · downloadGeminiVideo), no second engine.
 *   geminiStoryboardPlanner the planner over lib/ai/llmText with googleOnly: Gemini drafts, never another vendor (V1).
 *   createGoogleVideoDirector the two wired into createVideoDirector.
 *
 * ⚠️ THE SUBMIT RUNS INSIDE guardedCall — the platform's Google budget envelope — priced at the seconds Veo renders at
 * the exact tier × resolution × audio rate, like every other Veo call site. A budget refusal is a `quota` outcome
 * (→ ShotError rate_limit, not retryable): never a cheaper model, never another vendor.
 *
 * ⚠️ DELIVERY KEEPS THE PICTURE AS RENDERED. Other Gemini-API callers crop Google's visible bottom mark in post; here
 * a clip is hosted exactly as Veo returned it — cropping changes the approved frame, and that is a decision for the
 * assembly step, not the executor.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { llmText } from '@/lib/ai/llmText';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { BudgetExceededError, guardedCall } from '@/lib/services/billing/guardedCall';
import { costPerSecondUsd, DEFAULT_TIER, normalizeClipRequest, resolveModel } from '@/lib/veo/capabilities';
import { hostGcsVideo } from '@/lib/veo/deliver';
import { createVeoClip, pollVeoClip, veoTransport, type CreateVeoClipInput, type CreateVeoClipResult } from '@/lib/veo/engine';
import { downloadGeminiVideo } from '@/lib/veo/geminiTransport';
import type { VeoVideo } from '@/lib/veo/types';
import { createVideoDirector, type GoogleVideoDirector } from './director';
import { GoogleVeoProvider, veoWireFields, type VeoDeliveryContext, type VeoEnginePort } from './googleVeoProvider';
import { createGeminiStoryboardPlanner } from './planner';
import type { StoryboardPlanner } from './types';

/** 7 days — like every other clip URL the assembler and the Library receive (and V4 signing's own maximum). */
const DELIVERY_TTL_SEC = 604_800;
/** Anything smaller is not a playable clip — the floor the other Veo delivery paths use. */
const MIN_CLIP_BYTES = 1_024;

/** A definitive refusal created no job and bills nothing → $0; an `ambiguous` submit may have → keep the estimate. */
function submitActualCost(result: unknown): number | undefined {
  const outcome = (result as CreateVeoClipResult | null)?.outcome;
  return outcome && !outcome.ok && outcome.reason !== 'ambiguous' ? 0 : undefined;
}

async function createClipGuarded(input: CreateVeoClipInput, ctx: { userId?: string | null }): Promise<CreateVeoClipResult> {
  const transport = veoTransport();
  // No transport: the engine answers not_configured itself (naming what is missing) and spends nothing.
  if (!transport) return createVeoClip(input);
  const model = resolveModel(transport, input.tier ?? input.request.tier ?? DEFAULT_TIER);
  // The clip as the engine will render it — the price the guard reserves is the price Google charges.
  const { request } = normalizeClipRequest(input.request, model, transport);
  try {
    return await guardedCall(
      {
        service: 'video',
        model,
        units: request.durationSec,
        unitCostUsd: costPerSecondUsd(model, request.resolution, request.generateAudio, transport),
        ...(ctx.userId ? { userId: ctx.userId } : {}),
        promptSummary: request.prompt.slice(0, 200),
        actualCost: submitActualCost,
      },
      () => createVeoClip(input),
    );
  } catch (err) {
    // createVeoClip never throws, so whatever reached here happened before a submit: nothing exists at Google.
    const detail = err instanceof BudgetExceededError ? `the platform budget refused the render (${err.reason})` : 'the budget guard failed before the submit';
    return {
      outcome: { ok: false, reason: err instanceof BudgetExceededError ? 'quota' : 'unavailable', retryable: !(err instanceof BudgetExceededError), detail },
      request,
      adjustments: [],
      model,
      transport,
    };
  }
}

/** One object per operation: a re-delivery re-signs it instead of uploading the clip twice. */
function deliveryPath(ctx: VeoDeliveryContext): string {
  const board = ctx.storyboardId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'storyboard';
  const key = createHash('sha256').update(ctx.operationName).digest('hex').slice(0, 24);
  return `video-director/${board}/${ctx.order}-${key}.mp4`;
}

/**
 * A playable 7-day URL in our storage, or null. Never throws.
 *   · gcs (Vertex)    → copied once into Supabase (hostGcsVideo), so the Library can keep re-signing it.
 *   · gemini-file     → downloaded server-side (the key never leaves) and hosted once.
 *   · bytes           → hosted as returned.
 */
async function deliverClip(video: VeoVideo, ctx: VeoDeliveryContext): Promise<string | null> {
  const path = deliveryPath(ctx);
  try {
    if (video.kind === 'gcs') return await hostGcsVideo(video, path);
    const buf = video.kind === 'bytes' ? Buffer.from(video.base64, 'base64') : await downloadGeminiVideo(video.uri);
    if (!buf || buf.byteLength < MIN_CLIP_BYTES) return null;
    return await uploadBufferAndSign('renders', path, buf, video.mimeType || 'video/mp4', DELIVERY_TTL_SEC);
  } catch {
    return null;
  }
}

export const liveVeoEngine: VeoEnginePort = {
  transport: veoTransport,
  createClip: createClipGuarded,
  pollClip: pollVeoClip,
  deliver: deliverClip,
  wire: veoWireFields,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * planStoryboard's default LLM: Gemini through llmText with googleOnly (no DeepSeek / Atlas / Anthropic leg) and a
 * JSON reply. llmText also runs the platform's chat budget gate. VEO_DIRECTOR_MODEL is honoured, as by the film
 * director. Note: llmText's Gemini leg is the Gemini API (lib/gemini/client) — the repo has no Vertex text transport.
 */
export const geminiStoryboardPlanner: StoryboardPlanner = createGeminiStoryboardPlanner({
  generate: (prompt, opts) => {
    const directorModel = (process.env.VEO_DIRECTOR_MODEL || '').trim() || undefined;
    return llmText({
      system: opts.system,
      user: prompt,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      timeoutMs: opts.timeoutMs,
      googleOnly: true,
      json: true,
      ...(directorModel ? { geminiModel: directorModel } : {}),
    });
  },
});

export function createGoogleVideoDirector(): GoogleVideoDirector {
  return createVideoDirector({ provider: new GoogleVeoProvider({ engine: liveVeoEngine }), planner: geminiStoryboardPlanner });
}

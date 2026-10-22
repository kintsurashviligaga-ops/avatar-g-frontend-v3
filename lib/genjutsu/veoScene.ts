/**
 * lib/genjutsu/veoScene.ts — the `scene` op's engine leg: ONE Veo 3.1 reference-to-video clip, submitted and polled
 * through lib/veo/engine (Vertex AI once configured, else the Gemini API), delivered to our own storage. Server-only.
 *
 * ⚠️ WHY THIS IS NOT lib/ai/veoClipSync. That helper blocks (create → poll → deliver) inside one request and takes a
 * start image, not reference images. A blocking route needs a long function ceiling that vercel.json does not grant
 * `app/api/genjutsu/**` (its `app/api/**` catch-all is 15 s), and a closed phone tab must not decide whether a paid
 * render is delivered. So the scene is SUBMIT now, POLL later — two short requests — the shape ServiceManager's film
 * clips and /api/motion-control already use. The create and the delivery below are the same primitives those use
 * (createVeoClip · pollVeoClip · hostGcsVideo), not a second engine.
 *
 * ⚠️ THE SUBMIT RUNS INSIDE guardedCall — the platform's own Google budget envelope — priced at the seconds Veo
 * RENDERS at the exact tier × resolution × audio rate, like every other Veo call site. A refusal is a refusal, never a
 * silent fall to another vendor: with VIDEO_GOOGLE_ONLY on (the default) there is no other vendor, and this module
 * never reaches for one regardless.
 *
 * ⚠️ AN AMBIGUOUS CREATE IS NEVER RE-SUBMITTED (a timed-out or 5xx POST may already be a billed job — docs/VEO_ENGINE.md
 * §3). The caller refunds the user (they received nothing, and no operation name exists to poll) and tells them to retry.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { BudgetExceededError, guardedCall } from '@/lib/services/billing/guardedCall';
import { createSignedAssetUrl, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { costPerSecondUsd, resolutionFor, resolveModel } from '@/lib/veo/capabilities';
import { hostGcsVideo } from '@/lib/veo/deliver';
import { createVeoClip, pollVeoClip, veoTransport, type CreateVeoClipResult } from '@/lib/veo/engine';
import type { VeoAspect, VeoFailureReason, VeoMedia, VeoResizeMode, VeoTier, VeoTransport, VeoVideo } from '@/lib/veo/types';
import { SCENE_SECONDS } from './limits';
import type { GenjutsuQuality } from './types';

const WEEK_SEC = 604_800;
const MIN_CLIP_BYTES = 1_024;
const PROMPT_MAX_CHARS = 2_000;

/**
 * What a VFX scene must not contain. Nouns, never "no …" (Veo's negative-prompt rule). Deliberately NOT "logo" or "text":
 * a product reference carries its own branding, and the scene must keep it.
 */
export const SCENE_NEGATIVE_PROMPT = 'blurry, low quality, watermark, subtitles, captions, distorted face, deformed hands, extra limbs, duplicate subject';

export type SceneSubmit =
  | { ok: true; operation: string; aspect: VeoAspect; model: string; transport: VeoTransport; adjustments: string[] }
  | { ok: false; reason: VeoFailureReason | 'budget'; retryable: boolean };

/** A definitive refusal created no job and bills nothing → $0; an `ambiguous` submit may have → keep the estimate. */
function submitActualCost(result: unknown): number | undefined {
  const outcome = (result as CreateVeoClipResult | null)?.outcome;
  return outcome && !outcome.ok && outcome.reason !== 'ambiguous' ? 0 : undefined;
}

export interface SceneSubmitInput {
  prompt: string;
  aspect: VeoAspect;
  quality: GenjutsuQuality;
  /** Signed URLs of OUR OWN storage (the route signed them from the caller's own upload paths). At most 3 reach Veo. */
  referenceUrls: string[];
  userId: string;
  /** Groups the Vertex GCS inputs/outputs of this scene. */
  sessionId: string;
  /**
   * The Veo avatar (lib/avatar/veoAvatar): a built-in avatar's face, read by the server from its own files
   * (lib/avatar/curatedFace), as the clip's FIRST FRAME instead of references (Veo takes one or the other).
   */
  startImage?: VeoMedia & { kind: 'bytes' };
  /** How the first frame fits the aspect when its shape differs (Vertex; Google's default letterboxes it). */
  resizeMode?: VeoResizeMode;
  /** Replaces the VFX scene's negative prompt (the avatar's own). */
  negativePrompt?: string;
  /**
   * Veo's own sound; a silent clip is priced at Veo's silent rate. Default on — the voiced avatar keeps it too since
   * 2026-10-17 10:22Z: Veo says the line so its mouth matches, and its voice is replaced on delivery (lib/avatar/speechMatch).
   */
  audio?: boolean;
}

export async function submitScene(input: SceneSubmitInput): Promise<SceneSubmit> {
  const transport = veoTransport();
  if (!transport) return { ok: false, reason: 'not_configured', retryable: false };
  const tier: VeoTier = input.quality === 'standard' ? 'standard' : 'fast';
  const model = resolveModel(transport, tier);
  const audio = input.audio !== false;
  try {
    const created = await guardedCall(
      {
        service: 'video',
        model,
        units: SCENE_SECONDS,
        unitCostUsd: costPerSecondUsd(model, resolutionFor(SCENE_SECONDS), audio, transport),
        userId: input.userId,
        promptSummary: input.prompt.slice(0, 200),
        actualCost: submitActualCost,
      },
      () =>
        createVeoClip({
          request: {
            prompt: input.prompt.slice(0, PROMPT_MAX_CHARS),
            aspect: input.aspect,
            // Reference mode pins the clip to 8 s (the engine would snap to it anyway); say so, so the price is the length.
            durationSec: SCENE_SECONDS,
            generateAudio: audio,
            negativePrompt: input.negativePrompt ?? SCENE_NEGATIVE_PROMPT,
            ...(input.startImage && input.resizeMode ? { resizeMode: input.resizeMode } : {}),
            ...(input.startImage ? { startImage: input.startImage } : input.referenceUrls.length > 0 ? { referenceImages: input.referenceUrls.map((url) => ({ kind: 'url' as const, url })) } : {}),
          },
          tier,
          sessionId: input.sessionId,
          ordinal: 0,
        }),
    );
    if (!created.outcome.ok) return { ok: false, reason: created.outcome.reason, retryable: created.outcome.retryable };
    return {
      ok: true,
      operation: created.outcome.operation.name,
      // The NATIVE frame Veo renders (not the output format) — the watermark crop must fit that.
      aspect: created.request.aspect,
      model: created.model,
      transport: created.transport ?? transport,
      adjustments: created.adjustments.map((a) => a.field),
    };
  } catch (err) {
    if (err instanceof BudgetExceededError) return { ok: false, reason: 'budget', retryable: false };
    // createVeoClip does not throw; anything else is the budget guard's own fault — nothing was submitted.
    // eslint-disable-next-line no-console
    console.warn('[genjutsu.scene] submit threw before a job existed:', err instanceof Error ? err.message : String(err));
    return { ok: false, reason: 'unavailable', retryable: true };
  }
}

// ─── Poll + deliver ──────────────────────────────────────────────────────────────────────────────────────────────

export type SceneProgress =
  | { state: 'processing' }
  /** Veo finished; the clip could not be delivered THIS time (download / hosting miss) — the next poll retries. */
  | { state: 'delivering' }
  | { state: 'ready'; url: string }
  | { state: 'failed'; reason: 'filtered' | 'generation_failed' };

/** A fixed path per operation, so a re-poll re-signs one object instead of re-downloading, re-cropping, re-uploading. */
export function scenePath(userId: string, operation: string): string {
  const key = createHash('sha256').update(operation).digest('hex').slice(0, 24);
  return `genjutsu/${userId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'user'}/${key}.mp4`;
}

/**
 * A playable, 7-day URL for a finished clip, hosted in our storage at `path` — or null. Never throws.
 *   · Vertex (`gcs`)   → copied once into Supabase (hostGcsVideo); Vertex stamps no visible mark, so no crop.
 *   · inline `bytes`   → Vertex's output too: hosted once at `path`, uncropped.
 *   · a Developer API file → null. v3.1 no longer calls that API (engine.pollVeoClip never returns one now).
 */
export async function deliverScene(video: VeoVideo | undefined, path: string): Promise<string | null> {
  if (!video) return null;
  try {
    if (video.kind === 'gcs') return await hostGcsVideo(video, path);
    if (video.kind !== 'bytes') return null;

    const existing = await createSignedAssetUrl('renders', path, WEEK_SEC);
    if (existing) return existing;

    const buf = Buffer.from(video.base64, 'base64');
    if (buf.byteLength < MIN_CLIP_BYTES) return null;
    return await uploadBufferAndSign('renders', path, buf, 'video/mp4', WEEK_SEC);
  } catch {
    return null;
  }
}

/** Poll once. `userId` only names the delivery path. Never throws — a transient miss reads as "still working". */
export async function pollScene(operation: string, userId: string): Promise<SceneProgress> {
  const r = await pollVeoClip(operation).catch(() => null);
  if (!r || r.state === 'processing') return { state: 'processing' };
  if (r.state === 'filtered') return { state: 'failed', reason: 'filtered' };
  if (r.state === 'failed') return { state: 'failed', reason: 'generation_failed' };
  const url = await deliverScene(r.videos[0], scenePath(userId, operation));
  return url ? { state: 'ready', url } : { state: 'delivering' };
}

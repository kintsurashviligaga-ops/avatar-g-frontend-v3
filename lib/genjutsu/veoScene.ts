/**
 * lib/genjutsu/veoScene.ts — the `scene` op's engine leg: ONE Veo 3.1 reference-to-video clip, submitted and polled
 * through lib/veo/engine (Vertex AI once configured, else the Gemini API), delivered to our own storage. Server-only.
 *
 * ⚠️ WHY THIS IS NOT lib/ai/veoClipSync. That helper blocks (create → poll → deliver) inside one request and takes a
 * start image, not reference images. A blocking route needs a long function ceiling that vercel.json does not grant
 * `app/api/genjutsu/**` (its `app/api/**` catch-all is 15 s), and a closed phone tab must not decide whether a paid
 * render is delivered. So the scene is SUBMIT now, POLL later — two short requests — the shape ServiceManager's film
 * clips and /api/motion-control already use. The create and the delivery below are the same primitives those use
 * (createVeoClip · pollVeoClip · hostGcsVideo · downloadGeminiVideo · stripBottomWatermark), not a second engine.
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
import { createSignedAssetUrl, removeStorageObjects, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { costPerSecondUsd, resolutionFor, resolveModel } from '@/lib/veo/capabilities';
import { hostGcsVideo } from '@/lib/veo/deliver';
import { createVeoClip, pollVeoClip, veoTransport, type CreateVeoClipResult } from '@/lib/veo/engine';
import { downloadGeminiVideo } from '@/lib/veo/geminiTransport';
import type { VeoAspect, VeoFailureReason, VeoTier, VeoTransport, VeoVideo } from '@/lib/veo/types';
import { stripBottomWatermark } from '@/lib/video/remixOps';
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
}

export async function submitScene(input: SceneSubmitInput): Promise<SceneSubmit> {
  const transport = veoTransport();
  if (!transport) return { ok: false, reason: 'not_configured', retryable: false };
  const tier: VeoTier = input.quality === 'standard' ? 'standard' : 'fast';
  const model = resolveModel(transport, tier);
  try {
    const created = await guardedCall(
      {
        service: 'video',
        model,
        units: SCENE_SECONDS,
        unitCostUsd: costPerSecondUsd(model, resolutionFor(SCENE_SECONDS), true, transport),
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
            generateAudio: true,
            negativePrompt: SCENE_NEGATIVE_PROMPT,
            ...(input.referenceUrls.length > 0 ? { referenceImages: input.referenceUrls.map((url) => ({ kind: 'url' as const, url })) } : {}),
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
 *   · Gemini API       → downloaded SERVER-SIDE (the key never leaves), the visible bottom mark cropped, hosted once.
 */
export async function deliverScene(video: VeoVideo | undefined, aspect: VeoAspect, path: string): Promise<string | null> {
  if (!video) return null;
  try {
    if (video.kind === 'gcs') return await hostGcsVideo(video, path);

    const existing = await createSignedAssetUrl('renders', path, WEEK_SEC);
    if (existing) return existing;

    const buf = video.kind === 'bytes' ? Buffer.from(video.base64, 'base64') : await downloadGeminiVideo(video.uri);
    if (!buf || buf.byteLength < MIN_CLIP_BYTES) return null;

    // ffmpeg reads the crop input over https; the staging copy is removed once the clean clip is hosted.
    const rawPath = path.replace(/\.mp4$/, '-raw.mp4');
    const raw = await uploadBufferAndSign('renders', rawPath, buf, 'video/mp4', 3_600);
    if (!raw) return null;
    // Only a Gemini-API file carries the visible bottom mark; inline bytes come from Vertex, which stamps none.
    const clean = video.kind === 'gemini-file'
      ? await stripBottomWatermark(raw, aspect, undefined, { bucket: 'renders', path }).catch(() => null)
      : null;
    // stripBottomWatermark hands back its INPUT when the crop is switched off (VEO_WATERMARK_CROP_PCT=0) — that is the
    // staging URL, deleted below. Only a result hosted at the fixed path is the cropped clip.
    let final = clean && clean !== raw ? clean : null;
    if (!final) {
      final = (await createSignedAssetUrl('renders', path, WEEK_SEC)) ?? (await uploadBufferAndSign('renders', path, buf, 'video/mp4', WEEK_SEC));
    }
    await removeStorageObjects('renders', [rawPath]);
    return final;
  } catch {
    return null;
  }
}

/** Poll once. `userId` only names the delivery path. Never throws — a transient miss reads as "still working". */
export async function pollScene(operation: string, aspect: VeoAspect, userId: string): Promise<SceneProgress> {
  const r = await pollVeoClip(operation).catch(() => null);
  if (!r || r.state === 'processing') return { state: 'processing' };
  if (r.state === 'filtered') return { state: 'failed', reason: 'filtered' };
  if (r.state === 'failed') return { state: 'failed', reason: 'generation_failed' };
  const url = await deliverScene(r.videos[0], aspect, scenePath(userId, operation));
  return url ? { state: 'ready', url } : { state: 'delivering' };
}

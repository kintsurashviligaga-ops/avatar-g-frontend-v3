/**
 * lib/genjutsu/hfMotion.ts — the `motion` and `swap` ops' engine leg: Higgsfield models, driven by the EXISTING studio
 * saga (lib/studio/saga — estimate → confirmed price → reserve → submit ONCE → webhook/poll → copy to our storage →
 * Library, refund on every failure). This module builds the model INPUT and reads a saga job back; it charges nothing
 * and calls no provider itself. Server-only.
 *
 * ⚠️ THE REGISTRY'S SCHEMA IS THE CONTRACT, NOT THIS FILE'S GUESS. lib/providers/registry validates every input against
 * the model's strict zod schema (an unknown key is a 422 at the provider), and the saga refuses an invalid input BEFORE
 * it reserves a credit. So the input is built from the keys the schema DECLARES — `modelAcceptsKey` — and a field the
 * registry's schema does not yet carry is left out rather than sent:
 *   · Kling 3 Motion Control: image_url · video_url · prompt · keep_original_sound · character_orientation.
 *     The preset's prompt rides here, so this is the default motion engine.
 *   · Genjutsu motion-transfer (registered today with video_url + image_urls only — its docs also list `prompt` and
 *     `resolution`, and up to 8 images; the registry predates that page): the preset CANNOT ride until the registry
 *     schema gains `prompt`, at which point this code sends it with no change.
 *   · Genjutsu object-swap: not registered. `opStatuses` keeps `swap` locked until `hf/genjutsu-swap` exists.
 *
 * The price is the saga's live quote (priceFromUsd of Higgsfield's own /estimate), shown on the button and charged
 * only when `confirmedGel` equals a fresh quote (lib/genjutsu/pricing explains why no local number could be the bill).
 */
import 'server-only';
import type { StudioJob } from '@/lib/studio/store';
import { getModel } from '@/lib/providers/registry';

/** The keys a registered model's strict input schema declares (looking through a `.refine` wrapper). */
function shapeOf(schema: unknown): Record<string, unknown> | null {
  let s = schema as { shape?: unknown; _def?: { schema?: unknown; innerType?: unknown } } | undefined;
  for (let i = 0; i < 4 && s; i++) {
    if (s.shape && typeof s.shape === 'object') return s.shape as Record<string, unknown>;
    s = (s._def?.schema ?? s._def?.innerType) as typeof s;
  }
  return null;
}

export function modelAcceptsKey(modelId: string, key: string): boolean {
  const shape = shapeOf(getModel(modelId)?.input);
  return !!shape && key in shape;
}

export interface HfInputArgs {
  modelId: string;
  /** Signed URLs of OUR storage — the photo(s) the selection rule picked, and the verified source video. */
  imageUrls: string[];
  videoUrl: string;
  /** The finished English prompt (preset + the user's translated line). */
  prompt: string;
  keepSound: boolean;
}

/** The model input for one Higgsfield op, or null when the model is unknown / takes neither image shape. */
export function buildHfInput(a: HfInputArgs, accepts: (modelId: string, key: string) => boolean = modelAcceptsKey): Record<string, unknown> | null {
  if (!getModel(a.modelId)) return null;
  if (accepts(a.modelId, 'image_url')) {
    // Kling Motion Control: ONE character image, the motion video, and the scene described in the prompt.
    const first = a.imageUrls[0];
    if (!first) return null;
    return {
      image_url: first,
      video_url: a.videoUrl,
      ...(accepts(a.modelId, 'prompt') ? { prompt: a.prompt } : {}),
      ...(accepts(a.modelId, 'keep_original_sound') ? { keep_original_sound: a.keepSound ? 'yes' : 'no' } : {}),
      // The character follows the VIDEO's orientation — the whole point of transferring its motion.
      ...(accepts(a.modelId, 'character_orientation') ? { character_orientation: 'video' } : {}),
    };
  }
  if (accepts(a.modelId, 'image_urls')) {
    if (a.imageUrls.length === 0) return null;
    return {
      video_url: a.videoUrl,
      image_urls: a.imageUrls,
      ...(accepts(a.modelId, 'prompt') && a.prompt ? { prompt: a.prompt } : {}),
      ...(accepts(a.modelId, 'resolution') ? { resolution: '720p' } : {}),
    };
  }
  return null;
}

// ─── Reading a saga job back ─────────────────────────────────────────────────────────────────────────────────────

export type HfState = 'queued' | 'processing' | 'ready' | 'failed';

export interface HfJobView {
  state: HfState;
  /** A machine code the studio's error mapper already knows (components/studio/ui/serviceError). */
  errorCode: string | null;
  refunded: boolean;
}

/** The saga's many statuses, as the three the panel shows. Anything unrecognised reads as still working. */
export function hfJobView(job: Pick<StudioJob, 'status' | 'error_code' | 'refund_state'>): HfJobView {
  const refunded = job.refund_state === 'done';
  switch (job.status) {
    case 'completed':
      return { state: 'ready', errorCode: null, refunded: false };
    case 'failed':
    case 'nsfw':
    case 'canceled':
      return { state: 'failed', errorCode: job.status === 'nsfw' ? 'content_rejected' : job.error_code || 'generation_failed', refunded };
    case 'queued':
      return { state: 'queued', errorCode: null, refunded: false };
    default:
      return { state: 'processing', errorCode: null, refunded: false };
  }
}

/** The public id of a saga job as the client polls it. */
export const hfPublicId = (jobId: string): string => `hf:${jobId}`;
export function hfJobIdFromPublic(id: string): string | null {
  const m = /^hf:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(id.trim());
  return m ? m[1]! : null;
}

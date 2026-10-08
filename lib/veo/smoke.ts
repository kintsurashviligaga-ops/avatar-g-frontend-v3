import 'server-only';
import { costPerSecondUsd, resolutionFor, resolveModel } from './capabilities';
import { createVeoClip, deliverableUrl, pollVeoClip, transportOf, veoTransport } from './engine';
import { parseVertexOperationName } from './vertexClient';
import { redactSecrets, vertexConfig } from './vertexAuth';
import type { VeoPollOutcome } from './types';

/**
 * One paid Veo clip on the deployment's own keyless chain (GCP Part 0 "INFERENCE VERIFIED", admin only).
 *
 * The cheapest real render: Veo 3.1 Fast, 4 s, 720p, 16:9, native audio ($0.10/s → $0.40). Vertex AI only: it refuses
 * unless VEO_TRANSPORT pins vertex, so the test can never land on the Gemini API key. No Supabase write, no credit
 * ledger, no other provider — just createVeoClip → pollVeoClip → a short signed read URL from the Veo bucket.
 */
export const VEO_SMOKE_CONFIRM = 'paid-test';
export const VEO_SMOKE_TIER = 'fast' as const;
export const VEO_SMOKE_SECONDS = 4;
const VEO_SMOKE_PROMPT =
  'A slow dolly-in on a white ceramic teacup on a wooden table beside a sunlit window, thin steam rising, soft morning light. No people, no text.';
/** The signed URL only has to outlive the admin watching the clip once. */
const VEO_SMOKE_URL_TTL_SEC = 900;

export interface VeoSmokeQuote {
  model: string;
  durationSec: number;
  resolution: string;
  audio: boolean;
  estimateUsd: number;
}

export function veoSmokeQuote(): VeoSmokeQuote {
  const model = resolveModel('vertex', VEO_SMOKE_TIER);
  const resolution = resolutionFor(VEO_SMOKE_SECONDS);
  const estimateUsd = Math.round(costPerSecondUsd(model, resolution, true, 'vertex') * VEO_SMOKE_SECONDS * 100) / 100;
  return { model, durationSec: VEO_SMOKE_SECONDS, resolution, audio: true, estimateUsd };
}

/** Pinned to Vertex AND Vertex ready — the only state in which a submit may happen. */
export function veoSmokeReady(): boolean {
  return (process.env.VEO_TRANSPORT ?? '').trim().toLowerCase() === 'vertex' && veoTransport() === 'vertex';
}

export type VeoSmokeSubmit =
  | ({ ok: true; operation: string } & VeoSmokeQuote)
  | { ok: false; error: 'vertex_not_pinned' | 'submit_failed'; reason?: string; retryable?: boolean; detail?: string };

/** Submits exactly one clip. Never retries: a timeout may already have created a billed job. */
export async function submitVeoSmoke(): Promise<VeoSmokeSubmit> {
  if (!veoSmokeReady()) return { ok: false, error: 'vertex_not_pinned' };
  const quote = veoSmokeQuote();
  const result = await createVeoClip({
    request: { prompt: VEO_SMOKE_PROMPT, aspect: '16:9', durationSec: VEO_SMOKE_SECONDS, generateAudio: true },
    tier: VEO_SMOKE_TIER,
    sessionId: `admin-veo-smoke-${Date.now()}`,
    ordinal: 0,
  });
  const o = result.outcome;
  if (!o.ok) {
    return {
      ok: false,
      error: 'submit_failed',
      reason: o.reason,
      retryable: o.retryable,
      ...(o.detail ? { detail: redactSecrets(o.detail, 240) } : {}),
    };
  }
  return { ok: true, operation: o.operation.name, ...quote, model: result.model };
}

export type VeoSmokePoll =
  | { state: 'processing' }
  | { state: 'succeeded'; gcsUri: string; url: string }
  | { state: 'filtered'; reason: string }
  | { state: 'failed'; reason: string }
  | { state: 'invalid' };

/** Polls a Vertex operation of THIS project only; a succeeded clip comes back as a 15-minute signed read URL. */
export async function pollVeoSmoke(operation: string): Promise<VeoSmokePoll> {
  const name = typeof operation === 'string' ? operation.trim() : '';
  const parts = parseVertexOperationName(name);
  const cfg = vertexConfig();
  // Google may name the project by id or by number in the operation it returns.
  const ours = cfg ? [cfg.projectId, cfg.auth.mode === 'wif' ? cfg.auth.projectNumber : ''].filter(Boolean) : [];
  if (transportOf(name) !== 'vertex' || !parts || !ours.includes(parts.project)) return { state: 'invalid' };
  const outcome: VeoPollOutcome = await pollVeoClip(name);
  switch (outcome.state) {
    case 'processing':
      return { state: 'processing' };
    case 'filtered':
      return { state: 'filtered', reason: redactSecrets(outcome.reason, 240) };
    case 'failed':
      return { state: 'failed', reason: redactSecrets(outcome.reason, 240) };
    case 'succeeded': {
      const video = outcome.videos.find((v) => v.kind === 'gcs');
      if (!video || video.kind !== 'gcs') return { state: 'failed', reason: 'no gs:// output on a Vertex operation' };
      const url = await deliverableUrl(video, VEO_SMOKE_URL_TTL_SEC);
      return url ? { state: 'succeeded', gcsUri: video.gcsUri, url } : { state: 'failed', reason: 'no deliverable URL' };
    }
  }
}

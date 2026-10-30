/**
 * lib/genjutsu/chargeToken.ts — "this VFX scene is already paid for under ref R", signed, riding INSIDE the job id the
 * client polls verbatim (`<operation>::<aspect>::<createdMs>~gj1.<payload>.<mac>`).
 *
 * The scene route RESERVES credits before it submits to Veo, under a fresh server UUID — which cannot contain Veo's
 * operation name (it does not exist yet). So the status route learns the ref from this token, not from the id it polls,
 * not from a job row and not from the client (lib/orchestrator/jobChargeToken has the construction and the threat model:
 * the token binds user + ref + job, it cannot be re-pointed, and the AMOUNT is never in it — a refund pays back what the
 * LEDGER shows under the ref). Domain `genjutsu-charge:v1`, secret GENJUTSU_CHARGE_SECRET (service-role key fallback);
 * with no key the route refuses to reserve at all.
 */
import 'server-only';
import { createJobChargeToken, type JobCharge } from '@/lib/orchestrator/jobChargeToken';

export type GenjutsuCharge = JobCharge;

const token = createJobChargeToken({ prefix: 'gj1', domain: 'genjutsu-charge:v1', secretEnv: 'GENJUTSU_CHARGE_SECRET' });

/** True when tokens can be minted — checked BEFORE reserving, so a reservation never strands without one. */
export const genjutsuChargeReady = (): boolean => token.ready();

/** A fresh server-side reservation ref. Never client-derived (a client-keyed ref is a free-replay exploit). */
export const genjutsuChargeRef = (userId: string, uuid: string): string => `genjutsu:reserve:${uuid}:${userId}`;

/** The job-row id a reservation files under — derivable from the ref, so the status route needs no lookup. */
export const genjutsuJobId = (uuid: string): string => `genjutsu:${uuid}`;

/** The uuid inside a ref this module minted, or null for anything else. */
export function uuidFromRef(ref: string): string | null {
  const m = /^genjutsu:reserve:([0-9a-f-]{36}):/.exec(ref);
  return m ? m[1]! : null;
}

export const signGenjutsuCharge = (c: GenjutsuCharge): string | null => token.sign(c);
export const withGenjutsuCharge = (jobId: string, t: string): string => token.withToken(jobId, t);
export const genjutsuChargeForPolledId = (id: string): { jobId: string; charge: GenjutsuCharge | null } => token.forPolledId(id);

/**
 * The composite the token binds: Veo's operation, the native aspect it renders, and when the job was created. `voiced`
 * (`::v`) marks a talking avatar whose ElevenLabs line is laid over the clip on delivery (lib/avatar/veoAvatar) — inside
 * the signed id, so no caller can add or strip it. `clipSec` (`::c8`, `::c4v` …) marks the video service's direct clip
 * (app/api/video/clip) and its length; its `v` is a Georgian line laid over it the same way (lib/video/voicedClip).
 */
export function composeVeoJobId(operation: string, aspect: '16:9' | '9:16', createdMs: number, voiced = false, clipSec?: 4 | 6 | 8): string {
  const tail = clipSec ? `::c${clipSec}${voiced ? 'v' : ''}` : voiced ? '::v' : '';
  return `${operation}::${aspect}::${Math.round(createdMs)}${tail}`;
}

/**
 * The video service's clip on Gemini Omni Flash (lib/video/omniClip): its interaction id, frame, start and length — `::o10`,
 * or `::o4` · `::o6` · `::o8` for a clip in which a character says a Georgian line (GG's card 2026-10-26 10:55Z).
 * An uploaded video Omni edits or extends (app/api/video/omni-edit) names its op and billed seconds: `::oe6`, `::ox8`.
 */
export function composeOmniJobId(interactionId: string, aspect: '16:9' | '9:16', createdMs: number, edit?: { op: 'edit' | 'extend'; seconds: 4 | 6 | 8 | 10 }, clipSec: 4 | 6 | 8 | 10 = 10): string {
  const tail = edit ? `o${edit.op === 'edit' ? 'e' : 'x'}${edit.seconds}` : `o${clipSec}`;
  return `${interactionId}::${aspect}::${Math.round(createdMs)}::${tail}`;
}

export interface VeoJobId {
  /** Veo's operation name, or Omni's interaction id when `engine` is 'omni'. */
  operation: string;
  aspect: '16:9' | '9:16';
  createdMs: number;
  voiced: boolean;
  /** The direct clip's length (an Omni edit's or extend's billed seconds); null for a VFX scene or an avatar. */
  clipSec: 4 | 6 | 8 | 10 | null;
  /** Who renders it: Veo (every id but an Omni clip's and an uploaded video's edit) or Gemini Omni Flash. */
  engine: 'veo' | 'omni';
  /** What Omni was asked for: a clip, or an edit / extend of an uploaded video. Null on Veo. */
  omniOp: 'clip' | 'edit' | 'extend' | null;
}

const TAIL = /^(?:v|c([468])(v?)|o(4|6|8|10)|o([ex])(4|6|8|10))$/;

export function parseVeoJobId(jobId: string): VeoJobId | null {
  const parts = jobId.split('::');
  const tail = parts.length === 4 ? TAIL.exec(parts[3]!) : null;
  if (parts.length !== 3 && !tail) return null;
  const [operation, aspect, created] = parts as [string, string, string];
  const createdMs = Number(created);
  if (!operation || (aspect !== '16:9' && aspect !== '9:16') || !Number.isFinite(createdMs) || createdMs <= 0) return null;
  if (tail?.[3]) return { operation, aspect, createdMs, voiced: false, clipSec: Number(tail[3]) as 4 | 6 | 8 | 10, engine: 'omni', omniOp: 'clip' };
  if (tail?.[4]) {
    return { operation, aspect, createdMs, voiced: false, clipSec: Number(tail[5]) as 4 | 6 | 8 | 10, engine: 'omni', omniOp: tail[4] === 'e' ? 'edit' : 'extend' };
  }
  const clipSec = tail?.[1] ? (Number(tail[1]) as 4 | 6 | 8) : null;
  return { operation, aspect, createdMs, voiced: !!tail && (clipSec ? tail[2] === 'v' : true), clipSec, engine: 'veo', omniOp: null };
}

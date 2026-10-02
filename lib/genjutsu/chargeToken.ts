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

/** The composite the token binds: Veo's operation, the native aspect it renders, and when the job was created. */
export function composeVeoJobId(operation: string, aspect: '16:9' | '9:16', createdMs: number): string {
  return `${operation}::${aspect}::${Math.round(createdMs)}`;
}

export function parseVeoJobId(jobId: string): { operation: string; aspect: '16:9' | '9:16'; createdMs: number } | null {
  const parts = jobId.split('::');
  if (parts.length !== 3) return null;
  const [operation, aspect, created] = parts as [string, string, string];
  const createdMs = Number(created);
  if (!operation || (aspect !== '16:9' && aspect !== '9:16') || !Number.isFinite(createdMs) || createdMs <= 0) return null;
  return { operation, aspect, createdMs };
}

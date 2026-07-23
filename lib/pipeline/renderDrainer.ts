/**
 * lib/pipeline/renderDrainer.ts — pure logic for the serverless render-drainer (Phase 92).
 *
 * The film render is client-driven (submit→poll from the browser tab). If the tab is fully closed
 * mid-render, the generation_jobs row is left stuck at `processing` forever — the user paid and no
 * terminal state ever fires. The SAFE, serverless-correct first leg of a cron drainer is to REAP
 * those genuinely-abandoned rows: mark them `failed` so the UI + a refund reconciliation can act.
 *
 * SAFETY INVARIANT: the stale threshold MUST exceed the longest legit render (60s film ≈ 10 min),
 * so a slow-but-live browser-driven render is NEVER reaped. Pure + deterministic (nowMs injected) so
 * the decision is unit-tested without a clock or a DB. The full leg-advancing drainer (dispatch |
 * poll | assemble) is a later, staged step; this file ships only the reaper decision it needs.
 */

/** Well beyond the ~10-min max render, so a live render's row is never mistaken for abandoned. */
export const RENDER_STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export interface DrainJobRow {
  id: string;
  status: string;
  /** ISO — last time the client (or a drainer tick) advanced the row. */
  updated_at: string;
  /** Owner — selected by the drainer so a reaped, credit-charged render can be refunded. */
  user_id?: string | null;
  /** Job params JSONB. Carries `_reserve { ref, credits }` when credits were debited up front. */
  params?: Record<string, unknown> | null;
}

/** A refundable reservation extracted from a reaped job row. */
export interface ReapReserve {
  userId: string;
  credits: number;
  /** The IN-ROUTE reserve ref. The drainer refunds `${ref}:refund` (identical to refundProduce), and
   *  refund_credits dedupes on that ref → a drainer refund + the in-route refund collapse to one credit-back. */
  ref: string;
}

/**
 * Extract a refundable reservation from a reaped job row, or null when there is nothing SAFE to refund.
 *
 * A row qualifies ONLY with a non-empty user_id AND a well-formed params._reserve { ref:string, credits>0 }.
 * Only charged reservations are ever stamped (recordJobReservation) — a free-slot or skipped reservation
 * carries no `_reserve`, so the drainer never mints credits for one. Every field is guarded: a malformed
 * or partial `_reserve` yields null (never guess an amount). The caller refunds `${ref}:refund`; because
 * refund_credits is idempotent on that ref, a re-reap (e.g. failJob missed after a refund) can't double-pay.
 */
export function reapReserve(job: DrainJobRow): ReapReserve | null {
  if (!job) return null;
  const userId = typeof job.user_id === 'string' ? job.user_id.trim() : '';
  if (!userId) return null;
  const p = job.params;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const r = (p as Record<string, unknown>)._reserve;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const rec = r as Record<string, unknown>;
  const ref = typeof rec.ref === 'string' ? rec.ref.trim() : '';
  const credits = typeof rec.credits === 'number' && Number.isFinite(rec.credits) ? Math.round(rec.credits) : 0;
  if (!ref || credits <= 0) return null;
  return { userId, credits, ref };
}

/**
 * A row is reapable only when it is `processing` AND its last update is older than `thresholdMs`
 * (default RENDER_STALE_THRESHOLD_MS). Anything pending/completed/failed, or recently touched, is left
 * alone. An unparseable timestamp is treated as NOT reapable (never guess a job dead).
 */
export function isReapable(job: DrainJobRow, nowMs: number, thresholdMs: number = RENDER_STALE_THRESHOLD_MS): boolean {
  if (!job || job.status !== 'processing' || typeof job.updated_at !== 'string') return false;
  const t = Date.parse(job.updated_at);
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= thresholdMs;
}

/** Filter a batch of rows to the reapable ones (deterministic; nowMs injected). */
export function selectReapable(jobs: readonly DrainJobRow[], nowMs: number, thresholdMs: number = RENDER_STALE_THRESHOLD_MS): DrainJobRow[] {
  return (jobs || []).filter((j) => isReapable(j, nowMs, thresholdMs));
}

/** Is the drainer allowed to run? Requires an explicit opt-in flag so it stays INERT on main until staged. */
export function drainerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|on)$/i.test((env.RENDER_DRAINER_ENABLED || '').trim());
}

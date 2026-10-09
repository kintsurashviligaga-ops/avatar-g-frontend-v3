/**
 * Generation-job persistence (server-only) — durable lifecycle for the swarm
 * produce pipelines so a browser reload can recover the timeline (#5).
 *
 * Source of truth is the `generation_jobs` table (row id == SSE pipelineId).
 * Every produce route:
 *   1. createJob(...)            → inserts a `pending` row before streaming;
 *   2. recordJobEvent(id, emit)  → mirrors each SSE stage into the row
 *                                  (processing → completed | failed);
 * and the client recovery API reads the user's recent rows on mount.
 *
 * Writes go through the service-role client so they succeed even though the
 * route may stream after the request scope. Everything is best-effort and
 * fail-OPEN: if Supabase is unconfigured or a write throws, generation still
 * proceeds — persistence is an enhancement, never a gate.
 *
 * ⚠️ TERMINAL IS TERMINAL. `completed` and `failed` are final: updateJobStage, completeJob, failJob and
 * recordJobSettle only move a row that is still `pending` or `processing`, and answer whether one moved. They
 * used to write by id alone, so a late stage write revived a cancelled or reaped job, and a render finishing
 * after the drainer had failed and refunded it turned the row back into `completed` (the user kept the video
 * AND the refund). A false answer means nothing moved: the row is already final, missing, or the write failed.
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { notifyUser } from '@/lib/notifications/dispatch';
import type { NotifyKind } from '@/lib/notifications/types';
import type { ProduceKind } from './rate-limit';

// PHASE 7.1 — fire a completion notification (best-effort) so the bell populates when a
// generation finishes. ProduceKind → notification type + Georgian message. Skipped for
// manual library saves (the user already has the asset) and for the anonymous demo user.
const NOTIF_MESSAGE: Partial<Record<ProduceKind, string>> = {
  film: '🎬 თქვენი ვიდეო მზადაა!',
  avatar: '🎬 თქვენი ავატარი მზადაა!',
  image: '🖼 თქვენი სურათი მზადაა!',
  music: '🎵 თქვენი მუსიკა მზადაა!',
  voice: '🎤 თქვენი ხმა მზადაა!',
  interior: '🏠 თქვენი დიზაინი მზადაა!',
};
function notifyKindFor(kind: ProduceKind): NotifyKind {
  return kind === 'music' ? 'music' : kind === 'image' ? 'image' : kind === 'avatar' ? 'avatar' : kind === 'film' ? 'film' : 'video';
}
// The bell, plus Web Push and the user's linked WhatsApp (lib/notifications/dispatch.ts). `jobId` dedupes: these rows
// are upserted by id, and a second upsert of a finished job must not tell the user twice.
async function fireCompletionNotification(sb: ReturnType<typeof createServiceRoleClient>, userId: string, kind: ProduceKind, source?: string, jobId?: string): Promise<void> {
  if (!sb || !userId || source === 'manual-save') return;
  try {
    await notifyUser({
      userId,
      kind: notifyKindFor(kind),
      title: NOTIF_MESSAGE[kind] ?? '✅ თქვენი შედეგი მზადაა!',
      body: '',
      url: '/library',
      dedupeKey: jobId ? `job:${jobId}` : undefined,
      locale: 'ka',
    });
  } catch { /* fail-open */ }
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface GenerationJobRow {
  id: string;
  user_id: string;
  service_type: ProduceKind;
  status: JobStatus;
  current_stage: string | null;
  pct: number;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  signed_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  /** 1-based queue position while a client job WAITS (status pending); null once rendering or
   *  terminal. Optional — absent on rows read before the position_in_queue migration is applied. */
  position_in_queue?: number | null;
}

const TABLE = 'generation_jobs';

/** The statuses a row can still move from; `completed` and `failed` are final. */
export const LIVE_STATUSES: readonly JobStatus[] = ['pending', 'processing'];

function client(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

/** Insert a `pending` job row. Best-effort; returns true on a confirmed write. */
/**
 * Accept a CLIENT-SUPPLIED job id, or fall back to a fresh one.
 *
 * Why a client id at all: the v2 services run synchronously, so the browser only learns the server's job
 * id once the whole render is finished — far too late to poll `current_stage` while it works. Letting the
 * client name the job up front is what makes live per-leg progress possible.
 *
 * ⚠️ SECURITY — this is why it validates rather than trusting. An arbitrary caller-supplied id could name
 * ANOTHER USER'S job row; `updateJobStage` and `completeJob` patch by id alone, so a colliding id would
 * let one user stamp progress onto someone else's render. Two defences: the shape must be a v4-style
 * UUID, and `createJob` must report that the INSERT actually landed — a collision fails the insert, and
 * the caller then uses its own generated id instead.
 */
export function safeJobId(candidate: unknown, fallback: string): string {
  return typeof candidate === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : fallback;
}

export async function createJob(input: {
  id: string;
  userId: string;
  serviceType: ProduceKind;
  params?: Record<string, unknown>;
  /** A job already submitted to its provider is born `processing` (default `pending` — queued, not yet started). */
  status?: 'pending' | 'processing';
}): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  const processing = input.status === 'processing';
  try {
    const { error } = await sb.from(TABLE).insert({
      id: input.id,
      user_id: input.userId,
      service_type: input.serviceType,
      status: processing ? 'processing' : 'pending',
      current_stage: processing ? 'rendering' : 'queued',
      pct: processing ? 5 : 0,
      params: input.params ?? {},
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Merge a `_settle` record (lib/orchestrator/unpolledSettle) into an EXISTING, still live job row and mark it
 * `processing`, so the cron can settle the job if its browser never polls again. Best-effort and never throws; returns
 * true on a confirmed write (false for a row that is already final). Only call once credits were actually charged — the record names the ref to refund.
 */
export async function recordJobSettle(id: string, settle: Record<string, unknown>): Promise<boolean> {
  const sb = client();
  if (!sb || !id) return false;
  try {
    const { data } = await sb.from(TABLE).select('params').eq('id', id).maybeSingle();
    const raw = (data as { params?: unknown } | null)?.params;
    const prev = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const { data: moved, error } = await sb
      .from(TABLE)
      .update({ status: 'processing', current_stage: 'rendering', params: { ...prev, ...settle } })
      .eq('id', id)
      .in('status', [...LIVE_STATUSES])
      .select('id');
    return !error && Array.isArray(moved) && moved.length > 0;
  } catch (e) {
    reportError(e, { fn: 'recordJobSettle', id });
    return false;
  }
}

/**
 * Stamp the canonical reserve info onto a durable job's params so a render REAPED by the cron
 * drainer (tab closed → the in-route refund never fired) can refund the exact reserved credits
 * idempotently. The drainer refunds with `${ref}:refund` — the SAME ref refundProduce uses in-route —
 * so refund_credits dedupes to EXACTLY ONCE regardless of which path wins.
 *
 * ONLY call when credits were actually charged (reservation.charged): a free-slot or `skipped`
 * reservation has no matching debit, so stamping it would let the drainer MINT credits. Merges into
 * the existing params (never clobbers the render inputs). Best-effort, never throws — a lost stamp
 * just means the drainer can't auto-refund that one job (the in-route refund still covers the normal
 * failure path). No migration: params is JSONB.
 */
export async function recordJobReservation(id: string, reserve: { ref: string; credits: number }): Promise<void> {
  const sb = client();
  if (!sb) return;
  if (!reserve || !reserve.ref || !(reserve.credits > 0)) return;
  try {
    const { data } = await sb.from(TABLE).select('params').eq('id', id).maybeSingle();
    const raw = (data as { params?: unknown } | null)?.params;
    const prev = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    await sb
      .from(TABLE)
      .update({ params: { ...prev, _reserve: { ref: reserve.ref, credits: Math.round(reserve.credits) } } })
      .eq('id', id);
  } catch (e) {
    /* fail-open — no stamp just forgoes the drainer's auto-refund for this one job */
    reportError(e, { fn: 'recordJobReservation', id, ref: reserve.ref, credits: reserve.credits });
  }
}

/** Write `fields` onto a row that is still live. True when a row moved. Internal; never throws. */
async function transition(id: string, fields: Record<string, unknown>, fn: string): Promise<boolean> {
  const sb = client();
  if (!sb || !id) return false;
  try {
    const { data, error } = await sb.from(TABLE).update(fields).eq('id', id).in('status', [...LIVE_STATUSES]).select('id');
    if (error) {
      reportError(new Error(error.message), { fn, id });
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    reportError(e, { fn, id });
    return false;
  }
}

/** Advance a live job's stage/progress (status → processing). False when the row is final or missing. */
export async function updateJobStage(id: string, stage: string | null, pct: number | null): Promise<boolean> {
  const fields: Record<string, unknown> = { status: 'processing' };
  if (stage !== null) fields.current_stage = stage;
  if (pct !== null && Number.isFinite(pct)) fields.pct = Math.max(0, Math.min(100, Math.round(pct)));
  return transition(id, fields, 'updateJobStage');
}

/** Mark a live job completed with its final media payload. False when it was already final (failed, cancelled, reaped). */
export async function completeJob(
  id: string,
  out: { signedUrl: string | null; result: Record<string, unknown> },
): Promise<boolean> {
  return transition(id, {
    status: 'completed',
    current_stage: 'completed',
    pct: 100,
    signed_url: out.signedUrl,
    result: out.result,
  }, 'completeJob');
}

/**
 * The user_id that OWNS a job row, or null when the row does not exist / cannot be read.
 *
 * ⚠️ THIS EXISTS TO STOP A CREDIT-MINTING EXPLOIT. /api/motion-control/status refunded
 * `creditCostFor('remix')` to whoever POLLED, for whatever prediction id arrived in the query string,
 * with no check that the caller had ever paid for it. `klingPoll` reads ANY prediction on the shared
 * Replicate token, so a user could harvest failed prediction ids from another endpoint and mint credits
 * on repeat — the refund ref is per-id, so every fresh id minted again, without limit.
 *
 * A refund must therefore be authorised by the row written at CHARGE time, not by the poller.
 *
 * Returns null rather than throwing: the caller decides what an unknown owner means. For money that
 * decision must be fail-CLOSED — see the call site.
 */
export async function jobOwnerId(id: string): Promise<string | null> {
  const sb = client();
  if (!sb || !id) return null;
  try {
    const { data, error } = await sb.from(TABLE).select('user_id').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const owner = (data as { user_id?: unknown }).user_id;
    return typeof owner === 'string' && owner ? owner : null;
  } catch {
    return null;
  }
}

/**
 * Owner, status and stored result of a job row in ONE read, or null when it does not exist / cannot be read.
 *
 * For poll routes that must both authorise a write (the owner, as jobOwnerId) and short-circuit work that is
 * already done (the result). ⚠️ The row is OWNER-WRITABLE: `status` and `result` are whatever the owner last
 * wrote, so they may decide what the owner is shown — never what anyone is paid.
 */
export async function jobSnapshot(id: string): Promise<{ userId: string; status: string; result: Record<string, unknown> | null } | null> {
  const sb = client();
  if (!sb || !id) return null;
  try {
    const { data, error } = await sb.from(TABLE).select('user_id,status,result').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const row = data as { user_id?: unknown; status?: unknown; result?: unknown };
    if (typeof row.user_id !== 'string' || !row.user_id) return null;
    const result = row.result && typeof row.result === 'object' && !Array.isArray(row.result) ? (row.result as Record<string, unknown>) : null;
    return { userId: row.user_id, status: typeof row.status === 'string' ? row.status : '', result };
  } catch {
    return null;
  }
}

/** Mark a live job failed with a short reason. False when it was already final (a delivered job never turns failed). */
export async function failJob(id: string, error: string): Promise<boolean> {
  return transition(id, { status: 'failed', current_stage: 'failed', error: error.slice(0, 300) }, 'failJob');
}

/**
 * Persist a finished FILM master as a COMPLETED row in a SINGLE write.
 *
 * The conversational film studio renders through the orchestrate → assemble path
 * (not the produce routes), so its masters never landed in `generation_jobs` and
 * therefore never showed up in the user's durable Library. This upserts the
 * finished film directly as a completed 'film' job — keyed by the film token so a
 * re-stamp of the same film updates rather than duplicates — making it appear in
 * the per-user Library exactly like every other generation. Best-effort and
 * fail-OPEN: a missing Supabase or a write error never blocks film delivery.
 */
export async function recordCompletedFilm(input: {
  id: string;
  userId: string;
  url: string;
  prompt?: string | null;
  orientation?: string | null;
  result?: Record<string, unknown>;
  /** Estimated wholesale cost (USD/GEL) + wall-clock duration. Written to the dedicated
   *  generation_jobs columns when they exist; the upsert falls back to the base row if
   *  they don't, so a pre-migration DB never drops the film record. */
  costUsd?: number;
  costGel?: number;
  durationMs?: number;
  /** Telemetry sub-label (product | swap | motion …) stored in params — the DB service_type CHECK only
   *  allows film|avatar|interior|image|music|voice, so distinct dashboard labels ride here, not there. */
  subtype?: string;
}): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  // Base row (always valid). Cost/duration ride in dedicated columns + result JSONB.
  const base = {
    id: input.id,
    user_id: input.userId,
    service_type: 'film' as ProduceKind,
    status: 'completed' as JobStatus,
    current_stage: 'completed',
    pct: 100,
    params: {
      prompt: input.prompt ?? null,
      orientation: input.orientation ?? 'landscape',
      source: 'film-studio',
      ...(input.subtype ? { subtype: input.subtype } : {}),
    },
    result: input.result ?? { url: input.url },
    signed_url: input.url,
  };
  const withCost = {
    ...base,
    ...(input.costUsd != null ? { cost_usd: input.costUsd } : {}),
    ...(input.costGel != null ? { cost_gel: input.costGel } : {}),
    ...(input.durationMs != null ? { duration_ms: input.durationMs } : {}),
  };
  const hasCostCols = withCost !== base && (input.costUsd != null || input.costGel != null || input.durationMs != null);
  try {
    let { error } = await sb.from(TABLE).upsert(withCost, { onConflict: 'id' });
    // Defensive fallback: if the cost columns aren't migrated yet, the upsert errors on
    // the unknown column — retry with the base row so the film is still recorded.
    if (error && hasCostCols) {
      ({ error } = await sb.from(TABLE).upsert(base, { onConflict: 'id' }));
    }
    if (!error) await fireCompletionNotification(sb, input.userId, 'film', 'film-studio', input.id);
    return !error;
  } catch (e) {
    reportError(e, { fn: 'recordCompletedFilm', userId: input.userId });
    return false;
  }
}

/**
 * Generic sibling of recordCompletedFilm for one-shot assets (Smart Assistant
 * image / music generations). Files a COMPLETED generation_jobs row under the
 * given service_type so the asset shows in the user's Library immediately. Same
 * upsert-by-id idempotency + service-role write (user_id is set explicitly).
 * Best-effort: returns false on any miss, never throws.
 */
export async function recordCompletedAsset(input: {
  id: string;
  userId: string;
  serviceType: ProduceKind;
  url: string;
  prompt?: string | null;
  source?: string;
  /** Telemetry sub-label (e.g. 'motion') → params.subtype; service_type stays a CHECK-allowed value. */
  subtype?: string;
  /**
   * A caller-supplied URL that was PROVEN readable when filed (storage-adapter verifyFileableUrl) →
   * params.storage_verified. The Library re-signs a manual save's storage URL only when this is set.
   */
  storageVerified?: boolean;
}): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  try {
    const { error } = await sb.from(TABLE).upsert(
      {
        id: input.id,
        user_id: input.userId,
        service_type: input.serviceType,
        status: 'completed' as JobStatus,
        current_stage: 'completed',
        pct: 100,
        params: {
          prompt: input.prompt ?? null,
          source: input.source ?? 'smart-assistant',
          ...(input.subtype ? { subtype: input.subtype } : {}),
          ...(input.storageVerified ? { storage_verified: true } : {}),
        },
        result: { url: input.url },
        signed_url: input.url,
      },
      { onConflict: 'id' },
    );
    if (!error) await fireCompletionNotification(sb, input.userId, input.serviceType, input.source, input.id);
    return !error;
  } catch (e) {
    reportError(e, { fn: 'recordCompletedAsset', userId: input.userId });
    return false;
  }
}

/**
 * Mirror a single SSE emit into the durable row. Fire-and-forget: callers do
 * `void recordJobEvent(jobId, payload)` right after enqueuing the SSE chunk, so
 * persistence never adds latency to the live stream. No-op when jobId is null
 * (unauthenticated dev-bypass runs are not persisted).
 */
export function recordJobEvent(jobId: string | null, ev: Record<string, unknown>): void {
  if (!jobId) return;
  const stage = typeof ev.stage === 'string' ? ev.stage : undefined;
  const pct = typeof ev.pct === 'number' ? ev.pct : null;
  if (stage === 'completed') {
    const url = typeof ev.url === 'string' ? ev.url : null;
    void completeJob(jobId, { signedUrl: url, result: ev });
  } else if (stage === 'failed') {
    void failJob(jobId, typeof ev.error === 'string' ? ev.error : 'production failed');
  } else {
    void updateJobStage(jobId, stage ?? null, pct);
  }
}

/** Column projection shared by the recovery API read. */
export const JOB_COLUMNS =
  'id,user_id,service_type,status,current_stage,pct,params,result,signed_url,error,created_at,updated_at';

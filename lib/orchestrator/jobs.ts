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
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ProduceKind } from './rate-limit';

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
}

const TABLE = 'generation_jobs';

function client(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

/** Insert a `pending` job row. Best-effort; returns true on a confirmed write. */
export async function createJob(input: {
  id: string;
  userId: string;
  serviceType: ProduceKind;
  params?: Record<string, unknown>;
}): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  try {
    const { error } = await sb.from(TABLE).insert({
      id: input.id,
      user_id: input.userId,
      service_type: input.serviceType,
      status: 'pending',
      current_stage: 'queued',
      pct: 0,
      params: input.params ?? {},
    });
    return !error;
  } catch {
    return false;
  }
}

/** Patch arbitrary columns by job id. Internal; never throws. */
async function patch(id: string, fields: Record<string, unknown>): Promise<void> {
  const sb = client();
  if (!sb) return;
  try {
    await sb.from(TABLE).update(fields).eq('id', id);
  } catch {
    /* fail-open */
  }
}

/** Advance a job's stage/progress (status → processing). */
export async function updateJobStage(id: string, stage: string | null, pct: number | null): Promise<void> {
  const fields: Record<string, unknown> = { status: 'processing' };
  if (stage !== null) fields.current_stage = stage;
  if (pct !== null && Number.isFinite(pct)) fields.pct = Math.max(0, Math.min(100, Math.round(pct)));
  await patch(id, fields);
}

/** Mark a job completed and capture the final media payload for re-render. */
export async function completeJob(
  id: string,
  out: { signedUrl: string | null; result: Record<string, unknown> },
): Promise<void> {
  await patch(id, {
    status: 'completed',
    current_stage: 'completed',
    pct: 100,
    signed_url: out.signedUrl,
    result: out.result,
  });
}

/** Mark a job failed with a short reason. */
export async function failJob(id: string, error: string): Promise<void> {
  await patch(id, { status: 'failed', current_stage: 'failed', error: error.slice(0, 300) });
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
}): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  try {
    const { error } = await sb.from(TABLE).upsert(
      {
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
        },
        result: input.result ?? { url: input.url },
        signed_url: input.url,
      },
      { onConflict: 'id' },
    );
    return !error;
  } catch {
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
        params: { prompt: input.prompt ?? null, source: input.source ?? 'smart-assistant' },
        result: { url: input.url },
        signed_url: input.url,
      },
      { onConflict: 'id' },
    );
    return !error;
  } catch {
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

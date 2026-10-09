/**
 * lib/tasks/taskLive.ts — the real effects behind ./taskService: generation_jobs through the service role (every query
 * scoped to the caller by hand), and the two lease kinds through their own executors and workers
 * (lib/agent/media/montageExec + montageWorker, audioExtract + audioWorker), the same calls their routes make.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { execOf, leaseRowOf } from '@/lib/orchestrator/jobLease';
import { JOB_COLUMNS } from '@/lib/orchestrator/jobs';
import { runAfterResponse } from '@/lib/platform/afterResponse';
import { reportError } from '@/lib/observability/report-error';
import { MONTAGE_KIND, cancelMontageJob, montageJobStatus, viewOf } from '@/lib/agent/media/montageExec';
import { workMontageJob } from '@/lib/agent/media/montageWorker';
import { liveMontageDeps, newWorkerId } from '@/lib/agent/media/montageLive';
import { AUDIO_KIND, audioJobStatus, audioViewOf, cancelAudioJob } from '@/lib/agent/media/audioExtract';
import { workAudioJob } from '@/lib/agent/media/audioWorker';
import { liveAudioDeps } from '@/lib/agent/media/audioLive';
import { taskFromAudio, taskFromMontage, taskFromRow, type TaskRow } from './taskView';
import type { TaskDeps, TaskKind } from './taskService';

// The job tray's own projection (/api/orchestrator/jobs reads the same columns in Production).
const COLS = JOB_COLUMNS;
// A list also carries the studio queue's place, so the tray can lay waiting renders out again after a reload; where the
// column is missing (migration 20260704 not applied) the list falls back to COLS, as /api/orchestrator/jobs does.
const LIST_COLS = `${JOB_COLUMNS},position_in_queue`;

function rowOf(d: Record<string, unknown>): TaskRow | null {
  if (typeof d.id !== 'string' || typeof d.user_id !== 'string') return null;
  const obj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
  const s = (x: unknown) => (typeof x === 'string' ? x : null);
  return {
    id: d.id,
    user_id: d.user_id,
    service_type: s(d.service_type) ?? '',
    status: s(d.status) ?? '',
    current_stage: s(d.current_stage),
    pct: typeof d.pct === 'number' ? d.pct : null,
    params: obj(d.params),
    result: obj(d.result),
    signed_url: s(d.signed_url),
    error: s(d.error),
    created_at: s(d.created_at),
    updated_at: s(d.updated_at),
    position_in_queue: typeof d.position_in_queue === 'number' ? d.position_in_queue : null,
  };
}

/** Start a worker on the job after this response (or now, off Vercel). Its claim decides whether it runs at all. */
function after(name: string, work: () => Promise<unknown>): void {
  if (!runAfterResponse(work, name)) void work().catch(() => undefined);
}

const cancelled = (r: { ok: true } | { ok: false; error: string }): 'ok' | 'not_running' | 'not_found' =>
  r.ok ? 'ok' : r.error === 'not_running' ? 'not_running' : 'not_found';

const lease = (row: TaskRow) => leaseRowOf(row as unknown as Record<string, unknown>);

const montage: TaskKind = {
  async status(row, userId) {
    const s = await montageJobStatus(liveMontageDeps(), { userId, jobId: row.id });
    return 'ok' in s ? null : { task: taskFromMontage(row, MONTAGE_KIND, s.view), needsWorker: s.needsWorker };
  },
  view(row) {
    const l = lease(row);
    return l ? taskFromMontage(row, MONTAGE_KIND, viewOf(l)) : null;
  },
  async cancel(userId, id) {
    return cancelled(await cancelMontageJob(liveMontageDeps(), { userId, jobId: id }));
  },
  startWorker(id) {
    after('agent-montage-worker', () => workMontageJob(liveMontageDeps(), { jobId: id, worker: newWorkerId() }));
  },
};

const audio: TaskKind = {
  async status(row, userId) {
    const s = await audioJobStatus(liveAudioDeps(), { userId, jobId: row.id });
    return 'ok' in s ? null : { task: taskFromAudio(row, AUDIO_KIND, s.view), needsWorker: s.needsWorker };
  },
  view(row) {
    const l = lease(row);
    return l ? taskFromAudio(row, AUDIO_KIND, audioViewOf(l)) : null;
  },
  async cancel(userId, id) {
    return cancelled(await cancelAudioJob(liveAudioDeps(), { userId, jobId: id }));
  },
  startWorker(id) {
    after('agent-audio-worker', () => workAudioJob(liveAudioDeps(), { jobId: id, worker: newWorkerId() }));
  },
};

export function liveTaskDeps(): TaskDeps {
  const sb = () => {
    try { return createServiceRoleClient(); } catch { return null; }
  };
  return {
    async readRow(userId, id) {
      const c = sb();
      if (!c) return null;
      try {
        const { data, error } = await c.from('generation_jobs').select(COLS).eq('id', id).eq('user_id', userId).maybeSingle();
        if (error) { reportError(new Error(error.message), { fn: 'tasks.readRow' }); return null; }
        return data ? rowOf(data as Record<string, unknown>) : null;
      } catch (e) {
        reportError(e, { fn: 'tasks.readRow' });
        return null;
      }
    },
    async listRows(userId, { active, limit }) {
      const c = sb();
      if (!c) return [];
      try {
        const run = (cols: string) => {
          let q = c.from('generation_jobs').select(cols).eq('user_id', userId).order('updated_at', { ascending: false }).limit(limit);
          if (active) q = q.in('status', ['pending', 'processing']);
          return q;
        };
        let { data, error } = await run(LIST_COLS);
        if (error && /position_in_queue/i.test(error.message ?? '')) ({ data, error } = await run(COLS));
        if (error) { reportError(new Error(error.message), { fn: 'tasks.listRows' }); return []; }
        return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowOf).filter((r): r is TaskRow => r !== null);
      } catch (e) {
        reportError(e, { fn: 'tasks.listRows' });
        return [];
      }
    },
    kindOf: (row) => execOf(row.params)?.kind ?? null,
    kinds: { [MONTAGE_KIND]: montage, [AUDIO_KIND]: audio },
    plain: taskFromRow,
  };
}

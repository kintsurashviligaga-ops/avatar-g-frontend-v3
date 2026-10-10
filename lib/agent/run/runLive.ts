/**
 * lib/agent/run/runLive.ts — the real effects behind ./runExec: generation_jobs as the lease store, and each step tool
 * through its own executor and worker (lib/agent/media: the audio extraction, the montage, the edit), the same calls their own
 * routes make. A run adds no executor of its own.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { runAfterResponse } from '@/lib/platform/afterResponse';
import { MONTAGE_KIND } from '@/lib/agent/media/montageExec';
import { workMontageJob } from '@/lib/agent/media/montageWorker';
import { audit, liveMontageDeps, newWorkerId, quoteKey } from '@/lib/agent/media/montageLive';
import { AUDIO_KIND } from '@/lib/agent/media/audioExtract';
import { workAudioJob } from '@/lib/agent/media/audioWorker';
import { liveAudioDeps } from '@/lib/agent/media/audioLive';
import { EDIT_KIND } from '@/lib/agent/media/editExec';
import { workEditJob } from '@/lib/agent/media/editWorker';
import { liveEditDeps } from '@/lib/agent/media/editLive';
import { audioAdapter, editAdapter, montageAdapter } from './runAdapters';
import type { RunExecDeps } from './runExec';

/** Start a step job's worker after this response (or now, off Vercel). Its claim decides whether it runs at all. */
function startWorker(kind: string, taskId: string): void {
  const work = kind === MONTAGE_KIND
    ? () => workMontageJob(liveMontageDeps(), { jobId: taskId, worker: newWorkerId() })
    : kind === AUDIO_KIND
      ? () => workAudioJob(liveAudioDeps(), { jobId: taskId, worker: newWorkerId() })
      : kind === EDIT_KIND
        ? () => workEditJob(liveEditDeps(), { jobId: taskId, worker: newWorkerId() })
        : null;
  if (!work) return;
  if (!runAfterResponse(work, `agent-run-step:${kind}`)) void work().catch(() => undefined);
}

export function liveRunDeps(): RunExecDeps {
  return {
    store: supabaseLeaseStore(() => createServiceRoleClient(), reportError),
    adapters: { montage: montageAdapter(liveMontageDeps), audio_extract: audioAdapter(liveAudioDeps), edit: editAdapter(liveEditDeps) },
    startWorker,
    audit,
    key: quoteKey,
    now: () => Date.now(),
    newId: () => randomUUID(),
  };
}

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
import { kickDelivery } from '@/lib/notifications/outboxLive';
import { isAdminIdentity } from '@/lib/auth/adminGuard';
import { disabledServices } from '@/lib/server/serviceSwitches';
import { audioAdapter, editAdapter, montageAdapter } from './runAdapters';
import { agentValidateOn } from './engineFlags';
import { MAX_RUN_STEPS, type RunSpec, type RunTool } from './runSpec';
import { checkRunSpec, defaultRunCeiling, type RunValidateOutcome } from './runValidate';
import type { RunExecDeps, StepAdapter } from './runExec';

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

/** The server-truth admin rule for a user id (panel grants included). Any error is "not an admin" (fail closed). */
async function isAdminById(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createServiceRoleClient().auth.admin.getUserById(userId);
    return !error && !!data?.user && (await isAdminIdentity(data.user));
  } catch {
    return false;
  }
}

/**
 * VALIDATE (Phase 3.5a) with today's facts: the lifecycle registry, the service switches, the admin rule and the price
 * book (each adapter's list price). The per-run ceiling is AGENT_RUN_CEILING_CREDITS, else every step at the dearest price.
 */
function liveValidate(adapters: Readonly<Record<RunTool, StepAdapter>>) {
  return async (userId: string, spec: RunSpec): Promise<RunValidateOutcome> => {
    const prices = Object.values(adapters).map((a) => a.listPrice);
    const env = Number(process.env.AGENT_RUN_CEILING_CREDITS);
    const [off, isAdmin] = await Promise.all([disabledServices(), isAdminById(userId)]);
    return checkRunSpec(spec, {
      now: new Date(),
      isAdmin,
      switchedOff: new Set(off),
      priceBook: { montage: adapters.montage.listPrice, audio_extract: adapters.audio_extract.listPrice, edit: adapters.edit.listPrice },
      runCeilingCredits: Number.isFinite(env) && env > 0 ? env : defaultRunCeiling(MAX_RUN_STEPS, prices),
    }, (tool) => adapters[tool].listPrice);
  };
}

export function liveRunDeps(): RunExecDeps {
  const adapters = { montage: montageAdapter(liveMontageDeps), audio_extract: audioAdapter(liveAudioDeps), edit: editAdapter(liveEditDeps) };
  return {
    store: supabaseLeaseStore(() => createServiceRoleClient(), reportError),
    adapters,
    startWorker,
    audit,
    key: quoteKey,
    now: () => Date.now(),
    newId: () => randomUUID(),
    finished: kickDelivery,
    // Off unless AGENT_VALIDATE=on: absent, planRun / startRun / resumeRun behave exactly as before.
    ...(agentValidateOn() ? { validate: liveValidate(adapters) } : {}),
  };
}

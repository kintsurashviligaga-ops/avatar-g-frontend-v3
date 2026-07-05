/**
 * runRenderQueue — the background WORKER LOOP. It drives the pure asyncRenderQueue state machine
 * against real (or mock) provider adapters: submitting queued jobs, polling processing ones on the
 * configured interval, and applying each resolution until every job is terminal (or the wall-clock
 * budget trips). Meant to run in a SERVER-SIDE process (a node worker / cron tick), NOT a blocking
 * serverless request — which is exactly what lifts the 45s browser / function ceiling.
 *
 * `now` + `sleep` are injected so tests drive it with a fake clock and prove the whole multi-minute
 * lifecycle deterministically in milliseconds.
 */
import {
  type RenderJob, type RenderJobKind, type QueueConfig, DEFAULT_CONFIG,
  nextAction, markSubmitted, markSubmitError, applyResolution, markTimedOut, isTerminal, allTerminal,
} from './asyncRenderQueue';
import type { ProviderAdapter } from './renderProviders';

export interface RunDeps {
  /** One adapter per kind. A kind with no adapter fails its jobs cleanly (never hangs). */
  readonly adapters: Partial<Record<RenderJobKind, ProviderAdapter>>;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Called after every job mutation — wire to logging / DB persistence / asset routing. */
  onUpdate?(job: RenderJob): void;
  /** Wall-clock ceiling for the WHOLE batch (defaults to jobTimeout + 60s). */
  maxWallMs?: number;
  /** Hard cap on loop iterations (a runaway backstop; mainly for tests). */
  maxTicks?: number;
}

export async function runRenderQueue(
  initial: readonly RenderJob[],
  deps: RunDeps,
  cfg: QueueConfig = DEFAULT_CONFIG,
): Promise<RenderJob[]> {
  let jobs: RenderJob[] = [...initial];
  const start = deps.now();
  const maxWall = deps.maxWallMs ?? cfg.jobTimeoutMs + 60_000;
  let ticks = 0;

  const set = (i: number, next: RenderJob) => { jobs[i] = next; deps.onUpdate?.(next); };

  while (!allTerminal(jobs)) {
    if (deps.maxTicks !== undefined && ticks >= deps.maxTicks) break;
    if (deps.now() - start > maxWall) {
      jobs = jobs.map((j) => (isTerminal(j) ? j : markTimedOut(j, deps.now())));
      jobs.forEach((j) => deps.onUpdate?.(j));
      break;
    }
    ticks += 1;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!;
      const action = nextAction(job, deps.now(), cfg);
      const adapter = deps.adapters[job.kind];

      if (action === 'submit') {
        if (!adapter) { set(i, markSubmitError(job, `no ${job.kind} provider configured`, deps.now(), cfg)); continue; }
        const res = await adapter.submit({ ...job.params, slot: job.slot });
        set(i, res.ok && res.taskId
          ? markSubmitted(job, res.taskId, deps.now())
          : markSubmitError(job, res.error ?? 'submit failed', deps.now(), cfg));
      } else if (action === 'poll') {
        if (!adapter || !job.providerTaskId) { set(i, markTimedOut(job, deps.now())); continue; }
        const res = await adapter.poll(job.providerTaskId);
        set(i, applyResolution(job, res, deps.now()));
      } else if (action === 'timeout') {
        set(i, markTimedOut(job, deps.now()));
      }
      // 'wait' (poll not yet due) / 'done' (terminal) → nothing this tick
    }

    if (!allTerminal(jobs)) await deps.sleep(cfg.pollIntervalMs);
  }
  return jobs;
}

/**
 * lib/agent/e2e/invariants.ts — v5.1 Phase 9: what must hold after EVERY tick of every run, whatever the scenario.
 * Throws with a plain reason so a Jest failure names the broken rule. Test support only.
 *
 *   I-1  Every run status change is a legal transition (lib/agent/contracts RUN_TRANSITIONS); no run.invariant event.
 *   I-2  At most MAX_PARALLEL steps hold a live job (queued or running) at once.
 *   I-3  No step with a job was quoted above what the user approved for it (the run's tap, or the step's own yes).
 *   I-4  A run in a final state never changes again.
 *   I-5  The wallet is never charged more than the sum the user approved for the run.
 *   I-6  Event numbers only go up.
 */
import { RUN_TRANSITIONS, type RunStatus } from '@/lib/agent/contracts';
import { MAX_PARALLEL, isTerminalRun, type RunState } from '@/lib/agent/run/runEngine';

export interface Watch {
  /** The JSON of each run the first time it was seen final. */
  terminal: Map<string, string>;
  /** The most live step jobs seen at once, across the scenario. */
  maxLive: number;
}

const LIVE = new Set<RunStatus>(['queued', 'running']);
const WITH_JOB = new Set<RunStatus>(['queued', 'running', 'completed']);

export function statusPath(run: RunState): RunStatus[] {
  return ['queued', ...run.events.filter((e) => e.type === 'run.status').map((e) => e.detail as RunStatus)];
}

export function checkTick(watch: Watch, id: string, run: RunState, walletDelta: number): void {
  const fail = (rule: string, why: string) => { throw new Error(`${rule} broken on run ${id}: ${why}`); };

  const inv = run.events.filter((e) => e.type === 'run.invariant');
  if (inv.length) fail('I-1', `run.invariant event ${JSON.stringify(inv)}`);
  const path = statusPath(run);
  for (let i = 1; i < path.length; i += 1) {
    if (!RUN_TRANSITIONS[path[i - 1]!].includes(path[i]!)) fail('I-1', `${path[i - 1]} → ${path[i]} is not a legal transition`);
  }

  const live = run.steps.filter((s) => LIVE.has(s.status)).length;
  watch.maxLive = Math.max(watch.maxLive, live);
  if (live > MAX_PARALLEL) fail('I-2', `${live} live step jobs, cap ${MAX_PARALLEL}`);

  for (const s of run.steps) {
    if (s.reused || !WITH_JOB.has(s.status) || !s.quote) continue;
    if (s.quote.credits > s.approvedCredits) fail('I-3', `step ${s.id} quoted ✦${s.quote.credits} but approved ✦${s.approvedCredits}`);
  }

  const snap = JSON.stringify(run);
  const seen = watch.terminal.get(id);
  if (seen !== undefined && seen !== snap) fail('I-4', 'a final run changed');
  if (isTerminalRun(run) && seen === undefined) watch.terminal.set(id, snap);

  const approved = run.steps.reduce((sum, s) => sum + (s.reused ? 0 : s.approvedCredits), 0);
  if (-walletDelta > approved) fail('I-5', `wallet charged ✦${-walletDelta}, approved ✦${approved}`);

  for (let i = 1; i < run.events.length; i += 1) {
    if (run.events[i]!.seq <= run.events[i - 1]!.seq) fail('I-6', 'event numbers went down');
  }
}

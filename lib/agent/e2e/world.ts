/**
 * lib/agent/e2e/world.ts — v5.1 Phase 9: one in-memory world for end-to-end runs of Agent G's run engine
 * (lib/agent/run/runExec), with every outside effect faked: the lease store (generation_jobs), the montage, audio and
 * edit executors (lib/agent/media/testing), the wallet ledger. Workers run by hand, as runAfterResponse would.
 *
 * TEST SUPPORT ONLY. Imported by *.e2e.test.ts; nothing in the app imports it. It mirrors the world in
 * lib/agent/run/runExec.test.ts and adds a per-tick invariant check (./invariants) to every drive.
 */
import { MONTAGE_KIND } from '@/lib/agent/media/montageExec';
import { AUDIO_KIND } from '@/lib/agent/media/audioExtract';
import { EDIT_KIND } from '@/lib/agent/media/editExec';
import { workMontageJob } from '@/lib/agent/media/montageWorker';
import { workAudioJob } from '@/lib/agent/media/audioWorker';
import { workEditJob } from '@/lib/agent/media/editWorker';
import type { AuditEvent } from '@/lib/agent/media/montageExec';
import { FILES, TRACK, USER, balance, clip, fake, type Fake } from '@/lib/agent/media/testing/fakeMontageDeps';
import { AUDIO_URL, UPLOAD, fakeAudio, type FakeAudio } from '@/lib/agent/media/testing/fakeAudioDeps';
import { RESULT_URL as EDIT_URL, fakeEdit, type FakeEdit } from '@/lib/agent/media/testing/fakeEditDeps';
import { MASTER_URL } from '@/lib/agent/media/testing/fakeMontageDeps';
import type { MemoryLeaseStore } from '@/lib/orchestrator/testing/memoryLeaseStore';
import type { RunState } from '@/lib/agent/run/runEngine';
import { audioAdapter, editAdapter, montageAdapter } from '@/lib/agent/run/runAdapters';
import { approveStep, planRun, startRun, tickRun, type RunExecDeps } from '@/lib/agent/run/runExec';
import type { RunSpec } from '@/lib/agent/run/runSpec';
import { checkTick, type Watch } from './invariants';

export { USER, UPLOAD, AUDIO_URL, MASTER_URL, EDIT_URL, FILES };
export const CLIPS = [FILES[0]!, FILES[1]!];

/** The Master Task chain: the sound out of one video, the clips cut to it. */
export const CHAIN: RunSpec = {
  title: 'Clips to the concert sound',
  steps: [
    { id: 'sound', tool: 'audio_extract', source: { file: UPLOAD } },
    { id: 'clip', tool: 'montage', files: [...CLIPS, { step: 'sound' }] },
  ],
};

export interface World {
  deps: RunExecDeps;
  m: Fake;
  a: FakeAudio;
  e: FakeEdit;
  store: MemoryLeaseStore;
  clock: { now: number };
  audits: AuditEvent[];
  workers: Array<{ kind: string; taskId: string }>;
  finished: string[];
  watch: Watch;
}

export interface WorldOpts {
  render?: NonNullable<Parameters<typeof fake>[0]>['render'];
  reserve?: NonNullable<Parameters<typeof fake>[0]>['reserve'];
  adapters?: (base: RunExecDeps['adapters']) => RunExecDeps['adapters'];
  key?: string;
  /** Price the cut (the montage is free in production today, MONTAGE_PRICE_CREDITS = 0); the run then asks for a yes. */
  montageCredits?: number;
}

export function world(opts: WorldOpts = {}): World {
  const m = fake({ files: { [CLIPS[0]!]: clip(20), [CLIPS[1]!]: clip(20), [AUDIO_URL]: TRACK }, ...(opts.render ? { render: opts.render } : {}), ...(opts.reserve ? { reserve: opts.reserve } : {}) });
  if (opts.montageCredits !== undefined) { const c = opts.montageCredits; m.deps.price = () => c; }
  const a = fakeAudio();
  a.deps.store = m.store;
  a.deps.now = () => m.clock.now;
  let aid = 0;
  a.deps.newId = () => `aud-${(aid += 1)}`;
  const e = fakeEdit({ files: { [MASTER_URL]: MASTER_URL } });
  e.deps.store = m.store;
  e.deps.now = () => m.clock.now;
  let eid = 0;
  e.deps.newId = () => `edit-${(eid += 1)}`;
  let rid = 0;
  const audits: AuditEvent[] = [];
  const workers: World['workers'] = [];
  const finished: string[] = [];
  const base = { montage: montageAdapter(() => m.deps), audio_extract: audioAdapter(() => a.deps), edit: editAdapter(() => e.deps) };
  const deps: RunExecDeps = {
    store: m.store,
    adapters: opts.adapters ? opts.adapters(base) : base,
    startWorker: (kind, taskId) => { workers.push({ kind, taskId }); },
    audit: async (ev) => { audits.push(ev); },
    key: () => opts.key ?? 'k',
    now: () => m.clock.now,
    newId: () => `run-${(rid += 1)}`,
    finished: (id) => { finished.push(id); },
  };
  return { deps, m, a, e, store: m.store, clock: m.clock, audits, workers, finished, watch: { terminal: new Map(), maxLive: 0 } };
}

/** Run every worker the run asked for, once each. */
export async function work(w: World): Promise<void> {
  for (const { kind, taskId } of w.workers.splice(0)) {
    if (kind === MONTAGE_KIND) await workMontageJob(w.m.deps, { jobId: taskId, worker: 'w-montage' });
    else if (kind === AUDIO_KIND) await workAudioJob(w.a.deps, { jobId: taskId, worker: 'w-audio' });
    else if (kind === EDIT_KIND) await workEditJob(w.e.deps, { jobId: taskId, worker: 'w-edit' });
  }
}

/** Plan, then start with the signed plan: the user's tap. */
export async function started(w: World, spec: RunSpec = CHAIN): Promise<string> {
  const p = await planRun(w.deps, { userId: USER, spec });
  if (!p.ok) throw new Error(p.error);
  const s = await startRun(w.deps, { userId: USER, spec, token: p.token });
  if (!s.ok) throw new Error(s.error);
  return s.runId;
}

export const runAt = (w: World, id: string): RunState => w.store.rows.get(id)!.params._run as RunState;
export const jobsOf = (w: World, kind: string) => [...w.store.rows.values()].filter((r) => r.exec?.kind === kind);
export const wallet = (w: World) => balance(w.m, USER);

/** One tick, then the invariant check. */
export async function tick(w: World, id: string, startWorkers = true): Promise<RunState> {
  await tickRun(w.deps, { id, startWorkers });
  const run = runAt(w, id);
  checkTick(w.watch, id, run, wallet(w));
  return run;
}

/** The user's tap on every step that waits for a yes to its own price (only the quote it shows). */
export async function yes(w: World, id: string): Promise<number> {
  let n = 0;
  for (const s of runAt(w, id).steps) {
    if (s.status !== 'awaiting_approval' || !s.quote) continue;
    const r = await approveStep(w.deps, { userId: USER, id, step: s.id, quoteId: s.quote.quoteId, startWorkers: true });
    if (r.ok) n += 1;
  }
  return n;
}

/** Drive a run to its end: tick, (tap yes when asked and `autoYes`), work what it started, repeat; every tick checked. */
export async function drive(w: World, id: string, rounds = 8, autoYes = false): Promise<RunState> {
  for (let i = 0; i < rounds; i += 1) {
    await tick(w, id);
    if (autoYes) await yes(w, id);
    await work(w);
  }
  return tick(w, id);
}

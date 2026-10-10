/** @jest-environment node */
/**
 * A multi-step run over the REAL step executors (PART 2, T1): the montage and the audio extraction with every effect
 * faked (lib/agent/media/testing), sharing one in-memory lease store with the live semantics. Workers are run by hand,
 * as runAfterResponse would. Covers the plan → start → tick → deliver path, two ticks at once, a lost enqueue, a stop
 * that reaches every step job, the step approval bound to its quote, resume from the delivered steps, and the sweep.
 */
import { MONTAGE_KIND, type AuditEvent } from '@/lib/agent/media/montageExec';
import { AUDIO_KIND } from '@/lib/agent/media/audioExtract';
import { EDIT_KIND } from '@/lib/agent/media/editExec';
import { workMontageJob } from '@/lib/agent/media/montageWorker';
import { workAudioJob } from '@/lib/agent/media/audioWorker';
import { workEditJob } from '@/lib/agent/media/editWorker';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import { FILES, MASTER_URL, TRACK, USER, clip, fake, type Fake } from '@/lib/agent/media/testing/fakeMontageDeps';
import { AUDIO_URL, UPLOAD, fakeAudio, type FakeAudio } from '@/lib/agent/media/testing/fakeAudioDeps';
import { RESULT_URL as EDIT_URL, fakeEdit, type FakeEdit } from '@/lib/agent/media/testing/fakeEditDeps';
import type { MemoryLeaseStore } from '@/lib/orchestrator/testing/memoryLeaseStore';
import { RUN_TRANSITIONS, type RunStatus } from '../contracts';
import { RUN_KIND, stepOf, type RunState } from './runEngine';
import { audioAdapter, editAdapter, montageAdapter } from './runAdapters';
import {
  approveStep, cancelRun, planRun, readRun, resumeIdOf, resumeRun, startRun, sweepRuns, tickRun, type RunExecDeps, type StepAdapter,
} from './runExec';
import type { RunSpec } from './runSpec';
import { sweepDeliveries, type OutboxDeps, type Outlet } from '@/lib/notifications/outbox';
import { outboxOverLease } from '@/lib/notifications/testing/memoryOutboxStore';
import { DEFAULT_PREFS, normalizePrefs } from '@/lib/notifications/preferences';
import type { NotifyEvent } from '@/lib/notifications/types';

const CLIPS = [FILES[0]!, FILES[1]!];
/** The Master Task chain: the sound out of one video, the clips cut to it. */
const CHAIN: RunSpec = {
  title: 'Clips to the concert sound',
  steps: [
    { id: 'sound', tool: 'audio_extract', source: { file: UPLOAD } },
    { id: 'clip', tool: 'montage', files: [...CLIPS, { step: 'sound' }] },
  ],
};

interface World {
  deps: RunExecDeps;
  m: Fake;
  a: FakeAudio;
  e: FakeEdit;
  store: MemoryLeaseStore;
  clock: { now: number };
  audits: AuditEvent[];
  /** Workers the run asked for, in order (not run until `work`). */
  workers: Array<{ kind: string; taskId: string }>;
}

const OK = (req: { shots: unknown[]; aspect: string }): MontageOutcome => ({
  ok: true, result: { videoUrl: MASTER_URL, durationSec: 30, shots: req.shots.length, aspect: req.aspect, bridged: 0, hasMusic: true, stepsRun: ['resolve', 'stitch', 'music'] },
});

function world(opts: { render?: Parameters<typeof fake>[0]['render']; adapters?: (base: RunExecDeps['adapters']) => RunExecDeps['adapters'] } = {}): World {
  // The montage reads the extracted MP3 by its link, as it reads any file of the caller's (the live rule: a signed link
  // of ours whose token is live, lib/security/callerMedia).
  const m = fake({ files: { [CLIPS[0]!]: clip(20), [CLIPS[1]!]: clip(20), [AUDIO_URL]: TRACK }, ...(opts.render ? { render: opts.render } : {}) });
  const a = fakeAudio();
  // One queue, one clock: both executors write to the same store, as both write to generation_jobs.
  a.deps.store = m.store;
  a.deps.now = () => m.clock.now;
  let aid = 0;
  a.deps.newId = () => `aud-${(aid += 1)}`;
  // The edit reads the montage's master by its link (the same own-file rule).
  const e = fakeEdit({ files: { [MASTER_URL]: MASTER_URL } });
  e.deps.store = m.store;
  e.deps.now = () => m.clock.now;
  let eid = 0;
  e.deps.newId = () => `edit-${(eid += 1)}`;
  let rid = 0;
  const audits: AuditEvent[] = [];
  const workers: World['workers'] = [];
  const base = { montage: montageAdapter(() => m.deps), audio_extract: audioAdapter(() => a.deps), edit: editAdapter(() => e.deps) };
  const deps: RunExecDeps = {
    store: m.store,
    adapters: opts.adapters ? opts.adapters(base) : base,
    startWorker: (kind, taskId) => { workers.push({ kind, taskId }); },
    audit: async (ev) => { audits.push(ev); },
    key: () => 'k',
    now: () => m.clock.now,
    newId: () => `run-${(rid += 1)}`,
  };
  return { deps, m, a, e, store: m.store, clock: m.clock, audits, workers };
}

/** Run every worker the run asked for, once each (what runAfterResponse does after the answer). */
async function work(w: World): Promise<void> {
  for (const { kind, taskId } of w.workers.splice(0)) {
    if (kind === MONTAGE_KIND) await workMontageJob(w.m.deps, { jobId: taskId, worker: 'w-montage' });
    else if (kind === AUDIO_KIND) await workAudioJob(w.a.deps, { jobId: taskId, worker: 'w-audio' });
    else if (kind === EDIT_KIND) await workEditJob(w.e.deps, { jobId: taskId, worker: 'w-edit' });
  }
}

async function started(w: World, spec: RunSpec = CHAIN): Promise<string> {
  const p = await planRun(w.deps, { userId: USER, spec });
  if (!p.ok) throw new Error(p.error);
  const s = await startRun(w.deps, { userId: USER, spec, token: p.token });
  if (!s.ok) throw new Error(s.error);
  return s.runId;
}

const runAt = (w: World, id: string): RunState => w.store.rows.get(id)!.params._run as RunState;
const jobsOf = (w: World, kind: string) => [...w.store.rows.values()].filter((r) => r.exec?.kind === kind);
const tick = (w: World, id: string, startWorkers = true) => tickRun(w.deps, { id, startWorkers });

function expectLegal(run: RunState) {
  expect(run.events.filter((e) => e.type === 'run.invariant')).toEqual([]);
  const seq: RunStatus[] = ['queued', ...run.events.filter((e) => e.type === 'run.status').map((e) => e.detail as RunStatus)];
  for (let i = 1; i < seq.length; i += 1) expect([seq[i - 1], seq[i], RUN_TRANSITIONS[seq[i - 1]!].includes(seq[i]!)]).toEqual([seq[i - 1], seq[i], true]);
}

/** Drive a run to its end: tick, work what it started, repeat. */
async function drive(w: World, id: string, rounds = 6): Promise<RunState> {
  for (let i = 0; i < rounds; i += 1) {
    await tick(w, id);
    await work(w);
  }
  await tick(w, id);
  return runAt(w, id);
}

describe('plan and start: only a tapped, signed plan creates a run, once', () => {
  test('plan → start → the same tap again replays the same run; nothing runs before the first tick', async () => {
    const w = world();
    const p = await planRun(w.deps, { userId: USER, spec: CHAIN });
    if (!p.ok) throw new Error(p.error);
    expect(p.plan).toMatchObject({ credits: 0, steps: [{ id: 'sound', tool: 'audio_extract', credits: 0 }, { id: 'clip', tool: 'montage', credits: 0 }] });
    const first = await startRun(w.deps, { userId: USER, spec: CHAIN, token: p.token });
    const again = await startRun(w.deps, { userId: USER, spec: CHAIN, token: p.token });
    expect(first).toEqual({ ok: true, runId: p.plan.runId, replay: false });
    expect(again).toEqual({ ok: true, runId: p.plan.runId, replay: true });
    expect(jobsOf(w, RUN_KIND)).toHaveLength(1);
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);
    const row = w.store.rows.get(p.plan.runId)!;
    expect(row).toMatchObject({ status: 'pending', userId: USER, params: { subtype: 'agent-run', via: 'agent-g', steps: 2, prompt: CHAIN.title } });
    expect(runAt(w, p.plan.runId)).toMatchObject({ status: 'queued', approval: { channel: 'tap', userId: USER } });
    expect(w.audits.map((a) => `${a.op}:${a.phase}:${a.outcome}`)).toEqual(['agent_run:quote:ok', 'agent_run:run:ok', 'agent_run:run:replayed']);
    expect(w.audits[1]).toMatchObject({ runId: p.plan.runId, approval: 'tap' });
  });

  test("another user's tap, a changed spec, an expired plan, a bad spec and a server with no key are all refused", async () => {
    const w = world();
    const p = await planRun(w.deps, { userId: USER, spec: CHAIN });
    if (!p.ok) throw new Error(p.error);
    expect(await startRun(w.deps, { userId: 'user-b', spec: CHAIN, token: p.token })).toMatchObject({ ok: false, error: 'quote_invalid' });
    expect(await startRun(w.deps, { userId: USER, spec: { ...CHAIN, title: 'other' }, token: p.token })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await startRun(w.deps, { userId: USER, spec: { steps: [] }, token: p.token })).toMatchObject({ ok: false, error: 'bad_spec' });
    w.clock.now += 31 * 60_000;
    expect(await startRun(w.deps, { userId: USER, spec: CHAIN, token: p.token })).toMatchObject({ ok: false, error: 'quote_expired' });
    expect(await planRun({ ...w.deps, key: () => '' }, { userId: USER, spec: CHAIN })).toMatchObject({ ok: false, error: 'not_configured' });
    expect(jobsOf(w, RUN_KIND)).toHaveLength(0);
  });

  test('a price that moved since the plan was shown is not what the user said yes to', async () => {
    const w = world();
    const p = await planRun(w.deps, { userId: USER, spec: CHAIN });
    if (!p.ok) throw new Error(p.error);
    const dearer = { ...w.deps, adapters: { ...w.deps.adapters, montage: { ...w.deps.adapters.montage, listPrice: 5 } } };
    expect(await startRun(dearer, { userId: USER, spec: CHAIN, token: p.token })).toMatchObject({ ok: false, error: 'quote_changed' });
  });
});

describe('the chain: each step is an ordinary job of its own executor, its output feeds the next', () => {
  test('extract → montage with the MP3 link passed on; the run completes with both results', async () => {
    const w = world();
    const id = await started(w);

    await tick(w, id);
    const [audio] = jobsOf(w, AUDIO_KIND);
    expect(audio).toMatchObject({ userId: USER, status: 'pending', params: { _parent: id, subtype: 'audio-extract' } });
    expect(w.workers).toEqual([{ kind: AUDIO_KIND, taskId: audio!.id }]);
    expect(runAt(w, id)).toMatchObject({ status: 'running', steps: [{ id: 'sound', status: 'queued', taskId: audio!.id }, { id: 'clip', status: 'planned' }] });
    expect(w.store.rows.get(id)).toMatchObject({ status: 'processing', stage: '1/2' });
    expect(jobsOf(w, MONTAGE_KIND)).toHaveLength(0); // its input is not there yet

    await work(w);
    await tick(w, id);
    const [montage] = jobsOf(w, MONTAGE_KIND);
    expect(montage).toMatchObject({ status: 'pending', params: { _parent: id, prompt: CHAIN.title } });
    // The montage was planned over the extracted MP3: its track is read through the caller's own-file rule.
    expect(JSON.stringify(montage!.params)).toContain(AUDIO_URL);
    expect(runAt(w, id).steps[0]).toMatchObject({ status: 'completed', output: { url: AUDIO_URL, media: 'audio' } });

    await work(w);
    const read = await tick(w, id);
    const run = runAt(w, id);
    expect(run).toMatchObject({
      status: 'completed',
      steps: [
        { id: 'sound', status: 'completed', output: { url: AUDIO_URL, media: 'audio' } },
        { id: 'clip', status: 'completed', output: { url: MASTER_URL, media: 'video', durationSec: 30 } },
      ],
    });
    expect(run.tick).toBeUndefined();
    expectLegal(run);
    // The run row is a summary, not a Library entry: the steps' own jobs are.
    expect(w.store.rows.get(id)).toMatchObject({
      status: 'completed', stage: 'completed', pct: 100, signedUrl: null,
      result: { status: 'completed', artifacts: [{ step: 'sound', taskId: audio!.id, url: AUDIO_URL }, { step: 'clip', taskId: montage!.id, url: MASTER_URL }] },
    });
    expect(read?.children).toMatchObject({ sound: { state: 'completed' }, clip: { state: 'completed' } });
    expect(w.a.extracts).toHaveLength(1);
    expect(w.m.renders).toHaveLength(1);
    // A final run never moves again.
    const v = w.store.rows.get(id)!.exec!.v;
    await tick(w, id);
    expect(w.store.rows.get(id)!.exec!.v).toBe(v);
  });

  test("every step job's audit names its run; the run's own audits name the run", async () => {
    const w = world();
    const id = await started(w);
    await drive(w, id);
    const stepRows = [...w.a.audits, ...w.m.audits].filter((e) => e.phase !== 'quote');
    expect(stepRows.length).toBeGreaterThanOrEqual(6); // queued, started, delivered for each step
    for (const e of stepRows) expect([e.op, e.detail, e.runId]).toEqual([e.op, e.detail, id]);
    expect(w.audits.filter((e) => e.op === 'agent_run' && e.phase !== 'quote').every((e) => e.runId === id)).toBe(true);
  });

  test('extract → montage → edit: the montage master is trimmed, sped up and reframed as the third step (free)', async () => {
    const w = world();
    const spec: RunSpec = {
      ...CHAIN,
      steps: [
        ...CHAIN.steps,
        { id: 'cut', tool: 'edit', file: { step: 'clip' }, edits: [{ op: 'trim', toSec: 10 }, { op: 'speed', factor: 2 }, { op: 'aspect', to: '9:16', fit: 'crop' }] },
      ],
    };
    const p = await planRun(w.deps, { userId: USER, spec });
    if (!p.ok) throw new Error(p.error);
    expect(p.plan.steps).toEqual([
      { id: 'sound', tool: 'audio_extract', credits: 0 }, { id: 'clip', tool: 'montage', credits: 0 }, { id: 'cut', tool: 'edit', credits: 0 },
    ]);
    const id = await started(w, spec);
    const run = await drive(w, id);
    const [edit] = jobsOf(w, EDIT_KIND);
    expect(edit).toMatchObject({ status: 'completed', params: { _parent: id, subtype: 'edit', via: 'agent-g' } });
    // The edit was quoted on the montage's own result, through the caller's own-file rule.
    expect(w.e.renders[0]!.url).toBe(MASTER_URL);
    expect(w.e.renders[0]!.request.edits.map((x) => x.op)).toEqual(['trim', 'speed', 'aspect']);
    expect(run).toMatchObject({
      status: 'completed',
      steps: [{ id: 'sound', status: 'completed' }, { id: 'clip', status: 'completed' }, { id: 'cut', status: 'completed', capability: 'media.edit', output: { url: EDIT_URL, media: 'video', durationSec: 5.02 } }],
    });
    expectLegal(run);
  });

  test('an edit step that takes a still delivers an image; an edit the file cannot take fails the step by its code', async () => {
    const w = world();
    const still: RunSpec = { steps: [...CHAIN.steps, { id: 'still', tool: 'edit', file: { step: 'clip' }, edits: [{ op: 'thumbnail', atSec: 2 }] }] };
    w.e.deps.render = async () => ({ ok: true, bytes: Buffer.alloc(40_000, 1), input: { durationSec: 30, hasVideo: true, hasAudio: true, width: 1920, height: 1080, rotation: 0, videoCodec: 'h264', audioCodec: 'aac' }, output: { durationSec: 0.04, hasVideo: true, hasAudio: false, width: 1920, height: 1080, rotation: 0, videoCodec: 'mjpeg', audioCodec: null } });
    const run = await drive(w, await started(w, still));
    expect(run.steps[2]).toMatchObject({ status: 'completed', output: { url: EDIT_URL, media: 'image' } });
    expect(run.steps[2]!.output!.durationSec).toBeUndefined();

    const w2 = world();
    const past: RunSpec = { steps: [...CHAIN.steps, { id: 'cut', tool: 'edit', file: { step: 'clip' }, edits: [{ op: 'trim', fromSec: 40 }] }] };
    const r2 = await drive(w2, await started(w2, past));
    expect(r2).toMatchObject({ status: 'partially_completed', steps: [{ status: 'completed' }, { status: 'completed' }, { status: 'failed', error: 'out_of_range' }] });
    expect(jobsOf(w2, EDIT_KIND)).toHaveLength(0);
  });

  test('a step that fails ends the run failed when nothing was delivered, and skips what needed it', async () => {
    const w = world();
    w.a.deps.extract = async () => ({ ok: false, error: 'extract_failed', detail: 'no sound stream' });
    const id = await started(w);
    const run = await drive(w, id);
    expect(run).toMatchObject({ status: 'failed', steps: [{ status: 'failed' }, { status: 'cancelled', error: 'skipped' }] });
    expect(run.error).toMatch(/extract_failed/);
    expect(jobsOf(w, MONTAGE_KIND)).toHaveLength(0);
    expect(w.store.rows.get(id)).toMatchObject({ status: 'failed' });
    expect(w.store.rows.get(id)!.error).toMatch(/^failed: /);
    expectLegal(run);
  });
});

describe('races', () => {
  test('two ticks at once start the step once: one quote, one job', async () => {
    const w = world();
    const id = await started(w);
    await Promise.all([tick(w, id), tick(w, id), tick(w, id, false)]);
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(1);
    expect(w.a.audits.filter((e) => e.phase === 'quote')).toHaveLength(1);
    expect(runAt(w, id).events.filter((e) => e.type === 'step.quoted')).toHaveLength(1);
    expectLegal(runAt(w, id));
  });

  test('a competing write between the read and the compare-and-set: the loser reads again and starts nothing twice', async () => {
    const w = world();
    const id = await started(w);
    let raced = false;
    w.store.beforeCas = async (rowId) => {
      if (raced || rowId !== id) return;
      raced = true;
      await tick(w, id); // lands first; the outer tick's write then fails its version check
    };
    await tick(w, id);
    w.store.beforeCas = undefined;
    expect(raced).toBe(true);
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(1);
    expect(runAt(w, id).events.filter((e) => e.type === 'step.quoted')).toHaveLength(1);
  });

  test('a tick holding the start lease is not overrun; once it lapses another tick takes over', async () => {
    const w = world();
    const id = await started(w);
    // A tick that took the lease and died before quoting.
    const row = w.store.rows.get(id)!;
    const run = runAt(w, id);
    run.tick = { owner: 'tick-dead', until: w.clock.now + 30_000 };
    row.params = { ...row.params, _run: run };
    await tick(w, id);
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);
    w.clock.now += 30_001;
    await tick(w, id);
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(1);
  });

  test('the job insert is lost after the step was written queued: the next tick queues the same quote again', async () => {
    let dropping = true;
    let tries = 0;
    const w = world({
      adapters: (base) => ({
        ...base,
        audio_extract: {
          ...base.audio_extract,
          async enqueue(userId, quote, ctx) {
            tries += 1;
            if (!dropping) return base.audio_extract.enqueue(userId, quote, ctx);
            w.store.down = true; // the connection drops on the insert
            try { return await base.audio_extract.enqueue(userId, quote, ctx); } finally { w.store.down = false; }
          },
        },
      }),
    });
    const id = await started(w);
    await tick(w, id);
    expect(tries).toBeGreaterThan(1); // the same tick already tried again on its next pass
    const step = runAt(w, id).steps[0]!;
    expect(step).toMatchObject({ status: 'queued', taskId: expect.any(String) });
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);
    dropping = false;
    await tick(w, id);
    expect(jobsOf(w, AUDIO_KIND).map((r) => r.id)).toEqual([step.taskId]);
    expect(runAt(w, id).steps[0]!.quote?.quoteId).toBe(step.quote?.quoteId); // the same quote, not a new one
    const run = await drive(w, id);
    expect(run.status).toBe('completed');
    expect(w.a.extracts).toHaveLength(1);
  });

  test('a lost insert whose quote expired meanwhile is priced again, never queued on the old price', async () => {
    let dropping = true;
    const w = world({
      adapters: (base) => ({
        ...base,
        audio_extract: {
          ...base.audio_extract,
          async enqueue(userId, quote, ctx) {
            if (dropping) return { ok: false, error: 'jobs_unavailable' };
            return base.audio_extract.enqueue(userId, quote, ctx);
          },
        },
      }),
    });
    const id = await started(w);
    await tick(w, id);
    const old = runAt(w, id).steps[0]!;
    w.clock.now += 31 * 60_000;
    dropping = false;
    await tick(w, id);
    const now = runAt(w, id);
    expect(now.events.some((e) => e.type === 'step.requote' && e.step === 'sound')).toBe(true);
    expect(now.steps[0]!.taskId).not.toBe(old.taskId);
    expect(jobsOf(w, AUDIO_KIND).map((r) => r.id)).toEqual([now.steps[0]!.taskId]);
    expectLegal(now);
  });
});

describe('stop', () => {
  test('a stop reaches the running step job and ends what has not started; delivered results would stay', async () => {
    const w = world();
    const id = await started(w);
    await tick(w, id);
    const [audio] = jobsOf(w, AUDIO_KIND);
    expect(await cancelRun(w.deps, { userId: USER, id })).toEqual({ ok: true });
    expect(w.store.rows.get(audio!.id)).toMatchObject({ status: 'failed', error: 'cancelled by the user' });
    await tick(w, id);
    const run = runAt(w, id);
    expect(run).toMatchObject({ status: 'cancelled', error: 'cancelled', steps: [{ status: 'cancelled' }, { status: 'cancelled' }] });
    expect(w.store.rows.get(id)).toMatchObject({ status: 'failed', error: 'cancelled by the user' });
    expectLegal(run);
    // The worker that was asked for finds a stopped job and does nothing.
    await work(w);
    expect(w.a.extracts).toHaveLength(0);
    expect(jobsOf(w, MONTAGE_KIND)).toHaveLength(0);
    expect(w.audits.filter((e) => e.phase === 'cancel')).toEqual([expect.objectContaining({ op: 'agent_run', outcome: 'cancelled', runId: id })]);
  });

  test('a stop that lands while a step job is being queued: the enqueuer reads the run again and stops its own job', async () => {
    const holder: { w?: World } = {};
    const w = world({
      adapters: (base) => ({
        ...base,
        audio_extract: {
          ...base.audio_extract,
          async enqueue(userId, quote, ctx) {
            await cancelRun(holder.w!.deps, { userId, id: ctx.runId }); // the user's stop, mid-insert
            return base.audio_extract.enqueue(userId, quote, ctx);
          },
        },
      }),
    });
    holder.w = w;
    const id = await started(w);
    await tick(w, id);
    const [audio] = jobsOf(w, AUDIO_KIND);
    expect(audio).toMatchObject({ status: 'failed', error: 'cancelled by the user' });
    await tick(w, id);
    expect(runAt(w, id).status).toBe('cancelled');
    await work(w);
    expect(w.a.extracts).toHaveLength(0);
  });

  test("only the owner stops a run; a final run cannot be stopped", async () => {
    const w = world();
    const id = await started(w);
    expect(await cancelRun(w.deps, { userId: 'user-b', id })).toMatchObject({ ok: false, error: 'not_found' });
    await drive(w, id);
    expect(await cancelRun(w.deps, { userId: USER, id })).toMatchObject({ ok: false, error: 'not_running' });
  });
});

describe('a step priced above its approval waits for a yes to THAT price', () => {
  /** The extraction quoted at 5 credits (its list price is 0): the user approved 0, so it must ask. */
  const pricey = (base: RunExecDeps['adapters']): RunExecDeps['adapters'] => ({
    ...base,
    audio_extract: {
      ...base.audio_extract,
      async quote(userId, step) {
        const q = await base.audio_extract.quote(userId, step);
        return q.ok ? { ok: true, quote: { ...q.quote, credits: 5 } } : q;
      },
    } satisfies StepAdapter,
  });

  test('awaiting_approval with the quote; a yes to another quote id is refused; the yes to this one queues the job', async () => {
    const w = world({ adapters: pricey });
    const id = await started(w);
    await tick(w, id);
    let run = runAt(w, id);
    expect(run).toMatchObject({ status: 'awaiting_approval', steps: [{ status: 'awaiting_approval', quote: { credits: 5 } }, { status: 'planned' }] });
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);
    expect(w.store.rows.get(id)!.stage).toBe('awaiting_approval');
    const quoteId = run.steps[0]!.quote!.quoteId;

    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId: 'not-it', startWorkers: true })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await approveStep(w.deps, { userId: 'user-b', id, step: 'sound', quoteId, startWorkers: true })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await approveStep(w.deps, { userId: USER, id, step: 'clip', quoteId, startWorkers: true })).toMatchObject({ ok: false, error: 'not_waiting' });
    expect(await approveStep(w.deps, { userId: USER, id, step: 'nope', quoteId, startWorkers: true })).toMatchObject({ ok: false, error: 'not_found' });
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);

    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId, startWorkers: true })).toEqual({ ok: true });
    run = runAt(w, id);
    expect(run.steps[0]).toMatchObject({ status: 'queued', approvedCredits: 5, approval: { quoteFingerprint: quoteId, channel: 'tap', userId: USER } });
    expect(jobsOf(w, AUDIO_KIND).map((r) => r.id)).toEqual([run.steps[0]!.taskId]);
    expect(w.workers).toEqual([{ kind: AUDIO_KIND, taskId: run.steps[0]!.taskId }]);
    expect(w.audits.find((e) => e.phase === 'approve')).toMatchObject({
      op: 'agent_run', outcome: 'ok', runId: id, jobId: run.steps[0]!.taskId, toolId: 'agent.audio-extract', approval: 'tap', credits: 5, detail: 'sound',
    });
    // A second yes is not a second job.
    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId, startWorkers: true })).toMatchObject({ ok: false, error: 'not_waiting' });
    expect((await drive(w, id)).status).toBe('completed');
    expectLegal(runAt(w, id));
  });

  test('a yes that comes after the quote expired is refused, the step is priced again, and that new price needs its own yes', async () => {
    const w = world({ adapters: pricey });
    const id = await started(w);
    await tick(w, id);
    const first = runAt(w, id).steps[0]!.quote!;
    w.clock.now = first.expiresAt;
    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId: first.quoteId, startWorkers: true })).toMatchObject({ ok: false, error: 'quote_expired' });
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);
    await tick(w, id);
    const second = runAt(w, id).steps[0]!;
    expect(second).toMatchObject({ status: 'awaiting_approval' });
    expect(second.quote!.quoteId).not.toBe(first.quoteId);
    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId: first.quoteId, startWorkers: true })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId: second.quote!.quoteId, startWorkers: true })).toEqual({ ok: true });
    expectLegal(runAt(w, id));
  });

  test('a stop while waiting for the yes ends the step without a job', async () => {
    const w = world({ adapters: pricey });
    const id = await started(w);
    await tick(w, id);
    const quoteId = runAt(w, id).steps[0]!.quote!.quoteId;
    expect(await cancelRun(w.deps, { userId: USER, id })).toEqual({ ok: true });
    expect(runAt(w, id)).toMatchObject({ status: 'cancelled' });
    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId, startWorkers: true })).toMatchObject({ ok: false, error: 'not_running' });
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);
    expectLegal(runAt(w, id));
  });
});

describe('resume: a new run from the delivered steps', () => {
  test('a run that ended partially is carried on: the delivered step is reused (not run again), the failed one runs again', async () => {
    let failRender = true;
    const w = world({ render: async (req) => (failRender ? { ok: false, step: 'stitch', error: 'ffmpeg exited 1' } : OK(req)) });
    const id = await started(w);
    const first = await drive(w, id);
    expect(first).toMatchObject({ status: 'partially_completed', steps: [{ status: 'completed' }, { status: 'failed' }] });
    expect(w.store.rows.get(id)).toMatchObject({ status: 'completed', stage: 'partially_completed', result: { status: 'partially_completed', artifacts: [{ step: 'sound' }] } });
    const audioJob = first.steps[0]!.taskId;

    expect(await resumeRun(w.deps, { userId: 'user-b', id })).toMatchObject({ ok: false, error: 'not_found' });
    failRender = false;
    const r = await resumeRun(w.deps, { userId: USER, id });
    expect(r).toEqual({ ok: true, runId: resumeIdOf(id), replay: false });
    expect(await resumeRun(w.deps, { userId: USER, id })).toEqual({ ok: true, runId: resumeIdOf(id), replay: true });
    if (!r.ok) throw new Error(r.error);
    expect(w.store.rows.get(r.runId)).toMatchObject({ params: { resumedFrom: id } });
    // The old run is final and stays as it was.
    expect(runAt(w, id).status).toBe('partially_completed');

    const second = await drive(w, r.runId);
    expect(second).toMatchObject({
      status: 'completed', resumedFrom: id,
      steps: [{ id: 'sound', status: 'completed', reused: true, taskId: audioJob }, { id: 'clip', status: 'completed', output: { url: MASTER_URL } }],
    });
    expect(w.a.extracts).toHaveLength(1); // the sound was not extracted again
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(1);
    expect(w.m.renders).toHaveLength(2);
    expectLegal(second);
    expect(w.audits.find((e) => e.phase === 'resume')).toMatchObject({ op: 'agent_run', runId: r.runId, approval: 'tap', detail: `from ${id}; 1 steps reused` });
    // A run whose every step was delivered has nothing to carry on.
    expect(await resumeRun(w.deps, { userId: USER, id: r.runId })).toMatchObject({ ok: false, error: 'nothing_to_resume' });
  });

  test('a live run cannot be resumed (it is still going)', async () => {
    const w = world();
    const id = await started(w);
    expect(await resumeRun(w.deps, { userId: USER, id })).toMatchObject({ ok: false, error: 'not_final' });
  });

  test('a stopped run is carried on as a new run; the stopped one stays stopped', async () => {
    const w = world();
    const id = await started(w);
    await tick(w, id);
    await cancelRun(w.deps, { userId: USER, id });
    const r = await resumeRun(w.deps, { userId: USER, id });
    if (!r.ok) throw new Error(r.error);
    expect((await drive(w, r.runId)).status).toBe('completed');
    expect(runAt(w, id).status).toBe('cancelled');
  });
});

describe('the sweep and the read', () => {
  test('the sweep ticks every live run (a run whose tab closed still moves on) and starts no worker itself', async () => {
    const w = world();
    const a = await started(w);
    const b = await started(w);
    await tick(w, a);
    await work(w);
    // `a`'s sound is delivered; nobody looked since. `b` was never ticked.
    expect(await sweepRuns(w.deps, { limit: 10 })).toEqual({ ticked: 2, ended: 0 });
    expect(w.workers).toEqual([]);
    expect(stepOf(runAt(w, a), 'clip')).toMatchObject({ status: 'queued' });
    expect(stepOf(runAt(w, b), 'sound')).toMatchObject({ status: 'queued' });
    // The step jobs are worked by their own sweeps; here, by hand.
    for (const row of [...jobsOf(w, AUDIO_KIND), ...jobsOf(w, MONTAGE_KIND)].filter((r) => r.status === 'pending')) {
      if (row.exec?.kind === MONTAGE_KIND) await workMontageJob(w.m.deps, { jobId: row.id, worker: 's' });
      else await workAudioJob(w.a.deps, { jobId: row.id, worker: 's' });
    }
    expect(await sweepRuns(w.deps, { limit: 10 })).toEqual({ ticked: 2, ended: 1 });
    expect(runAt(w, a).status).toBe('completed');
  });

  test('readRun moves nothing; an id that is not a run reads as none', async () => {
    const w = world();
    const id = await started(w);
    const writes = w.store.writes.cas;
    const r = await readRun(w.deps, id);
    expect(r?.run.status).toBe('queued');
    expect(w.store.writes.cas).toBe(writes);
    await tick(w, id);
    const [audio] = jobsOf(w, AUDIO_KIND);
    expect(await readRun(w.deps, audio!.id)).toBeNull();
    expect(await readRun(w.deps, 'nope')).toBeNull();
  });
});

describe('telling the owner when a run ends (lib/notifications/outbox, Omnichannel G)', () => {
  /** The outbox over the same rows as the run, every outlet recorded instead of sent. */
  function outbox(w: World) {
    const sent: Array<{ outlet: Outlet; ev: NotifyEvent }> = [];
    const rec = (outlet: Outlet) => async (ev: NotifyEvent) => { sent.push({ outlet, ev }); return { sent: true }; };
    let n = 0;
    const deps: OutboxDeps = {
      store: outboxOverLease(w.store, () => w.clock.now, (id) => (w.store.rows.get(id)?.exec?.kind === AUDIO_KIND ? 'music' : 'film')),
      prefs: async () => normalizePrefs(DEFAULT_PREFS),
      send: { bell: rec('bell'), push: rec('push'), whatsapp: rec('whatsapp') },
      firstNotice: async () => true,
      now: () => w.clock.now,
      newId: () => `t${(n += 1)}`,
    };
    return { deps, sent };
  }

  test('a run that ends is handed to the outbox once; its owner hears about the run, never about each step', async () => {
    const w = world();
    const ended: string[] = [];
    w.deps.finished = (id) => { ended.push(id); };
    const id = await started(w);
    const run = await drive(w, id);
    expect(run.status).toBe('completed');
    await tick(w, id);
    expect(ended).toEqual([id]);

    const o = outbox(w);
    expect((await sweepDeliveries(o.deps)).outcomes).toEqual({ delivered: 1 });
    expect(o.sent.map((s) => s.outlet)).toEqual(['bell', 'push', 'whatsapp']);
    expect(new Set(o.sent.map((s) => s.ev.title))).toEqual(new Set(['✅ Agent G-მ დავალება შეასრულა']));
    // The record moved the run row's version; the run still reads as ended and a late tick changes nothing.
    await tick(w, id);
    expect(runAt(w, id).status).toBe('completed');
    expect((await sweepDeliveries(o.deps)).seen).toBe(0);
    expect(o.sent).toHaveLength(3);
  });

  test('a run the owner stops is handed over too, and the outbox tells nothing: the person did it', async () => {
    const w = world();
    const ended: string[] = [];
    w.deps.finished = (id) => { ended.push(id); };
    const id = await started(w);
    await tick(w, id);
    expect(await cancelRun(w.deps, { userId: USER, id })).toEqual({ ok: true });
    await work(w);
    await tick(w, id);
    expect(runAt(w, id).status).toBe('cancelled');
    expect(ended).toEqual([id]);
    const o = outbox(w);
    await sweepDeliveries(o.deps);
    expect(o.sent).toEqual([]);
  });

  test('a hook that throws never changes how the run ends', async () => {
    const w = world();
    w.deps.finished = () => { throw new Error('boom'); };
    const id = await started(w);
    expect((await drive(w, id)).status).toBe('completed');
  });
});

/** @jest-environment node */
/**
 * v5.1 Phase 9: Agent G execution, end to end, MOCKED. The real run engine (lib/agent/run/runExec) and the real step
 * executors run against an in-memory job store, faked media tools and a faked wallet (./world). No network, no Google,
 * no database, no money. After every tick ./invariants checks I-1…I-6 (legal transitions, the parallel cap, nothing
 * above its approval, final runs frozen, the wallet never charged above what was approved, events in order).
 *
 * Each test is one scenario of the Phase 9 matrix (docs/v5.1-phase9/00-mocked-e2e.md, AG-01…AG-12).
 */
import { AUDIO_KIND } from '@/lib/agent/media/audioExtract';
import { MONTAGE_KIND } from '@/lib/agent/media/montageExec';
import { MAX_PARALLEL } from '@/lib/agent/run/runEngine';
import { approveStep, cancelRun, planRun, resumeRun, startRun, type StepAdapter, type RunExecDeps } from '@/lib/agent/run/runExec';
import type { RunSpec } from '@/lib/agent/run/runSpec';
import { CHAIN, CLIPS, MASTER_URL, UPLOAD, USER, drive, jobsOf, runAt, started, tick, wallet, work, world, yes } from './world';

/** The cut priced at ✦6 so money moves (the montage is free in production today). */
const PRICE = 6;

describe('AG-01 the happy path', () => {
  test('a tapped plan runs the chain to the end: result delivered, charged exactly what was approved, owner told once', async () => {
    const w = world({ montageCredits: PRICE });
    const id = await started(w);
    const run = await drive(w, id, 8, true);
    expect(run).toMatchObject({ status: 'completed', steps: [{ id: 'sound', status: 'completed' }, { id: 'clip', status: 'completed', output: { url: MASTER_URL } }] });
    expect(run.steps[1]!.approvedCredits).toBe(PRICE);
    expect(wallet(w)).toBe(-PRICE);
    expect(w.finished).toEqual([id]);
    expect(w.store.rows.get(id)).toMatchObject({ status: 'completed' });
  });
});

describe('AG-02 nothing runs without the user\'s tap', () => {
  test('a plan alone creates no run and no job; a forged, foreign or unsigned start is refused', async () => {
    const w = world();
    const p = await planRun(w.deps, { userId: USER, spec: CHAIN });
    expect(p.ok).toBe(true);
    expect(w.store.rows.size).toBe(0);
    expect(await startRun(w.deps, { userId: USER, spec: CHAIN, token: 'forged' })).toMatchObject({ ok: false });
    if (!p.ok) throw new Error('plan');
    expect(await startRun(w.deps, { userId: 'user-b', spec: CHAIN, token: p.token })).toMatchObject({ ok: false });
    const other: RunSpec = { ...CHAIN, title: 'something else' };
    expect(await startRun(w.deps, { userId: USER, spec: other, token: p.token })).toMatchObject({ ok: false });
    expect(w.store.rows.size).toBe(0);
    expect(wallet(w)).toBe(0);
  });

  test('a server with no signing key makes no plans at all (fail closed)', async () => {
    const w = world({ key: '' });
    expect(await planRun(w.deps, { userId: USER, spec: CHAIN })).toMatchObject({ ok: false, error: 'not_configured' });
  });
});

describe('AG-03 a double tap is one run', () => {
  test('the same signed plan started twice is the same run, one job per step, one charge', async () => {
    const w = world({ montageCredits: PRICE });
    const p = await planRun(w.deps, { userId: USER, spec: CHAIN });
    if (!p.ok) throw new Error('plan');
    const a = await startRun(w.deps, { userId: USER, spec: CHAIN, token: p.token });
    const b = await startRun(w.deps, { userId: USER, spec: CHAIN, token: p.token });
    if (!a.ok || !b.ok) throw new Error('start');
    expect(b).toEqual({ ok: true, runId: a.runId, replay: true });
    await drive(w, a.runId, 8, true);
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(1);
    expect(jobsOf(w, MONTAGE_KIND)).toHaveLength(1);
    expect(wallet(w)).toBe(-PRICE);
  });
});

describe('AG-04 parallel steps stay under the cap', () => {
  test('three independent extractions and a cut: never more than MAX_PARALLEL live jobs, and the cap is used', async () => {
    const FAN: RunSpec = { steps: [
      { id: 'one', tool: 'audio_extract', source: { file: UPLOAD } },
      { id: 'two', tool: 'audio_extract', source: { file: UPLOAD } },
      { id: 'three', tool: 'audio_extract', source: { file: UPLOAD } },
      { id: 'cut', tool: 'montage', files: [...CLIPS, { step: 'one' }] },
    ] };
    const w = world();
    const id = await started(w, FAN);
    const run = await drive(w, id, 12);
    expect(run.status).toBe('completed');
    expect(w.watch.maxLive).toBe(MAX_PARALLEL);
  });
});

describe('AG-05 a Google-side failure costs the user nothing (D-15)', () => {
  test('the cut fails in the render: the delivered sound stays, the run is partial, the charge is paid back', async () => {
    const w = world({ montageCredits: PRICE, render: async () => ({ ok: false, step: 'stitch', error: 'upstream 500' }) });
    const id = await started(w);
    const run = await drive(w, id, 8, true);
    expect(w.m.reserves.length).toBeGreaterThan(0); // it was charged before the render…
    expect(run).toMatchObject({ status: 'partially_completed', steps: [{ status: 'completed' }, { status: 'failed' }] });
    expect(wallet(w)).toBe(0);
    expect(w.finished).toEqual([id]);
  });
});

describe('AG-06 stop', () => {
  test('a stop during the first step ends the run; nothing is charged; the worker finds a stopped job', async () => {
    const w = world();
    const id = await started(w);
    await tick(w, id);
    expect(await cancelRun(w.deps, { userId: USER, id })).toEqual({ ok: true });
    await work(w);
    const run = await tick(w, id);
    expect(run).toMatchObject({ status: 'cancelled', steps: [{ status: 'cancelled' }, { status: 'cancelled' }] });
    expect(w.a.extracts).toHaveLength(0);
    expect(wallet(w)).toBe(0);
  });

  test('a stop after the cut was approved and queued: the cut is stopped and whatever it held is paid back', async () => {
    const w = world({ montageCredits: PRICE });
    const id = await started(w);
    await tick(w, id);
    await work(w); // the sound is delivered
    await tick(w, id); // the cut is quoted at ✦6 and waits for a yes
    expect(await yes(w, id)).toBe(1);
    expect(runAt(w, id).steps[1]!.status).toBe('queued');
    expect(await cancelRun(w.deps, { userId: USER, id })).toEqual({ ok: true });
    await work(w);
    const run = await drive(w, id, 2);
    expect(run.status).toBe('cancelled');
    expect(run.steps[0]!.status).toBe('completed'); // delivered results stay
    expect(wallet(w)).toBe(0);
  });

  test('another user cannot stop my run', async () => {
    const w = world();
    const id = await started(w);
    expect(await cancelRun(w.deps, { userId: 'user-b', id })).toMatchObject({ ok: false });
    expect((await drive(w, id)).status).toBe('completed');
  });
});

describe('AG-07 a price above the approval waits for a yes to that exact price', () => {
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

  test('held at awaiting_approval with no job; a wrong quote id is refused; the right yes runs it to the end', async () => {
    const w = world({ adapters: pricey });
    const id = await started(w);
    let run = await tick(w, id);
    expect(run.status).toBe('awaiting_approval');
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);
    // more ticks never start it on their own
    run = await tick(w, id);
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(0);
    const quoteId = run.steps[0]!.quote!.quoteId;
    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId: 'other', startWorkers: true })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await approveStep(w.deps, { userId: USER, id, step: 'sound', quoteId, startWorkers: true })).toEqual({ ok: true });
    expect((await drive(w, id)).status).toBe('completed');
  });
});

describe('AG-08 no balance, no work', () => {
  test('the wallet refuses the cut: the step fails, nothing is charged, the run says so', async () => {
    const w = world({ montageCredits: PRICE, reserve: { proceed: false, charged: false, reason: 'insufficient_credits' } });
    const id = await started(w);
    const run = await drive(w, id, 8, true);
    expect(run.steps[1]!.status).toBe('failed');
    expect(['partially_completed', 'failed']).toContain(run.status);
    expect(wallet(w)).toBe(0);
    expect(w.m.renders).toHaveLength(0);
  });
});

describe('AG-09 carry on after a failure', () => {
  test('resume reuses the delivered step (not run, not charged again) and charges only the cut that is delivered', async () => {
    let fail = true;
    const w = world({ montageCredits: PRICE, render: async (req, o) => {
      if (fail) return { ok: false, step: 'stitch', error: 'upstream 500' };
      await o.onStage('stitch', 88);
      return { ok: true, result: { videoUrl: MASTER_URL, durationSec: 30, shots: req.shots.length, aspect: req.aspect, bridged: 0, hasMusic: true, stepsRun: ['resolve', 'stitch', 'music'] } };
    } });
    const id = await started(w);
    expect((await drive(w, id, 8, true)).status).toBe('partially_completed');
    expect(wallet(w)).toBe(0); // the failed cut was paid back
    fail = false;
    const r = await resumeRun(w.deps, { userId: USER, id });
    if (!r.ok) throw new Error(r.error);
    const second = await drive(w, r.runId, 8, true);
    expect(second).toMatchObject({ status: 'completed', steps: [{ reused: true }, { status: 'completed' }] });
    expect(w.a.extracts).toHaveLength(1);
    expect(wallet(w)).toBe(-PRICE);
    expect(runAt(w, id).status).toBe('partially_completed'); // the old run stays as it was
  });
});

describe('AG-10 a finished run never moves', () => {
  test('ticks after the end change nothing (I-4 is checked on every one)', async () => {
    const w = world();
    const id = await started(w);
    await drive(w, id);
    const before = JSON.stringify(runAt(w, id));
    for (let i = 0; i < 3; i += 1) await tick(w, id);
    expect(JSON.stringify(runAt(w, id))).toBe(before);
    expect(w.finished).toEqual([id]);
  });
});

describe('AG-11 only my own files', () => {
  test('a plan naming another user\'s upload never charges and never delivers', async () => {
    const w = world();
    const foreign: RunSpec = { steps: [{ id: 'sound', tool: 'audio_extract', source: { file: 'omni-uploads/user-b/secret.mp4' } }] };
    const p = await planRun(w.deps, { userId: USER, spec: foreign });
    if (p.ok) {
      const s = await startRun(w.deps, { userId: USER, spec: foreign, token: p.token });
      if (s.ok) {
        const run = await drive(w, s.runId);
        expect(run.status).not.toBe('completed');
      }
    }
    expect(w.a.extracts).toHaveLength(0);
    expect(wallet(w)).toBe(0);
  });
});

describe('AG-12 two ticks at once', () => {
  test('two overlapping ticks on the same run queue each step once', async () => {
    const w = world();
    const id = await started(w);
    await Promise.all([tick(w, id), tick(w, id)]);
    await work(w);
    await Promise.all([tick(w, id), tick(w, id)]);
    await work(w);
    await drive(w, id, 2);
    expect(jobsOf(w, AUDIO_KIND)).toHaveLength(1);
    expect(jobsOf(w, MONTAGE_KIND)).toHaveLength(1);
    expect(runAt(w, id).status).toBe('completed');
  });
});

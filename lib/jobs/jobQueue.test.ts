import { JobQueue, type Job, type JobRunContext } from './jobQueue';

/** A runner whose completion we control from the test. */
function deferredRunner() {
  let resolve!: (v?: unknown) => void;
  let reject!: (e?: unknown) => void;
  let ctx!: JobRunContext;
  const run = (c: JobRunContext) =>
    new Promise((res, rej) => {
      ctx = c;
      resolve = res;
      reject = rej;
    });
  return {
    run,
    resolve: (v?: unknown) => resolve(v),
    reject: (e?: unknown) => reject(e),
    ctx: () => ctx,
  };
}

/** Deterministic queue: fixed clock, sequential ids, real AbortControllers. */
function makeQueue(max = 3) {
  let t = 1000;
  const snapshots: Job[][] = [];
  const q = new JobQueue({
    maxConcurrent: max,
    now: () => (t += 1),
    makeId: (kind, seq) => `${kind}#${seq}`,
    onChange: (jobs) => snapshots.push(jobs),
  });
  return { q, snapshots };
}

describe('JobQueue — capped-parallel with positions', () => {
  it('starts jobs immediately while under the concurrency cap', () => {
    const { q } = makeQueue(3);
    const a = deferredRunner();
    const b = deferredRunner();
    q.submit({ kind: 'video', label: 'A', run: a.run });
    q.submit({ kind: 'music', label: 'B', run: b.run });
    const list = q.list();
    expect(list.map((j) => j.status)).toEqual(['rendering', 'rendering']);
    expect(q.activeCount()).toBe(2);
  });

  it('queues overflow with live 1-based positions', () => {
    const { q } = makeQueue(2);
    const runners = [deferredRunner(), deferredRunner(), deferredRunner(), deferredRunner()];
    const ids = runners.map((r, i) => q.submit({ kind: 'video', label: `J${i}`, run: r.run }));
    const list = q.list();
    expect(list.map((j) => j.status)).toEqual(['rendering', 'rendering', 'queued', 'queued']);
    expect(list[2]!.position).toBe(1); // "In Queue: #1"
    expect(list[3]!.position).toBe(2);
    expect(ids).toHaveLength(4);
  });

  it('promotes the next queued job when a slot frees, and reflows positions', async () => {
    const { q } = makeQueue(2);
    const r = [deferredRunner(), deferredRunner(), deferredRunner()];
    r.forEach((x, i) => q.submit({ kind: 'video', label: `J${i}`, run: x.run }));
    // J0, J1 rendering; J2 queued at #1.
    expect(q.list()[2]!.position).toBe(1);
    r[0]!.resolve('done-0');
    await flush();
    const list = q.list();
    expect(list[0]!.status).toBe('done');
    expect(list[0]!.result).toBe('done-0');
    expect(list[2]!.status).toBe('rendering'); // promoted
    expect(q.activeCount()).toBe(2);
  });

  it('threads progress (pct + stage) from the runner onto the job', () => {
    const { q } = makeQueue();
    const a = deferredRunner();
    q.submit({ kind: 'video', label: 'A', run: a.run });
    a.ctx().onProgress({ pct: 45, stage: 'Rendering clip 3/6' });
    const job = q.list()[0]!;
    expect(job.pct).toBe(45);
    expect(job.stage).toBe('Rendering clip 3/6');
  });

  it('clamps progress pct into 0–100 and rounds', () => {
    const { q } = makeQueue();
    const a = deferredRunner();
    q.submit({ kind: 'image', label: 'A', run: a.run });
    a.ctx().onProgress({ pct: 145.6 });
    expect(q.list()[0]!.pct).toBe(100);
    a.ctx().onProgress({ pct: -5 });
    expect(q.list()[0]!.pct).toBe(0);
  });

  it('marks done with pct=100 and captures the result', async () => {
    const { q } = makeQueue();
    const a = deferredRunner();
    q.submit({ kind: 'music', label: 'A', run: a.run });
    a.resolve({ url: 'https://x/track.mp3' });
    await flush();
    const job = q.list()[0]!;
    expect(job.status).toBe('done');
    expect(job.pct).toBe(100);
    expect(job.result).toEqual({ url: 'https://x/track.mp3' });
    expect(job.endedAt).not.toBeNull();
  });

  it('marks failed and captures the error message', async () => {
    const { q } = makeQueue();
    const a = deferredRunner();
    q.submit({ kind: 'video', label: 'A', run: a.run });
    a.reject(new Error('provider 500'));
    await flush();
    const job = q.list()[0]!;
    expect(job.status).toBe('failed');
    expect(job.error).toBe('provider 500');
  });

  it('cancels a queued job immediately and promotes the next', async () => {
    const { q } = makeQueue(1);
    const r = [deferredRunner(), deferredRunner()];
    const ids = r.map((x, i) => q.submit({ kind: 'video', label: `J${i}`, run: x.run }));
    // J0 rendering, J1 queued.
    q.cancel(ids[1]!);
    expect(q.list()[1]!.status).toBe('canceled');
    // Finishing J0 must not error trying to promote the canceled job.
    r[0]!.resolve('ok');
    await flush();
    expect(q.list()[0]!.status).toBe('done');
  });

  it('cancels a rendering job by aborting its signal → canceled, slot freed', async () => {
    const { q } = makeQueue(1);
    let aborted = false;
    const gate = deferredRunner();
    const id = q.submit({
      kind: 'video',
      label: 'A',
      run: (ctx) => {
        ctx.signal.addEventListener('abort', () => {
          aborted = true;
          gate.reject(new DOMException('aborted', 'AbortError'));
        });
        return gate.run(ctx);
      },
    });
    const next = deferredRunner();
    q.submit({ kind: 'music', label: 'B', run: next.run });
    q.cancel(id);
    await flush();
    expect(aborted).toBe(true);
    expect(q.list()[0]!.status).toBe('canceled');
    expect(q.list()[1]!.status).toBe('rendering'); // promoted after the slot freed
  });

  it('treats an AbortError rejection as canceled (not failed)', async () => {
    const { q } = makeQueue();
    const a = deferredRunner();
    q.submit({ kind: 'video', label: 'A', run: a.run });
    a.reject(new DOMException('aborted', 'AbortError'));
    await flush();
    expect(q.list()[0]!.status).toBe('canceled');
  });

  it('emits a snapshot on every mutation', () => {
    const { q, snapshots } = makeQueue();
    const a = deferredRunner();
    q.submit({ kind: 'video', label: 'A', run: a.run });
    a.ctx().onProgress({ pct: 10 });
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    // Snapshots are immutable copies, not live internals.
    expect(snapshots[snapshots.length - 1]![0]!.pct).toBe(10);
  });

  it('clearFinished removes terminal jobs but keeps active/queued', async () => {
    const { q } = makeQueue(1);
    const r = [deferredRunner(), deferredRunner()];
    r.forEach((x, i) => q.submit({ kind: 'video', label: `J${i}`, run: x.run }));
    r[0]!.resolve('x');
    await flush();
    // J0 done, J1 promoted to rendering.
    q.clearFinished();
    const list = q.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe('J1');
    expect(list[0]!.status).toBe('rendering');
  });

  it('never exceeds the concurrency cap across a burst', () => {
    const { q } = makeQueue(3);
    const runners = Array.from({ length: 8 }, () => deferredRunner());
    runners.forEach((r, i) => q.submit({ kind: 'video', label: `J${i}`, run: r.run }));
    expect(q.activeCount()).toBe(3);
    expect(q.list().filter((j) => j.status === 'queued')).toHaveLength(5);
  });

  it('fires onSettle exactly once with the final job on success (done + result)', async () => {
    const { q } = makeQueue();
    const a = deferredRunner();
    const settled: Job[] = [];
    q.submit({ kind: 'image', label: 'A', run: a.run, onSettle: (j) => settled.push(j) });
    a.resolve('https://x/img.png');
    await flush();
    expect(settled).toHaveLength(1);
    expect(settled[0]!.status).toBe('done');
    expect(settled[0]!.result).toBe('https://x/img.png');
    expect(settled[0]!.pct).toBe(100);
  });

  it('fires onSettle with failed + error, and with canceled', async () => {
    const { q } = makeQueue(1);
    const fail = deferredRunner();
    const settledFail: Job[] = [];
    q.submit({ kind: 'video', label: 'F', run: fail.run, onSettle: (j) => settledFail.push(j) });
    fail.reject(new Error('boom'));
    await flush();
    expect(settledFail[0]!.status).toBe('failed');
    expect(settledFail[0]!.error).toBe('boom');

    // Cancel a QUEUED job → finalizes 'canceled' immediately (a rendering runner that
    // ignores its abort signal would never settle, so we hold the single slot with an
    // occupier and cancel the one still waiting).
    const settledCancel: Job[] = [];
    const { q: q2 } = makeQueue(1);
    q2.submit({ kind: 'video', label: 'occupy', run: deferredRunner().run });
    const cid = q2.submit({ kind: 'video', label: 'C', run: deferredRunner().run, onSettle: (j) => settledCancel.push(j) });
    q2.cancel(cid);
    expect(settledCancel[0]!.status).toBe('canceled');
  });

  it('an onSettle that throws never breaks the queue (next job still promotes)', async () => {
    const { q } = makeQueue(1);
    const a = deferredRunner();
    const b = deferredRunner();
    q.submit({ kind: 'image', label: 'A', run: a.run, onSettle: () => { throw new Error('telemetry down'); } });
    q.submit({ kind: 'image', label: 'B', run: b.run });
    a.resolve('x');
    await flush();
    expect(q.list()[1]!.status).toBe('rendering'); // B promoted despite A's onSettle throwing
  });
});

/** Let queued microtasks (promise callbacks) flush. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

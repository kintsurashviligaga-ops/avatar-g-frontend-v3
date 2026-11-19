/** @jest-environment node */
/**
 * The live timeline's browser half: the stream as a watch (./taskStream), and the follows waiting on it instead of a
 * fixed poll (./jobFollow followTask, lib/agent/run/runClient followRun). Without a stream they poll as before.
 */
import { followTask, POLL_MS, type FollowDeps } from './jobFollow';
import { watchTask, type EventSourceCtor, type EventSourceLike } from './taskStream';
import { followRun } from '@/lib/agent/run/runClient';
import type { TaskView } from '@/lib/tasks/taskView';

const TASK: TaskView = {
  id: 'job-1', kind: 'agent-montage', service: 'film', status: 'running', stage: 'normalize', pct: 10, attempt: 1,
  result: null, error: null, cancellable: true, label: null, position: null, createdAt: null, updatedAt: null,
};

class FakeES implements EventSourceLike {
  static last: FakeES | null = null;
  readyState = 1;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  private fns = new Map<string, Array<(e: { data?: unknown }) => void>>();
  constructor(public url: string, public init?: { withCredentials?: boolean }) { FakeES.last = this; }
  addEventListener(type: string, fn: (e: { data?: unknown }) => void) { this.fns.set(type, [...(this.fns.get(type) ?? []), fn]); }
  emit(type: string, data?: unknown) { for (const f of this.fns.get(type) ?? []) f({ data: data === undefined ? undefined : JSON.stringify(data) }); }
  close() { this.closed = true; this.readyState = 2; }
}
const ES = FakeES as unknown as EventSourceCtor;
const progress = (task: TaskView) => ({ type: 'agent_progress', task_id: task.id, task });

test('the watch opens the stream with the session and hands over each task the moment it comes', async () => {
  const w = watchTask('job 1', { lang: 'ka', after: 3, ES })!;
  const es = FakeES.last!;
  expect(es.url).toBe('/api/tasks/stream?id=job+1&lang=ka&after=3');
  expect(es.init).toEqual({ withCredentials: true });
  const p = w.next(10_000);
  es.emit('agent_progress', progress({ ...TASK, stage: 'stitch' }));
  expect((await p)!.stage).toBe('stitch');
  expect(w.progress!.type).toBe('agent_progress');
  // One that came while nobody waited is kept for the next wait.
  es.emit('agent_progress', progress({ ...TASK, stage: 'qc' }));
  expect((await w.next(10))!.stage).toBe('qc');
  // A quiet stream: the wait ends empty after its time.
  expect(await w.next(5)).toBeNull();
  expect(w.dead).toBe(false);
});

test('end, gone, a closed stream or repeated errors make the watch dead (the follow polls); no EventSource is no watch', async () => {
  const w = watchTask('a', { ES })!;
  const p = w.next(10_000);
  FakeES.last!.emit('end', { status: 'completed' });
  expect(await p).toBeNull();
  expect(w.dead).toBe(true);
  expect(FakeES.last!.closed).toBe(true);

  const w2 = watchTask('b', { ES })!;
  const es2 = FakeES.last!;
  es2.readyState = 0;
  for (let i = 0; i < 3; i++) es2.onerror!({});
  expect(w2.dead).toBe(false); // EventSource reconnects by itself
  es2.onerror!({});
  expect(w2.dead).toBe(true);

  const w3 = watchTask('c', { ES })!;
  FakeES.last!.readyState = 2;
  FakeES.last!.onerror!({});
  expect(w3.dead).toBe(true);

  expect(watchTask('d', { ES: null })).toBeNull();
});

describe('the follows wait on the stream', () => {
  function deps(watch: FollowDeps['watch'], reads: TaskView[]) {
    let clock = 0;
    const fetched: string[] = [];
    const sleeps: number[] = [];
    const progress: Array<string | null> = [];
    const d: FollowDeps = {
      fetch: async (u) => {
        fetched.push(u);
        const task = reads.shift() ?? TASK;
        return new Response(JSON.stringify({ ok: true, task }), { status: 200 });
      },
      sleep: async (ms) => { sleeps.push(ms); clock += ms; },
      now: () => clock,
      onProgress: (_pct, stage) => progress.push(stage),
      ...(watch ? { watch } : {}),
    };
    return { d, fetched, sleeps, progress };
  }
  const spec = {
    jobId: 'job-1',
    done: (t: TaskView) => (t.status === 'completed' ? 'done' : null),
    refused: () => 'refused',
    lost: (why: string) => `lost:${why}`,
  };

  test('each step change comes from the stream, with no poll interval and no reads of our own', async () => {
    const streamed = [{ ...TASK, stage: 'stitch' }, { ...TASK, stage: 'qc' }, { ...TASK, status: 'completed' as const, stage: 'completed' }];
    let closed = false;
    const watch = () => ({ dead: false, progress: null, close: () => { closed = true; }, next: async () => streamed.shift() ?? null });
    const h = deps(watch, [TASK]);
    expect(await followTask(h.d, spec, { queued: true, readNow: true, neverFound: 'not_found' })).toBe('done');
    expect(h.fetched).toHaveLength(1); // the first read only
    expect(h.sleeps).toEqual([]);
    expect(h.progress).toEqual(['normalize', 'stitch', 'qc']);
    expect(closed).toBe(true);
  });

  test('a dead stream falls back to reading every POLL_MS, as before', async () => {
    const watch = () => ({ dead: true, progress: null, close: () => {}, next: async () => null });
    const h = deps(watch, [TASK, { ...TASK, stage: 'stitch' }, { ...TASK, status: 'completed', stage: 'completed' }]);
    expect(await followTask(h.d, spec, { queued: true, readNow: true, neverFound: 'not_found' })).toBe('done');
    expect(h.sleeps).toEqual([POLL_MS, POLL_MS]);
    expect(h.fetched).toHaveLength(3);
  });

  test('a quiet stream still gets a read of our own', async () => {
    let n = 0;
    const watch = () => ({ dead: false, progress: null, close: () => {}, next: async () => { n++; return null; } });
    const h = deps(watch, [TASK, { ...TASK, status: 'completed', stage: 'completed' }]);
    expect(await followTask(h.d, spec, { queued: true, readNow: true, neverFound: 'not_found' })).toBe('done');
    expect(n).toBe(1);
    expect(h.fetched).toHaveLength(2);
  });

  test('a multi-step run: streamed reads merge their events, the run ends on the streamed final state', async () => {
    const ev = (seq: number) => ({ seq, at: seq, type: 'step_started' as never });
    const run = { ...TASK, kind: 'agent-run', events: [ev(1)] };
    const streamed: TaskView[] = [{ ...run, events: [ev(2)] }, { ...run, status: 'completed', events: [ev(3)] }];
    const afters: Array<number | undefined> = [];
    const seen: number[][] = [];
    const end = await followRun({
      fetch: async () => new Response(JSON.stringify({ ok: true, task: run }), { status: 200 }),
      sleep: async () => {},
      now: () => 0,
      onTask: (_t, evs) => seen.push(evs.map((e) => e.seq)),
      watch: (_id, after) => { afters.push(after); return { dead: false, progress: null, close: () => {}, next: async () => streamed.shift() ?? null }; },
    }, 'run-1');
    expect(end.ok).toBe(true);
    expect(afters).toEqual([1]);
    expect(seen).toEqual([[1], [1, 2], [1, 2, 3]]);
  });
});

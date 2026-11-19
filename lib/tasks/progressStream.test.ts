/** @jest-environment node */
/**
 * The live timeline's server half (GG 2026-11-06 06:30Z): the `agent_progress` payload (./agentProgress) and the
 * stream that sends it on every change (./progressStream).
 */
import { agentProgress } from './agentProgress';
import { sseEvent, streamTask, type StreamDeps } from './progressStream';
import type { TaskView } from './taskView';

const base: TaskView = {
  id: 'job-1', kind: 'agent-montage', service: 'film', status: 'running', stage: 'normalize', pct: 30, attempt: 1,
  result: null, error: null, cancellable: true, label: null, position: null, createdAt: null, updatedAt: null,
};
const t = (over: Partial<TaskView>): TaskView => ({ ...base, ...over });

describe('agentProgress', () => {
  test('the payload GG asked for: type, total_steps, current_step and the step in progress', () => {
    const ev = agentProgress(t({ stage: 'stitch', pct: 55 }), { lang: 'ka' });
    expect(ev.type).toBe('agent_progress');
    expect(ev.task_id).toBe('job-1');
    // Optional legs (footage, music) the job has not been on are not listed.
    expect(ev.steps.map((s) => s.key)).toEqual(['prepare', 'normalize', 'stitch', 'qc', 'save']);
    expect(ev.total_steps).toBe(5);
    expect(ev.current_step).toBe(3);
    expect(ev.step_details).toEqual({ key: 'stitch', title: 'ნაწილების შეერთება', description: '55%', status: 'in_progress' });
    expect(ev.steps.map((s) => s.status)).toEqual(['completed', 'completed', 'in_progress', 'pending', 'pending']);
  });

  test('a leg the job has been on stays listed after it moved on; a finished job has every step completed', () => {
    const seen = new Set(['normalize', 'stitch', 'inserts']);
    const ev = agentProgress(t({ stage: 'qc', pct: 90 }), { lang: 'en', seen });
    expect(ev.steps.map((s) => s.key)).toEqual(['prepare', 'normalize', 'stitch', 'inserts', 'qc', 'save']);
    expect(ev.step_details.key).toBe('qc');
    const done = agentProgress(t({ status: 'completed', stage: 'completed', pct: 100 }), { lang: 'en', seen });
    expect(done.steps.every((s) => s.status === 'completed')).toBe(true);
    expect(done.current_step).toBe(done.total_steps);
  });

  test('a failure marks the step it broke on; a queued job is on its first step', () => {
    const ev = agentProgress(t({ status: 'failed', stage: 'qc', error: 'qc_failed' }));
    expect(ev.step_details).toMatchObject({ key: 'qc', status: 'failed', description: 'qc_failed' });
    const q = agentProgress(t({ status: 'queued', stage: 'queued', pct: null }), { lang: 'en' });
    expect(q.step_details).toMatchObject({ key: 'prepare', status: 'in_progress', description: 'Queued' });
  });

  test('a multi-step run: each tool call of the plan is a step with its own status', () => {
    const step = (id: string, tool: 'montage' | 'audio_extract', status: TaskView['status'], stage: string | null = null) => ({
      id, tool, capability: 'video.montage' as never, status, taskId: null, stage, pct: null, result: null, error: null, reused: false, approval: null,
    });
    const ev = agentProgress(t({ kind: 'agent-run', stage: null, steps: [step('sound', 'audio_extract', 'completed'), step('clip', 'montage', 'running', 'stitch')] }), { lang: 'ka' });
    expect(ev.total_steps).toBe(2);
    expect(ev.current_step).toBe(2);
    expect(ev.steps.map((s) => [s.title, s.status])).toEqual([['MP3-ის ამოღება', 'completed'], ['ვიდეოს მონტაჟი', 'in_progress']]);
    expect(ev.step_details.description).toBe('stitch');
  });
});

describe('streamTask', () => {
  function harness(reads: Array<TaskView | null | Error>) {
    const frames: string[] = [];
    let clock = 0;
    const afters: Array<number | undefined> = [];
    const deps: StreamDeps = {
      read: async (after) => {
        afters.push(after);
        const r = reads.shift();
        if (r === undefined) throw new Error('read past the script');
        if (r instanceof Error) throw r;
        return r;
      },
      sleep: async (ms) => { clock += ms; },
      now: () => clock,
      write: (f) => { frames.push(f); return true; },
      closed: () => false,
    };
    return { deps, frames, afters };
  }
  const events = (frames: string[]) => frames.filter((f) => f.startsWith('event:')).map((f) => f.split('\n')[0]!.slice(7));

  test('one event per change, none for a read that changed nothing, then end when the task ends', async () => {
    const h = harness([t({ stage: 'normalize' }), t({ stage: 'normalize', updatedAt: 'x' }), t({ stage: 'stitch' }), t({ status: 'completed', stage: 'completed', pct: 100 })]);
    expect(await streamTask(h.deps, { lang: 'ka' })).toBe('final');
    expect(events(h.frames)).toEqual(['agent_progress', 'agent_progress', 'agent_progress', 'end']);
    const last = JSON.parse(h.frames[2]!.split('\n')[1]!.slice(6));
    expect(last.status).toBe('completed');
    expect(last.task.id).toBe('job-1');
  });

  test('a task that is not the caller’s is gone; a client that left ends the stream', async () => {
    const h = harness([null]);
    expect(await streamTask(h.deps)).toBe('gone');
    expect(events(h.frames)).toEqual(['gone']);
    const h2 = harness([t({})]);
    h2.deps.write = () => false;
    expect(await streamTask(h2.deps)).toBe('closed');
  });

  test('a quiet task gets a keep-alive comment; the time limit asks the browser to reconnect', async () => {
    const reads = Array.from({ length: 40 }, () => t({}));
    const h = harness(reads);
    expect(await streamTask(h.deps, { intervalMs: 1_000, heartbeatMs: 5_000, maxMs: 20_000 })).toBe('timeout');
    expect(h.frames.some((f) => f === ': keep-alive\n\n')).toBe(true);
    expect(events(h.frames)).toEqual(['agent_progress', 'reconnect']);
  });

  test('a read that fails is read again; a run of failures hands the client back to polling', async () => {
    const h = harness([new Error('db'), t({ status: 'completed', stage: 'completed' })]);
    expect(await streamTask(h.deps)).toBe('final');
    const h2 = harness([new Error('a'), new Error('b'), new Error('c'), new Error('d'), new Error('e')]);
    expect(await streamTask(h2.deps)).toBe('timeout');
    expect(events(h2.frames)).toEqual(['reconnect']);
  });

  test('a run’s events are asked for after the newest one already sent', async () => {
    const ev = (seq: number) => ({ seq, at: seq, type: 'step_started' as never });
    const h = harness([
      t({ kind: 'agent-run', events: [ev(3), ev(4)] }),
      t({ kind: 'agent-run', events: [ev(5)] }),
      t({ kind: 'agent-run', status: 'completed', events: [] }),
    ]);
    await streamTask(h.deps, { after: 2 });
    expect(h.afters).toEqual([2, 4, 5]);
    // A new event alone is a change worth sending.
    expect(events(h.frames)).toEqual(['agent_progress', 'agent_progress', 'agent_progress', 'end']);
  });

  test('frames are well-formed SSE', () => {
    expect(sseEvent('end', { status: 'completed' })).toBe('event: end\ndata: {"status":"completed"}\n\n');
  });
});

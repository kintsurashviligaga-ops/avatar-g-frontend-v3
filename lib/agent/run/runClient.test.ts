/** @jest-environment node */
/**
 * The studio's calls for a multi-step Agent G run, with a scripted /api/tasks: uploads, the plan, Start sent again when
 * its answer is lost (the server replays it), the follow that reads only new events and merges them, a yes bound to its
 * quote, Retry (resume) and Stop.
 */
import {
  approveRunStep, cancelRun, followRun, mergeEvents, planRunClient, resumeRunClient, startRunClient, uploadAll, RUN_FOLLOW_MS,
} from './runClient';
import type { TaskView } from '@/lib/tasks/taskView';
import type { RunEvent } from './runEngine';
import type { RunSpec } from './runSpec';

type Call = { url: string; body?: Record<string, unknown> };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function server(handler: (c: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const c: Call = { url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    calls.push(c);
    return handler(c, calls.length);
  };
  return { fetch, calls };
}

const SPEC: RunSpec = {
  title: 'clips to the concert sound',
  steps: [
    { id: 'sound', tool: 'audio_extract', source: { file: 'u/a.mp4' } },
    { id: 'cut', tool: 'montage', files: ['u/b.mp4', { step: 'sound' }] },
  ],
};
const PLAN = { runId: 'run-1', credits: 0, expiresAt: 9, steps: [{ id: 'sound', tool: 'audio_extract', credits: 0 }, { id: 'cut', tool: 'montage', credits: 0 }] };
const ev = (seq: number, type: RunEvent['type'], step?: string): RunEvent => ({ seq, at: seq, type, ...(step ? { step } : {}) });
const task = (status: TaskView['status'], events: RunEvent[] = []): TaskView => ({
  id: 'run-1', kind: 'agent-run', service: 'film', status, stage: null, pct: null, attempt: null, result: null, error: null,
  cancellable: true, label: null, position: null, createdAt: null, updatedAt: null, steps: [], events,
});

describe('upload', () => {
  test('every file, in order, each settled one counted; the ones that did not land are named', async () => {
    const seen: number[] = [];
    const ok = await uploadAll({ upload: async (d) => `u/${d}`, onUploaded: (n) => seen.push(n) }, [{ dataUrl: 'a', mimeType: 'video/mp4' }, { dataUrl: 'b', mimeType: 'video/mp4' }]);
    expect(ok).toEqual({ ok: true, paths: ['u/a', 'u/b'] });
    expect(seen).toEqual([1, 2]);
    const bad = await uploadAll({ upload: async (d) => (d === 'b' ? null : 'u/x') }, [{ dataUrl: 'a', mimeType: 'v' }, { dataUrl: 'b', mimeType: 'v' }, { dataUrl: 'c', mimeType: 'v' }]);
    expect(bad).toEqual({ ok: false, code: 'upload_failed', files: [1] });
    const thrown = await uploadAll({ upload: async () => { throw new Error('x'); } }, [{ dataUrl: 'a', mimeType: 'v' }]);
    expect(thrown).toEqual({ ok: false, code: 'upload_failed', files: [0] });
  });
});

describe('plan and Start', () => {
  test('the plan is asked for with the spec; the signed spec and token come back', async () => {
    const s = server(() => json(200, { ok: true, plan: PLAN, spec: SPEC, token: 'tok' }));
    expect(await planRunClient(s.fetch, SPEC)).toEqual({ ok: true, plan: PLAN, spec: SPEC, token: 'tok' });
    expect(s.calls).toEqual([{ url: '/api/tasks', body: { action: 'plan', spec: SPEC } }]);
  });

  test('a closed account, a bad spec and no network each say so', async () => {
    expect(await planRunClient(server(() => json(403, { ok: false, error: 'not_enabled' })).fetch, SPEC)).toEqual({ ok: false, code: 'closed' });
    expect(await planRunClient(server(() => json(400, { ok: false, error: 'bad_spec' })).fetch, SPEC)).toEqual({ ok: false, code: 'bad_spec' });
    expect(await planRunClient(async () => { throw new Error('offline'); }, SPEC)).toEqual({ ok: false, code: 'network' });
  });

  test('Start sends the signed spec and token; a lost answer is sent again and the replay answers with the same run', async () => {
    const s = server((_c, n) => (n === 1 ? json(502, null) : json(200, { ok: true, jobId: 'run-1', status: 'queued', replay: n > 2 })));
    const r = await startRunClient({ fetch: s.fetch, sleep: async () => undefined }, { spec: SPEC, token: 'tok' });
    expect(r).toEqual({ ok: true, runId: 'run-1' });
    expect(s.calls.map((c) => c.body)).toEqual([{ action: 'run', spec: SPEC, token: 'tok' }, { action: 'run', spec: SPEC, token: 'tok' }]);
  });

  test('a refusal is final (not sent again); three lost answers are "network"', async () => {
    const refused = server(() => json(409, { ok: false, error: 'quote_expired' }));
    expect(await startRunClient({ fetch: refused.fetch, sleep: async () => undefined }, { spec: SPEC, token: 't' })).toEqual({ ok: false, code: 'quote_expired' });
    expect(refused.calls).toHaveLength(1);
    const lost = server(() => json(503, null));
    expect(await startRunClient({ fetch: lost.fetch, sleep: async () => undefined }, { spec: SPEC, token: 't' })).toEqual({ ok: false, code: 'network' });
    expect(lost.calls).toHaveLength(3);
  });
});

describe('follow', () => {
  test('events merge by number, oldest first, without duplicates', () => {
    expect(mergeEvents([ev(1, 'run.created'), ev(2, 'step.queued', 'sound')], [ev(2, 'step.queued', 'sound'), ev(3, 'step.running', 'sound')]).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(mergeEvents(undefined, undefined)).toEqual([]);
  });

  test('each read asks only for the events after the last one seen, and the follow ends at a final status', async () => {
    const reads = [
      task('running', [ev(1, 'run.created'), ev(2, 'step.queued', 'sound')]),
      task('running', [ev(3, 'step.completed', 'sound')]),
      task('completed', [ev(4, 'step.completed', 'cut'), ev(5, 'run.status')]),
    ];
    const s = server((_c, n) => json(200, { ok: true, task: reads[n - 1] }));
    const seen: number[][] = [];
    const end = await followRun({ fetch: s.fetch, sleep: async () => undefined, now: () => 0, onTask: (_t, events) => seen.push(events.map((e) => e.seq)) }, 'run-1');
    expect(end).toMatchObject({ ok: true, task: { status: 'completed' } });
    expect(s.calls.map((c) => c.url)).toEqual(['/api/tasks?id=run-1', '/api/tasks?id=run-1&after=2', '/api/tasks?id=run-1&after=3']);
    expect(seen).toEqual([[1, 2], [1, 2, 3], [1, 2, 3, 4, 5]]);
  });

  test('a run waiting for the user\'s yes is still followed; offline reads and 5xx are read again', async () => {
    let n = 0;
    const fetch = async () => {
      n += 1;
      if (n === 1) throw new Error('offline');
      if (n === 2) return json(503, {});
      if (n === 3) return json(200, { ok: true, task: task('awaiting_approval') });
      return json(200, { ok: true, task: task('failed') });
    };
    const end = await followRun({ fetch, sleep: async () => undefined, now: () => 0, onTask: () => undefined }, 'run-1');
    expect(end).toMatchObject({ ok: true, task: { status: 'failed' } });
    expect(n).toBe(4);
  });

  test('signed out ends it; an unknown run is "not_found" after three reads; a card that stopped following ends quietly', async () => {
    expect(await followRun({ fetch: server(() => json(401, {})).fetch, sleep: async () => undefined, now: () => 0, onTask: () => undefined }, 'r')).toEqual({ ok: false, code: 'unauthenticated' });
    const gone = server(() => json(404, { ok: false, error: 'not_found', message: 'No such task.' }));
    expect(await followRun({ fetch: gone.fetch, sleep: async () => undefined, now: () => 0, onTask: () => undefined }, 'r')).toEqual({ ok: false, code: 'not_found' });
    expect(gone.calls).toHaveLength(3);
    const quiet = server(() => json(200, { ok: true, task: task('running') }));
    let reads = 0;
    expect(await followRun({ fetch: quiet.fetch, sleep: async () => undefined, now: () => 0, onTask: () => { reads += 1; }, stopped: () => reads >= 2 }, 'r')).toEqual({ ok: false, code: 'stopped' });
  });

  test('a run that outlives the follow is "network" (it goes on server-side)', async () => {
    let t = 0;
    const s = server(() => json(200, { ok: true, task: task('running') }));
    const end = await followRun({ fetch: s.fetch, sleep: async (ms) => { t += ms; }, now: () => t, onTask: () => undefined }, 'r');
    expect(end).toEqual({ ok: false, code: 'network' });
    expect(t).toBeGreaterThanOrEqual(RUN_FOLLOW_MS);
  });
});

describe('the user\'s actions', () => {
  test('a yes names the run, the step and the quote; the run comes back', async () => {
    const s = server(() => json(200, { ok: true, task: task('running') }));
    expect(await approveRunStep(s.fetch, { runId: 'run-1', step: 'cut', quoteId: 'q-1' })).toMatchObject({ ok: true, task: { status: 'running' } });
    expect(s.calls[0]!.body).toEqual({ action: 'approve', id: 'run-1', step: 'cut', quoteId: 'q-1' });
    expect(await approveRunStep(server(() => json(409, { ok: false, error: 'quote_changed' })).fetch, { runId: 'r', step: 'cut', quoteId: 'old' })).toEqual({ ok: false, code: 'quote_changed' });
  });

  test('Retry carries the run on as a new run; a run with nothing left says so', async () => {
    const s = server(() => json(200, { ok: true, jobId: 'run-2', status: 'queued', replay: false }));
    expect(await resumeRunClient(s.fetch, 'run-1')).toEqual({ ok: true, runId: 'run-2' });
    expect(s.calls[0]!.body).toEqual({ action: 'resume', id: 'run-1' });
    expect(await resumeRunClient(server(() => json(409, { ok: false, error: 'nothing_to_resume' })).fetch, 'run-1')).toEqual({ ok: false, code: 'nothing_to_resume' });
  });

  test('Stop goes through the task route', async () => {
    const s = server(() => json(200, { ok: true }));
    expect(await cancelRun(s.fetch, 'run-1')).toBe(true);
    expect(s.calls[0]).toEqual({ url: '/api/tasks', body: { action: 'cancel', id: 'run-1' } });
  });
});

/** @jest-environment node */
/**
 * The studio's calls for Agent G's montage, with a scripted server: uploads, the plan, the run queued on the montage
 * route and followed to its end through the one task route (/api/tasks) with its progress, a lost answer sent again,
 * and Stop (through the task route too).
 */
import { cancelAgentMontage, montageEnabled, quoteAgentMontage, runAgentMontage, FOLLOW_MS, POLL_MS, SEND_TRIES } from './montageClient';

type Call = { url: string; body?: Record<string, unknown> };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function server(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const c: Call = { url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    calls.push(c);
    return handler(c);
  };
  return { fetch, calls };
}

const FILES = [
  { dataUrl: 'blob:a', mimeType: 'video/mp4', name: 'a.mp4' },
  { dataUrl: 'blob:b', mimeType: 'video/mp4', name: 'b.mp4' },
  { dataUrl: 'blob:s', mimeType: 'audio/mpeg', name: 's.mp3' },
];
const QUOTE = { jobId: 'job-1', credits: 0, totalSec: 20, shots: 8, clips: 2, aspect: '16:9', beatSynced: true, bpm: 120, musicStartSec: 0, unusedFiles: [], expiresAt: 1 };

test('enabled only when the route says so; a closed or broken route is "no"', async () => {
  expect(await montageEnabled(server(() => json(200, { enabled: true })).fetch)).toBe(true);
  expect(await montageEnabled(server(() => json(200, { enabled: false })).fetch)).toBe(false);
  expect(await montageEnabled(server(() => json(500, {})).fetch)).toBe(false);
  expect(await montageEnabled(async () => { throw new Error('offline'); })).toBe(false);
});

describe('quote', () => {
  test('uploads every file in order and asks for the plan with the storage paths and the words', async () => {
    const s = server(() => json(200, { ok: true, quote: QUOTE, request: { shots: [] }, token: 'tok' }));
    const upload = jest.fn(async (d: string) => `u/${d.slice(5)}`);
    const r = await quoteAgentMontage({ fetch: s.fetch, upload }, { prompt: 'cut to the song', files: FILES });
    expect(r).toEqual({ ok: true, quote: QUOTE, request: { shots: [] }, token: 'tok' });
    expect(upload).toHaveBeenCalledTimes(3);
    expect(s.calls).toEqual([{ url: '/api/agent/media/montage', body: { action: 'quote', files: ['u/a', 'u/b', 'u/s'], prompt: 'cut to the song' } }]);
  });

  test('reports each settled upload, so the card counts them while they go', async () => {
    const s = server(() => json(200, { ok: true, quote: QUOTE, request: {}, token: 'tok' }));
    const seen: Array<[number, number]> = [];
    await quoteAgentMontage({ fetch: s.fetch, upload: async (d) => (d === 'blob:b' ? null : 'u/x'), onUploaded: (n, total) => seen.push([n, total]) }, { prompt: 'p', files: FILES });
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  test('a file that did not upload is named, and no plan is asked for', async () => {
    const s = server(() => json(200, {}));
    const r = await quoteAgentMontage({ fetch: s.fetch, upload: async (d) => (d === 'blob:b' ? null : 'u/x') }, { prompt: 'p', files: FILES });
    expect(r).toEqual({ ok: false, code: 'upload_failed', files: [1] });
    expect(s.calls).toHaveLength(0);
  });

  test('a refusal keeps its code and the files it is about; a closed route is "closed"; offline is "network"', async () => {
    const up = { upload: async () => 'u/x' };
    expect(await quoteAgentMontage({ fetch: server(() => json(403, { ok: false, error: 'media_not_yours', message: 'm', files: [2] })).fetch, ...up }, { prompt: 'p', files: FILES }))
      .toEqual({ ok: false, code: 'media_not_yours', files: [2] });
    expect(await quoteAgentMontage({ fetch: server(() => json(404, { error: 'not_found' })).fetch, ...up }, { prompt: 'p', files: FILES }))
      .toEqual({ ok: false, code: 'closed' });
    expect(await quoteAgentMontage({ fetch: async () => { throw new Error('x'); }, ...up }, { prompt: 'p', files: FILES }))
      .toEqual({ ok: false, code: 'network' });
  });
});

describe('run', () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => { t += ms; await Promise.resolve(); } };
  };
  // The montage route's answer to `run` (its executor's JobView)…
  const QUEUED = { ok: true, jobId: 'job-1', status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false };
  const DELIVERED = { ok: true, jobId: 'job-1', status: 'completed', videoUrl: 'https://m/out.mp4', durationSec: 19.97, aspect: '16:9' };
  // …and the task route's answer to a read (lib/tasks/taskView TaskView).
  const task = (t: Record<string, unknown>) => ({
    ok: true,
    task: { id: 'job-1', kind: 'agent-montage', service: 'film', stage: null, pct: null, attempt: null, result: null, error: null, cancellable: false, createdAt: null, updatedAt: null, ...t },
  });
  const running = (pct: number, stage = 'stitch') => task({ status: 'running', stage, pct, attempt: 1, cancellable: true });
  const COMPLETED = task({ status: 'completed', pct: 100, result: { url: 'https://m/out.mp4', media: 'video', durationSec: 19.97, aspect: '16:9' } });
  const failed = (error: string) => task({ status: error === 'cancelled' ? 'cancelled' : 'failed', error });
  const reads = (s: { calls: Call[] }) => s.calls.filter((c) => !c.body);

  test('queues the signed plan once, follows the job with its progress, and returns the master', async () => {
    const views = [running(10, 'starting'), running(55), COMPLETED];
    const s = server((c) => (c.body ? json(200, QUEUED) : json(200, views.shift())));
    const progress: Array<[number | null, string | null]> = [];
    const r = await runAgentMontage(
      { fetch: s.fetch, ...clock(), onProgress: (p, st) => progress.push([p, st]) },
      { request: { shots: [1] }, token: 'tok', prompt: 'p', jobId: 'job-1' },
    );
    expect(r).toEqual({ ok: true, videoUrl: 'https://m/out.mp4', durationSec: 19.97, aspect: '16:9' });
    expect(s.calls.filter((c) => c.body)).toEqual([
      { url: '/api/agent/media/montage', body: { action: 'run', request: { shots: [1] }, token: 'tok', prompt: 'p' } },
    ]);
    expect(progress).toEqual([[0, 'queued'], [10, 'starting'], [55, 'stitch']]);
    expect(reads(s).map((c) => c.url)).toEqual(Array(3).fill('/api/tasks?id=job-1'));
  });

  test('a replay of a delivered job is read at once, with no wait', async () => {
    const s = server((c) => (c.body ? json(200, { ...DELIVERED, replay: true }) : json(200, COMPLETED)));
    const k = clock();
    const progress: unknown[] = [];
    expect(await runAgentMontage({ fetch: s.fetch, ...k, onProgress: (...a) => progress.push(a) }, { request: {}, token: 't', jobId: 'job-1' }))
      .toEqual({ ok: true, videoUrl: 'https://m/out.mp4', durationSec: 19.97, aspect: '16:9' });
    expect(s.calls).toHaveLength(2);
    expect(k.now()).toBe(0);
    expect(progress).toEqual([]);
  });

  test('a refusal comes back with its code (an expired plan, too few credits)', async () => {
    const r = await runAgentMontage(
      { fetch: server(() => json(409, { ok: false, error: 'quote_expired', message: 'm' })).fetch, ...clock(), onProgress: () => {} },
      { request: {}, token: 't', jobId: 'job-1' },
    );
    expect(r).toEqual({ ok: false, code: 'quote_expired' });
    expect(await runAgentMontage(
      { fetch: server(() => json(402, { ok: false, error: 'insufficient_credits', message: 'm' })).fetch, ...clock(), onProgress: () => {} },
      { request: {}, token: 't', jobId: 'job-1' },
    )).toEqual({ ok: false, code: 'insufficient_credits' });
  });

  test('a job that ends failed reads as its reason: cancelled, a failed QC, a render that died twice', async () => {
    for (const [error, code] of [['cancelled', 'cancelled'], ['qc_failed', 'qc_failed'], ['render_failed', 'render_failed'], ['something_new', 'render_failed']]) {
      const s = server((c) => (c.body ? json(200, QUEUED) : json(200, failed(error))));
      expect(await runAgentMontage({ fetch: s.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' }))
        .toEqual({ ok: false, code });
    }
  });

  test('a lost answer is sent again (the server replays the same job, never a second one), then followed', async () => {
    let sends = 0;
    const s = server((c) => {
      if (c.body) {
        sends += 1;
        if (sends === 1) return Promise.reject(new Error('reset'));
        if (sends === 2) return new Response('upstream timeout', { status: 504 });
        return json(200, { ...QUEUED, replay: true });
      }
      return json(200, COMPLETED);
    });
    const r = await runAgentMontage({ fetch: s.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' });
    expect(r).toMatchObject({ ok: true, videoUrl: 'https://m/out.mp4' });
    expect(sends).toBe(3);
  });

  test('an earlier send that got through and failed: the job is read for its real reason', async () => {
    let sends = 0;
    const s = server((c) => {
      if (c.body) return ++sends === 1 ? Promise.reject(new Error('reset')) : json(409, { ok: false, error: 'already_failed', message: 'm', jobId: 'job-1' });
      return json(200, failed('cancelled'));
    });
    expect(await runAgentMontage({ fetch: s.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' }))
      .toEqual({ ok: false, code: 'cancelled' });
  });

  test('offline for a while, or a busy server, does not end the follow; the job does', async () => {
    let n = 0;
    const s = server((c) => {
      if (c.body) return json(200, QUEUED);
      n += 1;
      if (n <= 3) return Promise.reject(new Error('offline'));
      if (n <= 5) return json(n === 4 ? 429 : 503, { error: 'busy' });
      return json(200, COMPLETED);
    });
    expect(await runAgentMontage({ fetch: s.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' }))
      .toMatchObject({ ok: true });
    expect(n).toBe(6);
  });

  test('a run that never got through is "network"; a session that ended is "unauthenticated"; a job that never ends gives up', async () => {
    const never = server((c) => (c.body ? Promise.reject(new Error('reset')) : json(404, { ok: false, error: 'not_found', message: 'No such task.' })));
    expect(await runAgentMontage({ fetch: never.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' }))
      .toEqual({ ok: false, code: 'network' });
    expect(never.calls.filter((c) => c.body)).toHaveLength(SEND_TRIES);
    expect(reads(never)).toHaveLength(3);

    const out = server((c) => (c.body ? json(200, QUEUED) : json(401, { error: 'unauthenticated' })));
    expect(await runAgentMontage({ fetch: out.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' }))
      .toEqual({ ok: false, code: 'unauthenticated' });

    const stuck = server((c) => (c.body ? json(200, QUEUED) : json(200, running(40))));
    const k = clock();
    expect(await runAgentMontage({ fetch: stuck.fetch, ...k, onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' }))
      .toEqual({ ok: false, code: 'network' });
    expect(k.now()).toBeGreaterThanOrEqual(FOLLOW_MS);
    expect(reads(stuck).length).toBeLessThanOrEqual(FOLLOW_MS / POLL_MS + 1);
  });
});

test('Stop posts a cancel for the task to the task route', async () => {
  const s = server(() => json(200, { ok: true }));
  expect(await cancelAgentMontage(s.fetch, 'job-1')).toBe(true);
  expect(s.calls).toEqual([{ url: '/api/tasks', body: { action: 'cancel', id: 'job-1' } }]);
  expect(await cancelAgentMontage(server(() => json(409, { ok: false, error: 'not_running' })).fetch, 'job-1')).toBe(false);
  expect(await cancelAgentMontage(async () => { throw new Error('x'); }, 'job-1')).toBe(false);
});

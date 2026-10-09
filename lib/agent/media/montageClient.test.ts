/** @jest-environment node */
/**
 * The studio's calls for Agent G's montage, with a scripted server: uploads, the plan, the run with its progress, a
 * dropped connection followed to the job's end, and Stop.
 */
import { cancelAgentMontage, montageEnabled, quoteAgentMontage, runAgentMontage, POLL_MS, RECOVER_MS } from './montageClient';

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

  test('posts the signed plan once, reports the row\'s progress while it is open, and returns the master', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let polls = 0;
    const s = server(async (c) => {
      if (c.url.startsWith('/api/orchestrator/jobs')) {
        polls += 1;
        if (polls === 2) release();
        return json(200, { jobs: [{ id: 'other', pct: 99 }, { id: 'job-1', status: 'processing', pct: 40 + polls, current_stage: 'stitch' }] });
      }
      await gate;
      return json(200, { ok: true, jobId: 'job-1', videoUrl: 'https://m/out.mp4', durationSec: 19.97, aspect: '16:9', replay: false });
    });
    const progress: Array<[number | null, string | null]> = [];
    const r = await runAgentMontage(
      { fetch: s.fetch, ...clock(), onProgress: (p, st) => progress.push([p, st]) },
      { request: { shots: [1] }, token: 'tok', prompt: 'p', jobId: 'job-1' },
    );
    expect(r).toEqual({ ok: true, videoUrl: 'https://m/out.mp4', durationSec: 19.97, aspect: '16:9' });
    expect(s.calls.filter((c) => c.body?.action === 'run')).toEqual([
      { url: '/api/agent/media/montage', body: { action: 'run', request: { shots: [1] }, token: 'tok', prompt: 'p' } },
    ]);
    expect(progress[0]).toEqual([41, 'stitch']);
    expect(s.calls.find((c) => c.url.startsWith('/api/orchestrator/jobs'))!.url).toBe('/api/orchestrator/jobs?status=active&limit=20');
  });

  test('a refusal comes back with its code (an expired plan, a cancel)', async () => {
    const r = await runAgentMontage(
      { fetch: server(() => json(409, { ok: false, error: 'quote_expired', message: 'm' })).fetch, ...clock(), onProgress: () => {} },
      { request: {}, token: 't', jobId: 'job-1' },
    );
    expect(r).toEqual({ ok: false, code: 'quote_expired' });
  });

  test('a dropped connection is followed on the job row to its end: delivered', async () => {
    let reads = 0;
    const s = server((c) => {
      if (c.body?.action === 'run') return new Response('upstream timeout', { status: 504 });
      reads += 1;
      return json(200, { jobs: [{ id: 'job-1', status: reads < 3 ? 'processing' : 'completed', pct: 80, signed_url: 'https://m/signed.mp4', result: reads < 3 ? null : { videoUrl: 'https://m/out.mp4', durationSec: 12, aspect: '9:16' } }] });
    });
    const r = await runAgentMontage({ fetch: s.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' });
    expect(r).toEqual({ ok: true, videoUrl: 'https://m/out.mp4', durationSec: 12, aspect: '9:16' });
    // Recovery reads every status, not only the active ones: the row it waits for is about to stop being active.
    expect(s.calls.some((c) => c.url === '/api/orchestrator/jobs?limit=20')).toBe(true);
  });

  test('a dropped connection whose job was stopped reads as cancelled; one that never ends gives up as network', async () => {
    const stopped = server((c) => (c.body ? Promise.reject(new Error('reset')) : json(200, { jobs: [{ id: 'job-1', status: 'failed', error: 'cancelled by the user' }] })));
    expect(await runAgentMontage({ fetch: stopped.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' }))
      .toEqual({ ok: false, code: 'cancelled' });
    const lost = server((c) => (c.body ? Promise.reject(new Error('reset')) : json(200, { jobs: [] })));
    const k = clock();
    expect(await runAgentMontage({ fetch: lost.fetch, ...k, onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' }))
      .toEqual({ ok: false, code: 'network' });
    expect(k.now()).toBeGreaterThanOrEqual(RECOVER_MS);
    expect(lost.calls.length).toBeLessThanOrEqual(RECOVER_MS / POLL_MS + 3);
  });
});

test('Stop posts a cancel for the job', async () => {
  const s = server(() => json(200, { ok: true }));
  expect(await cancelAgentMontage(s.fetch, 'job-1')).toBe(true);
  expect(s.calls).toEqual([{ url: '/api/agent/media/montage', body: { action: 'cancel', jobId: 'job-1' } }]);
  expect(await cancelAgentMontage(async () => { throw new Error('x'); }, 'job-1')).toBe(false);
});

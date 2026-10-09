/** @jest-environment node */
/**
 * The studio's calls for Agent G's audio extraction, with a scripted server: the plan for a link and for an uploaded
 * file, a platform refusal that names the platform, the run queued and followed to the MP3 with its progress, a job
 * that ends failed, and Stop. The shared follower's edge cases (lost answers, offline, a job that never ends) are pinned
 * through the montage in ./montageClient.test.ts.
 */
import { audioEnabled, cancelAgentAudio, quoteAudioFile, quoteAudioLink, runAgentAudio } from './audioClient';

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
const QUOTE = { jobId: 'job-1', credits: 0, source: 'link', host: 'media.example.com', name: 'a.mp3', bytes: 1, contentType: 'video/mp4', rights: { status: 'unverified' }, bitrateKbps: 192, maxSec: 3600, expiresAt: 1 };
const clock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; await Promise.resolve(); } };
};

test('enabled only when the route says so', async () => {
  expect(await audioEnabled(server(() => json(200, { enabled: true })).fetch)).toBe(true);
  expect(await audioEnabled(server(() => json(404, {})).fetch)).toBe(false);
  expect(await audioEnabled(async () => { throw new Error('offline'); })).toBe(false);
});

describe('quote', () => {
  test('a link: the plan, with the signed request', async () => {
    const s = server(() => json(200, { ok: true, quote: QUOTE, request: { v: 1 }, token: 'tok' }));
    expect(await quoteAudioLink(s.fetch, 'https://media.example.com/a.mp4')).toEqual({ ok: true, quote: QUOTE, request: { v: 1 }, token: 'tok' });
    expect(s.calls).toEqual([{ url: '/api/agent/media/audio', body: { action: 'quote', url: 'https://media.example.com/a.mp4' } }]);
  });

  test('a platform refusal keeps the platform; closed is "closed"; offline is "network"', async () => {
    expect(await quoteAudioLink(server(() => json(422, { ok: false, error: 'platform', platform: 'YouTube', message: 'm' })).fetch, 'https://youtu.be/x'))
      .toEqual({ ok: false, code: 'platform', platform: 'YouTube' });
    expect(await quoteAudioLink(server(() => json(404, { error: 'not_found' })).fetch, 'https://a.example/a.mp4')).toEqual({ ok: false, code: 'closed' });
    expect(await quoteAudioLink(async () => { throw new Error('x'); }, 'https://a.example/a.mp4')).toEqual({ ok: false, code: 'network' });
  });

  test('a file: uploaded to the user’s storage first, then planned by its path and name; a failed upload asks nothing', async () => {
    const s = server(() => json(200, { ok: true, quote: { ...QUOTE, source: 'file' }, request: {}, token: 't' }));
    const uploads: string[] = [];
    const r = await quoteAudioFile({ fetch: s.fetch, upload: async (d) => { uploads.push(d); return 'omni-uploads/u/1-clip.mov'; } }, { dataUrl: 'blob:x', mimeType: 'video/quicktime', name: 'clip.mov' });
    expect(r.ok).toBe(true);
    expect(uploads).toEqual(['blob:x']);
    expect(s.calls[0]!.body).toEqual({ action: 'quote', file: 'omni-uploads/u/1-clip.mov', name: 'clip.mov' });
    const none = server(() => json(200, {}));
    expect(await quoteAudioFile({ fetch: none.fetch, upload: async () => null }, { dataUrl: 'blob:x', mimeType: 'video/mp4' })).toEqual({ ok: false, code: 'upload_failed' });
    expect(none.calls).toEqual([]);
  });
});

describe('run', () => {
  const QUEUED = { ok: true, jobId: 'job-1', status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false };
  const running = (pct: number, stage: string) => ({ ok: true, jobId: 'job-1', status: 'running', stage, pct, attempt: 1 });
  const DONE = { ok: true, jobId: 'job-1', status: 'completed', audioUrl: 'https://s/a.mp3?token=t', name: 'Concert.mp3', durationSec: 189.5, bytes: 4_546_000, bitrateKbps: 192, rights: { status: 'own' } };

  test('queues once, follows with progress, and returns the MP3 with its name, length and size', async () => {
    const views = [running(10, 'extract'), running(80, 'qc'), DONE];
    const s = server((c) => (c.body ? json(200, QUEUED) : json(200, views.shift())));
    const progress: Array<[number | null, string | null]> = [];
    const r = await runAgentAudio({ fetch: s.fetch, ...clock(), onProgress: (p, st) => progress.push([p, st]) }, { request: { v: 1 }, token: 'tok', jobId: 'job-1' });
    expect(r).toEqual({ ok: true, audioUrl: 'https://s/a.mp3?token=t', name: 'Concert.mp3', durationSec: 189.5, bytes: 4_546_000, bitrateKbps: 192, rights: { status: 'own' } });
    expect(s.calls.filter((c) => c.body)).toEqual([{ url: '/api/agent/media/audio', body: { action: 'run', request: { v: 1 }, token: 'tok' } }]);
    expect(progress).toEqual([[0, 'queued'], [10, 'extract'], [80, 'qc']]);
    expect(s.calls.filter((c) => !c.body).map((c) => c.url)).toEqual(Array(3).fill('/api/agent/media/audio?jobId=job-1'));
  });

  test('a job that ends failed reads as its reason; a refused run as its code', async () => {
    const failed = server((c) => (c.body ? json(200, QUEUED) : json(200, { ok: true, jobId: 'job-1', status: 'failed', error: 'no_audio' })));
    expect(await runAgentAudio({ fetch: failed.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' })).toEqual({ ok: false, code: 'no_audio' });
    const expired = server(() => json(409, { ok: false, error: 'quote_expired', message: 'm' }));
    expect(await runAgentAudio({ fetch: expired.fetch, ...clock(), onProgress: () => {} }, { request: {}, token: 't', jobId: 'job-1' })).toEqual({ ok: false, code: 'quote_expired' });
  });
});

test('Stop posts a cancel for the job', async () => {
  const s = server(() => json(200, { ok: true }));
  expect(await cancelAgentAudio(s.fetch, 'job-1')).toBe(true);
  expect(s.calls).toEqual([{ url: '/api/agent/media/audio', body: { action: 'cancel', jobId: 'job-1' } }]);
});

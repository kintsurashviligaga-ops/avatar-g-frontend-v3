/** @jest-environment node */
/**
 * The MP3 and edit cards taken back after the page went (a reload, a language switch), like the montage
 * (./montageClient.test): the job is followed by its id from the one task route, nothing is sent to the job's own route,
 * and the result comes back in the shape the card puts in its bubble.
 */
import { resumeAgentAudio } from './audioClient';
import { resumeAgentEdit } from './editClient';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const clock = () => { let t = 0; return { now: () => t, sleep: async (ms: number) => { t += ms; await Promise.resolve(); } }; };
const task = (t: Record<string, unknown>) => ({
  ok: true,
  task: { id: 'job-9', kind: 'x', service: 'x', stage: null, pct: null, attempt: 1, result: null, error: null, cancellable: false, createdAt: null, updatedAt: '2026-10-11T10:00:00.000Z', ...t },
});
function server(views: unknown[]) {
  const calls: Array<{ url: string; method?: string }> = [];
  const fetch = async (url: string, init?: RequestInit) => { calls.push({ url, method: init?.method }); return json(200, views.shift()); };
  return { fetch, calls };
}

test('an MP3 card taken back reads its job and gets the MP3 with its name and facts; nothing is posted', async () => {
  const s = server([task({ status: 'running', stage: 'encode', pct: 60 }), task({ status: 'completed', result: { url: 'https://m/a.mp3', media: 'audio', name: 'song.mp3', durationSec: 189, bytes: 4_500_000, bitrateKbps: 192 } })]);
  const r = await resumeAgentAudio({ fetch: s.fetch, ...clock(), onProgress: () => {} }, 'job-9');
  expect(r).toEqual({ ok: true, audioUrl: 'https://m/a.mp3', name: 'song.mp3', durationSec: 189, bytes: 4_500_000, bitrateKbps: 192, rights: null, endedAt: Date.parse('2026-10-11T10:00:00.000Z') });
  expect(s.calls.every((c) => c.method === undefined && c.url === '/api/tasks?id=job-9')).toBe(true);
});

test('an edit card taken back gets its video (or its still) the same way; a stopped one reads cancelled', async () => {
  const s = server([task({ status: 'completed', result: { url: 'https://m/e.mp4', media: 'video', name: 'edit.mp4', durationSec: 9, width: 1080, height: 1920 } })]);
  expect(await resumeAgentEdit({ fetch: s.fetch, ...clock(), onProgress: () => {} }, 'job-9')).toEqual({
    ok: true, output: 'mp4', url: 'https://m/e.mp4', name: 'edit.mp4', durationSec: 9, width: 1080, height: 1920, endedAt: Date.parse('2026-10-11T10:00:00.000Z'),
  });
  expect(s.calls).toHaveLength(1);
  const stopped = server([task({ status: 'cancelled', error: 'cancelled' })]);
  expect(await resumeAgentEdit({ fetch: stopped.fetch, ...clock(), onProgress: () => {} }, 'job-9')).toMatchObject({ ok: false, code: 'cancelled' });
});

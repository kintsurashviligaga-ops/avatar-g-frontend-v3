/** @jest-environment node */
/**
 * The studio's call for Agent G's whole-file analysis, with a scripted server: open or closed for this user, one analysis
 * of an uploaded file or a YouTube link with its answer, each refusal as its code, a long question cut, a dead network.
 */
import { analyzeEnabled, runAnalyze, ANALYZE_ROUTE } from './analyzeClient';

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
const ANALYSIS = { summary: 'A street.', language: 'en', scenes: [], moments: [], transcript: [], speakers: [], objects: [], answer: 'A street at night.', dropped: 0 };
const FILE = { source: { kind: 'file' as const, ref: 'omni-uploads/u1/1-a.mp4' }, focus: 'question' as const, question: 'what is it?', lang: 'en' };

test('open only when the route says so for this user', async () => {
  expect(await analyzeEnabled(server(() => json(200, { enabled: true })).fetch)).toBe(true);
  expect(await analyzeEnabled(server(() => json(200, { enabled: false })).fetch)).toBe(false);
  expect(await analyzeEnabled(server(() => { throw new Error('offline'); }).fetch)).toBe(false);
});

test('one file: the source, the focus, the question and the language go to the route; the answer comes back with its type', async () => {
  const s = server(() => json(200, { ok: true, analysis: ANALYSIS, source: { kind: 'file', type: 'video', durationSec: 75 }, model: 'm' }));
  const r = await runAnalyze(s.fetch, FILE);
  expect(s.calls[0]!.url).toBe(ANALYZE_ROUTE);
  expect(s.calls[0]!.body).toEqual({ source: FILE.source, focus: 'question', question: 'what is it?', lang: 'en' });
  expect(r).toEqual({ ok: true, answer: { analysis: ANALYSIS, type: 'video', durationSec: 75 } });
});

test('a YouTube link has no length: null; a long question is cut to 500 characters', async () => {
  const s = server(() => json(200, { ok: true, analysis: ANALYSIS, source: { kind: 'youtube', type: 'video', durationSec: null } }));
  const r = await runAnalyze(s.fetch, { source: { kind: 'youtube', url: 'https://youtu.be/abc12345678' }, focus: 'moments', question: 'x'.repeat(900), lang: 'ka' });
  expect((s.calls[0]!.body!.question as string).length).toBe(500);
  expect(r.ok && r.answer.durationSec).toBeNull();
});

test.each([
  [401, {}, 'unauthenticated'],
  [404, { error: 'not_found' }, 'closed'],
  [422, { ok: false, error: 'too_long' }, 'too_long'],
  [429, {}, 'rate_limited'],
  [502, { ok: false, error: 'model_failed' }, 'model_failed'],
  [500, 'not json', 'network'],
])('HTTP %s → %s', async (status, body, code) => {
  const r = await runAnalyze(server(() => (typeof body === 'string' ? new Response(body, { status }) : json(status, body))).fetch, FILE);
  expect(r).toEqual({ ok: false, code });
});

test('a dead network is „network", never a thrown error', async () => {
  expect(await runAnalyze(server(() => { throw new Error('offline'); }).fetch, FILE)).toEqual({ ok: false, code: 'network' });
});

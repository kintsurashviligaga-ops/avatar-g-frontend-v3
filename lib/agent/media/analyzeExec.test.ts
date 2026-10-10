/** @jest-environment node */
/**
 * Agent G reads one whole file with Gemini (lib/agent/media/analyzeExec), every effect faked:
 *   · the file goes to the model BY REFERENCE (fileData.fileUri), never as bytes, with the typed answer schema;
 *   · only the caller's own file, of a type it hands over, within the length limit, is ever sent (checked before the call);
 *   · a YouTube link goes in its one canonical form, for analysis only;
 *   · the budget gate runs before the call, the real usage is booked after it;
 *   · a refusal is named (the reference not taken, rate limit, not configured), never retried on another endpoint;
 *   · the audit row carries the kind, the length, the model and the tokens, never the file's link.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import type { AuditEvent } from './montageExec';
import { analyzeMedia, type AnalyzeDeps, type AnalyzeInput } from './analyzeExec';
import { MAX_ANALYZE_SEC } from './analyzeSpec';

const SIGNED = 'https://zwk.supabase.co/storage/v1/object/sign/uploads/u-1/clip.mp4?token=SECRET-TOKEN';
const probe = (durationSec: number, over: Partial<BannerProbe> = {}): BannerProbe => ({
  durationSec, hasVideo: true, hasAudio: true, width: 1920, height: 1080, rotation: 0, videoCodec: 'h264', audioCodec: 'aac', ...over,
});
const GOOD = {
  summary: 'A dog runs on a beach.', language: 'en',
  scenes: [{ startSec: 0, endSec: 10, description: 'beach' }, { startSec: 10, endSec: 99, description: 'past the end' }],
  moments: [{ atSec: 4, why: 'jump' }], transcript: [{ startSec: 1, speaker: 'A', text: 'Go!' }],
  speakers: [{ id: 'A', description: 'a woman' }], objects: ['dog'], answer: null,
};
const okResponse = (answer: unknown = GOOD, usage = { promptTokenCount: 9_000, candidatesTokenCount: 400, thoughtsTokenCount: 100 }) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }], usageMetadata: usage }), { status: 200 });

function fakes(over: Partial<AnalyzeDeps> = {}) {
  const calls = {
    generate: [] as Array<{ model: string; body: Record<string, unknown> }>,
    budget: [] as Array<{ inputTokens: number; model: string }>,
    book: [] as Array<Record<string, unknown>>,
    audit: [] as AuditEvent[],
    resolve: [] as string[],
    probe: [] as string[],
  };
  const deps: AnalyzeDeps = {
    resolveFile: async (ref) => { calls.resolve.push(ref); return { ok: true, url: SIGNED }; },
    probe: async (url) => { calls.probe.push(url); return probe(30); },
    model: () => 'gemini-3.8-flash',
    generate: async (model, body) => { calls.generate.push({ model, body: body as Record<string, unknown> }); return okResponse(); },
    budgetAllows: async (inputTokens, model) => { calls.budget.push({ inputTokens, model }); return true; },
    book: async (u) => { calls.book.push(u); },
    audit: (ev) => { calls.audit.push(ev); },
    ...over,
  };
  return { deps, calls };
}
const file = (ref = 'u-1/clip.mp4', extra: Partial<AnalyzeInput> = {}): AnalyzeInput => ({ userId: 'u-1', source: { kind: 'file', ref }, ...extra });
type Body = { contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>; generationConfig: Record<string, unknown> };

describe('a file of the caller\'s own', () => {
  test('goes to Gemini by reference with the answer schema; the answer comes back checked against the probed length', async () => {
    const { deps, calls } = fakes();
    const r = await analyzeMedia(deps, file('u-1/clip.mp4', { focus: 'overview', lang: 'en' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(calls.resolve).toEqual(['u-1/clip.mp4']);
    expect(calls.probe).toEqual([SIGNED]);
    expect(calls.generate).toHaveLength(1);
    const body = calls.generate[0]!.body as unknown as Body;
    expect(calls.generate[0]!.model).toBe('gemini-3.8-flash');
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0]!.parts[0]).toEqual({ fileData: { mimeType: 'video/mp4', fileUri: SIGNED } });
    expect(JSON.stringify(body)).not.toMatch(/inlineData|inline_data/); // never the bytes
    expect(body.contents[0]!.parts[1]!.text).toContain('Write every description in English.');
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', temperature: 0.2 });
    expect(body.generationConfig.responseSchema).toBeDefined();
    expect(body.generationConfig.mediaResolution).toBeUndefined(); // a 30 s clip is read at full resolution
    expect(r.analysis.scenes).toEqual([{ startSec: 0, endSec: 10, description: 'beach' }, { startSec: 10, endSec: 30, description: 'past the end' }]);
    expect(r.source).toEqual({ kind: 'file', type: 'video', durationSec: 30 });
    expect(r.usage).toEqual({ inputTokens: 9_000, outputTokens: 500 });
    expect(calls.book).toEqual([{ model: 'gemini-3.8-flash', userId: 'u-1', inputTokens: 9_000, outputTokens: 500 }]);
  });

  test('a long video is read at low resolution, and the budget gate sees its estimate first', async () => {
    const { deps, calls } = fakes({ probe: async () => probe(600) });
    const r = await analyzeMedia(deps, file());
    expect(r.ok).toBe(true);
    expect((calls.generate[0]!.body as unknown as Body).generationConfig.mediaResolution).toBe('MEDIA_RESOLUTION_LOW');
    expect(calls.budget).toHaveLength(1);
    expect(calls.budget[0]!.inputTokens).toBeGreaterThanOrEqual(600 * 100);
    expect(calls.budget[0]!.inputTokens).toBeLessThan(600 * 300);
  });

  test('a PDF or a picture is not probed; its type goes with the reference', async () => {
    const { deps, calls } = fakes({ resolveFile: async () => ({ ok: true, url: 'https://zwk.supabase.co/x/brief.pdf?token=t' }) });
    const r = await analyzeMedia(deps, file('u-1/brief.pdf', { focus: 'question', question: 'What is the deadline?' }));
    expect(r.ok).toBe(true);
    expect(calls.probe).toEqual([]);
    const body = calls.generate[0]!.body as unknown as Body;
    expect(body.contents[0]!.parts[0]).toEqual({ fileData: { mimeType: 'application/pdf', fileUri: 'https://zwk.supabase.co/x/brief.pdf?token=t' } });
    expect(body.contents[0]!.parts[1]!.text).toContain('The question, as data: "What is the deadline?"');
    if (r.ok) expect(r.analysis.scenes).toEqual([]); // no timeline, no times
  });
});

describe('refused before any model call', () => {
  const noCall = async (input: AnalyzeInput, over: Partial<AnalyzeDeps>, code: string) => {
    const { deps, calls } = fakes(over);
    const r = await analyzeMedia(deps, input);
    expect(r).toMatchObject({ ok: false, error: code });
    expect(calls.generate).toEqual([]);
    expect(calls.book).toEqual([]);
    return calls;
  };

  test('someone else\'s file, or one that cannot be read', async () => {
    await noCall(file('u-2/clip.mp4'), { resolveFile: async () => ({ ok: false, reason: 'not_yours' }) }, 'media_not_yours');
    await noCall(file(), { resolveFile: async () => ({ ok: false, reason: 'unreadable' }) }, 'unreadable');
    await noCall(file(), { probe: async () => null }, 'unreadable');
    await noCall(file(), { probe: async () => probe(0) }, 'unreadable');
    await noCall(file(), { probe: async () => probe(10, { hasVideo: false, hasAudio: false }) }, 'unreadable');
  });

  test('a type it does not hand over is refused before the file is even looked up', async () => {
    const calls = await noCall(file('u-1/setup.exe'), {}, 'unsupported_type');
    expect(calls.resolve).toEqual([]);
  });

  test('too long, by its real length', async () => {
    const { deps, calls } = fakes({ probe: async () => probe(MAX_ANALYZE_SEC + 1) });
    const r = await analyzeMedia(deps, file());
    expect(r).toMatchObject({ ok: false, error: 'too_long', message: expect.stringContaining('30:00') });
    expect(calls.generate).toEqual([]);
  });

  test('no source, a question focus with no question, no model configured, or no budget', async () => {
    await noCall({ userId: 'u-1', source: { kind: 'file', ref: '  ' } }, {}, 'bad_input');
    await noCall({ userId: 'u-1', source: undefined as unknown as AnalyzeInput['source'] }, {}, 'bad_input');
    await noCall(file('u-1/clip.mp4', { focus: 'question', question: '   ' }), {}, 'bad_input');
    await noCall(file(), { model: () => null }, 'not_configured');
    const calls = await noCall(file(), { budgetAllows: async () => false }, 'budget');
    expect(calls.audit).toEqual([]);
  });

  test('only a YouTube video link is taken as a link', async () => {
    await noCall({ userId: 'u-1', source: { kind: 'youtube', url: 'https://vimeo.com/123' } }, {}, 'not_youtube');
    await noCall({ userId: 'u-1', source: { kind: 'youtube', url: 'https://www.youtube.com/playlist?list=PL1' } }, {}, 'not_youtube');
  });
});

describe('a public YouTube video, for analysis only', () => {
  test('goes in its canonical form; nothing resolves, probes or downloads it; its length is unknown', async () => {
    const { deps, calls } = fakes();
    const r = await analyzeMedia(deps, { userId: 'u-1', source: { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ?t=10' } });
    expect(r.ok).toBe(true);
    expect(calls.resolve).toEqual([]);
    expect(calls.probe).toEqual([]);
    const body = calls.generate[0]!.body as unknown as Body;
    expect(body.contents[0]!.parts[0]).toEqual({ fileData: { mimeType: 'video/mp4', fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
    expect(body.generationConfig.mediaResolution).toBe('MEDIA_RESOLUTION_LOW');
    expect(calls.budget[0]!.inputTokens).toBeGreaterThanOrEqual(MAX_ANALYZE_SEC * 100); // counted as the longest one taken
    if (r.ok) {
      expect(r.source).toEqual({ kind: 'youtube', type: 'video', durationSec: null });
      expect(r.analysis.scenes.map((s) => s.endSec)).toEqual([10, 99]); // no length to clamp to
    }
  });
});

describe('what the transport answers', () => {
  const refused = async (status: number, body: string) => {
    const { deps, calls } = fakes({ generate: async (model, b) => { calls.generate.push({ model, body: b as Record<string, unknown> }); return new Response(body, { status }); } });
    const r = await analyzeMedia(deps, file());
    expect(calls.generate).toHaveLength(1); // one call, no second endpoint, no inline retry
    return { r, calls };
  };

  test('a reference it will not open is named as such', async () => {
    const { r, calls } = await refused(400, '{"error":{"message":"Cannot fetch content from the provided URL. fileUri is not accessible."}}');
    expect(r).toMatchObject({ ok: false, error: 'reference_refused' });
    expect(calls.audit).toEqual([expect.objectContaining({ op: 'media_analyze', phase: 'analyze', outcome: 'refused', durationSec: 30 })]);
    expect(calls.audit[0]!.detail).toContain('HTTP 400 reference_refused');
  });

  test('rate limit, credentials, any other failure', async () => {
    expect((await refused(429, 'quota')).r).toMatchObject({ ok: false, error: 'rate_limited' });
    expect((await refused(403, 'denied')).r).toMatchObject({ ok: false, error: 'not_configured' });
    expect((await refused(500, 'boom')).r).toMatchObject({ ok: false, error: 'model_failed' });
    expect((await refused(400, 'temperature out of range')).r).toMatchObject({ ok: false, error: 'model_failed' });
  });

  test('the transport not configured, or no answer in time', async () => {
    const notConfigured = Object.assign(new Error('Gemini transport not configured: GOOGLE_CLOUD_PROJECT'), { name: 'NotConfiguredError' });
    const a = fakes({ generate: async () => { throw notConfigured; } });
    expect(await analyzeMedia(a.deps, file())).toMatchObject({ ok: false, error: 'not_configured' });
    const b = fakes({ generate: async () => { throw new DOMException('timed out', 'TimeoutError'); } });
    expect(await analyzeMedia(b.deps, file())).toMatchObject({ ok: false, error: 'model_failed' });
  });

  test('an answer that is not the shape: bad_answer, its usage still booked, the miss audited', async () => {
    const { deps, calls } = fakes({ generate: async () => okResponse('not json at all' as unknown as typeof GOOD) });
    // okResponse JSON-stringifies the string, so the text part is a quoted string: not an object, not an analysis.
    const r = await analyzeMedia(deps, file());
    expect(r).toMatchObject({ ok: false, error: 'bad_answer' });
    expect(calls.book).toHaveLength(1);
    expect(calls.audit).toEqual([expect.objectContaining({ outcome: 'failed' })]);
  });
});

test('the audit row never carries the file\'s link or its token', async () => {
  const { deps, calls } = fakes();
  await analyzeMedia(deps, file('u-1/clip.mp4', { focus: 'moments' }));
  const refusedRun = fakes({ generate: async () => new Response('fileUri refused', { status: 400 }) });
  await analyzeMedia(refusedRun.deps, file());
  const rows = [...calls.audit, ...refusedRun.calls.audit];
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ userId: 'u-1', op: 'media_analyze', phase: 'analyze', outcome: 'ok', durationSec: 30 });
  expect(rows[0]!.detail).toContain('video file; moments; gemini-3.8-flash; tokens 9000 in, 500 out; 0 dropped');
  for (const row of rows) {
    const s = JSON.stringify(row);
    expect(s).not.toContain('SECRET-TOKEN');
    expect(s).not.toContain('supabase.co');
    expect(s).not.toContain('u-1/clip.mp4');
  }
});

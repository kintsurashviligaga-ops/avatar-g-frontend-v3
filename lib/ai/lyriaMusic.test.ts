/** @jest-environment node */
/** What googleTransportBlocker answers: null = Vertex can serve. Calls go through global.fetch so each test drives them. */
let mockBlocker: string | null = null;
jest.mock('./google/transport', () => ({
  googleTransportBlocker: jest.fn(() => mockBlocker),
  googleModelFetch: jest.fn((model: string, method: string, init: RequestInit) =>
    global.fetch(`https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/${model}:${method}`, init)),
}));

jest.mock('../services/billing/BillingGuard', () => ({
  canProceed: jest.fn(async () => ({ allowed: true })),
  recordUsage: jest.fn(async () => undefined),
}));
jest.mock('./geminiFallbackReport', () => ({ reportGeminiFallback: jest.fn() }));

import { generateLyriaTrack, hasLyriaProvider, LYRIA_FALLBACK, lyriaModel, lyriaRequest } from './lyriaMusic';
import { reportGeminiFallback } from './geminiFallbackReport';

/**
 * Locks the LIVE-BY-DEFAULT contract: with Vertex AI able to serve, Lyria 3 is the PRIMARY music engine unless
 * LYRIA_ENABLED is explicitly falsy (the kill-switch; with it off, studio music's Auto has no engine at all).
 *
 * ⚠️ THIS FILE USED TO PIN THE OPPOSITE ("OFF when the flag is unset") — and passed, because the test env had no
 * credential, so `hasLyriaProvider()` was false for that reason, not the flag's. The transport is mocked now, so
 * every case below is decided by the flag alone (plus one case for an unconfigured Vertex).
 */
describe('lyriaMusic gating', () => {
  const orig = process.env.LYRIA_ENABLED;
  beforeEach(() => { mockBlocker = null; });
  afterEach(() => { if (orig === undefined) delete process.env.LYRIA_ENABLED; else process.env.LYRIA_ENABLED = orig; });

  it('is ON by default when Vertex can serve and the flag is unset', () => {
    delete process.env.LYRIA_ENABLED;
    expect(hasLyriaProvider()).toBe(true);
  });

  it('stays ON for an empty or truthy flag — only an explicit falsy value kills it', () => {
    for (const v of ['', '1', 'true', 'yes', 'on']) {
      process.env.LYRIA_ENABLED = v;
      expect(hasLyriaProvider()).toBe(true);
    }
  });

  it('is OFF when the kill-switch is set to an explicit falsy value', () => {
    for (const v of ['0', 'false', 'no', 'off', ' OFF ']) {
      process.env.LYRIA_ENABLED = v;
      expect(hasLyriaProvider()).toBe(false);
    }
  });

  it('is OFF when Vertex cannot serve, whatever the flag says (a Developer API key does not count)', () => {
    mockBlocker = 'Vertex AI is not configured';
    for (const v of [undefined, '1']) {
      if (v === undefined) delete process.env.LYRIA_ENABLED; else process.env.LYRIA_ENABLED = v;
      expect(hasLyriaProvider()).toBe(false);
    }
  });

  it('exposes an env-overridable Lyria model default', () => {
    expect(lyriaModel()).toContain('lyria');
  });
});

/**
 * A Lyria miss is the music request's failure (app/api/ai/music, R7: no engine runs behind Lyria), so the fallback
 * report must not claim one. It used to say "falling back to Udio/ElevenLabs/MusicGen" — engines that never run.
 */
describe('a Lyria miss reports no fallback engine', () => {
  const realFetch = global.fetch;
  const report = reportGeminiFallback as jest.Mock;
  beforeEach(() => {
    mockBlocker = null;
    delete process.env.LYRIA_ENABLED;
    report.mockClear();
  });
  afterAll(() => { global.fetch = realFetch; });

  it.each([
    ['an HTTP error', () => Promise.resolve(new Response('busy', { status: 503 }))],
    ['a response with no audio', () => Promise.resolve(new Response(JSON.stringify({ status: 'completed', steps: [] }), { status: 200 }))],
    ['a thrown request', () => Promise.reject(new Error('network down'))],
  ])('%s → null, reported with no fallback engine named', async (_label, answer) => {
    global.fetch = jest.fn(answer) as unknown as typeof fetch;
    await expect(generateLyriaTrack({ prompt: 'a calm piano piece', instrumental: true })).resolves.toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({ leg: 'lyria', fallbackTo: LYRIA_FALLBACK });
    expect(LYRIA_FALLBACK).not.toMatch(/udio|musicgen|elevenlabs/i);
  });
});

describe('lyriaRequest (Music Studio) — controlled provider faults: one call, never a retry, no audio invented', () => {
  const realFetch = global.fetch;
  beforeEach(() => { mockBlocker = null; });
  afterAll(() => { global.fetch = realFetch; });

  it.each([
    ['quota (429 RESOURCE_EXHAUSTED)', () => Promise.resolve(new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 429 })), { reason: 'http', status: 429 }],
    ['unsupported model (404 NOT_FOUND)', () => Promise.resolve(new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 })), { reason: 'http', status: 404 }],
    ['provider unavailable (503)', () => Promise.resolve(new Response('busy', { status: 503 })), { reason: 'http', status: 503 }],
    ['safety rejection (200, blocked prompt, no audio)', () => Promise.resolve(new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })), { reason: 'no_audio' }],
    ['provider timeout', () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })), { reason: 'timeout' }],
    ['network disconnect', () => Promise.reject(new TypeError('fetch failed')), { reason: 'network' }],
  ])('%s', async (_label, answer, expected) => {
    const f = jest.fn(answer);
    global.fetch = f as unknown as typeof fetch;
    const r = await lyriaRequest('calm piano', 'lyria-3-clip-preview', new AbortController().signal);
    expect(r).toMatchObject({ ok: false, ...expected });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('every request goes to Vertex :generateContent, never the Developer API', async () => {
    const f = jest.fn(async () => new Response('busy', { status: 503 }));
    global.fetch = f as unknown as typeof fetch;
    await lyriaRequest('calm piano', 'lyria-3-clip-preview', new AbortController().signal);
    await generateLyriaTrack({ prompt: 'calm piano', instrumental: true });
    const urls = f.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls).toHaveLength(2);
    for (const u of urls) expect(u).toMatch(/aiplatform\.googleapis\.com\/.*lyria-3-clip-preview:generateContent$/);
  });

  it('an unconfigured Vertex never reaches the provider', async () => {
    mockBlocker = 'Vertex AI is not configured';
    const f = jest.fn();
    global.fetch = f as unknown as typeof fetch;
    expect(await lyriaRequest('calm piano', 'lyria-3-clip-preview', new AbortController().signal)).toMatchObject({ ok: false, reason: 'not_configured' });
    await expect(generateLyriaTrack({ prompt: 'calm piano', instrumental: true })).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('an empty prompt never reaches the provider', async () => {
    const f = jest.fn();
    global.fetch = f as unknown as typeof fetch;
    expect(await lyriaRequest('   ', 'lyria-3-clip-preview', new AbortController().signal)).toMatchObject({ ok: false, reason: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
  });
});

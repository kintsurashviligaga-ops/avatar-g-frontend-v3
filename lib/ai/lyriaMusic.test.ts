/** @jest-environment node */
let mockKey = '';
jest.mock('../orchestrator/gemini-guard', () => ({
  ...jest.requireActual('../orchestrator/gemini-guard'),
  resolveGeminiKey: jest.fn(() => mockKey),
}));

jest.mock('../services/billing/BillingGuard', () => ({
  canProceed: jest.fn(async () => ({ allowed: true })),
  recordUsage: jest.fn(async () => undefined),
}));
jest.mock('./geminiFallbackReport', () => ({ reportGeminiFallback: jest.fn() }));

import { generateLyriaTrack, hasLyriaProvider, LYRIA_FALLBACK, lyriaModel } from './lyriaMusic';
import { reportGeminiFallback } from './geminiFallbackReport';

/**
 * Locks the LIVE-BY-DEFAULT contract: with a Gemini key present, Lyria 3 is the PRIMARY music engine unless
 * LYRIA_ENABLED is explicitly falsy (the kill-switch; with it off, studio music's Auto has no engine at all).
 *
 * ⚠️ THIS FILE USED TO PIN THE OPPOSITE ("OFF when the flag is unset") — and passed, because the test env has
 * no Gemini key, so `hasLyriaProvider()` was false for the key's sake, not the flag's. The key is mocked now,
 * so every case below is decided by the flag alone (plus one case for the missing key).
 */
describe('lyriaMusic gating', () => {
  const orig = process.env.LYRIA_ENABLED;
  beforeEach(() => { mockKey = 'test-gemini-key'; });
  afterEach(() => { if (orig === undefined) delete process.env.LYRIA_ENABLED; else process.env.LYRIA_ENABLED = orig; });

  it('is ON by default when a key is present and the flag is unset', () => {
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

  it('is OFF without a Gemini key, whatever the flag says', () => {
    mockKey = '';
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
    mockKey = 'test-gemini-key';
    delete process.env.LYRIA_ENABLED;
    delete process.env.GEMINI_TRANSPORT;
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

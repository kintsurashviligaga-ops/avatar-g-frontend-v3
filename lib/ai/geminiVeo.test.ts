/** @jest-environment node */
jest.mock('./geminiFallbackReport', () => ({ reportGeminiFallback: jest.fn() }));

import { hasGeminiVeoProvider, geminiVeoModel, createGeminiVeoClip, pollGeminiVeoTask } from './geminiVeo';
import { reportGeminiFallback } from './geminiFallbackReport';

/**
 * Locks the LIVE-BY-DEFAULT contract: with a Gemini key present, Veo is the PRIMARY clip engine unless
 * GEMINI_VEO_ENABLED is explicitly disabled (0/false/no/off), which reverts to the Runway→Kling→LTX cascade.
 * (A fake key is stubbed so the flag logic is actually exercised rather than passing vacuously on a keyless env.)
 */
describe('geminiVeo gating', () => {
  const origFlag = process.env.GEMINI_VEO_ENABLED;
  const origKey = process.env.GEMINI_API_KEY;
  beforeEach(() => { process.env.GEMINI_API_KEY = 'test-gemini-key'; });
  afterEach(() => {
    if (origFlag === undefined) delete process.env.GEMINI_VEO_ENABLED; else process.env.GEMINI_VEO_ENABLED = origFlag;
    if (origKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = origKey;
  });

  it('is ON by default (flag unset) when a Gemini key is present', () => {
    delete process.env.GEMINI_VEO_ENABLED;
    expect(hasGeminiVeoProvider()).toBe(true);
  });

  it('is OFF when explicitly disabled — the kill-switch reverts to Runway', () => {
    for (const v of ['0', 'false', 'no', 'off']) {
      process.env.GEMINI_VEO_ENABLED = v;
      expect(hasGeminiVeoProvider()).toBe(false);
    }
  });

  it('stays ON for truthy / empty flag values', () => {
    for (const v of ['1', 'true', 'yes', 'on', '']) {
      process.env.GEMINI_VEO_ENABLED = v;
      expect(hasGeminiVeoProvider()).toBe(true);
    }
  });

  it('is OFF without any Gemini key regardless of the flag', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_VEO_ENABLED;
    expect(hasGeminiVeoProvider()).toBe(false);
  });

  it('exposes an env-overridable Veo model default', () => {
    expect(geminiVeoModel()).toContain('veo');
  });
});

describe('geminiVeo — the key travels ONLY in the x-goog-api-key header', () => {
  const KEY = 'AQ.test-veo-key-0123456789abcdef';
  const OP = 'models/veo-3.1-generate-preview/operations/k3j4h5g6f7d8';
  const ENV_VARS = ['GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_VEO_MODEL'] as const;
  const saved: Record<string, string | undefined> = {};
  const realFetch = global.fetch;
  const fetchMock = jest.fn();
  const reported = reportGeminiFallback as jest.MockedFunction<typeof reportGeminiFallback>;
  type Init = RequestInit & { headers: Record<string, string> };

  beforeEach(() => {
    for (const k of ENV_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.GEMINI_API_KEY = KEY;
    fetchMock.mockReset();
    reported.mockClear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
    for (const k of ENV_VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it('submit: no key in the URL, the key in the header, redirect: manual', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ name: OP }), { status: 200 }));

    expect(await createGeminiVeoClip({ promptText: 'A red kite over a green hill' })).toEqual({ operation: OP });
    const [url, init] = fetchMock.mock.calls[0] as [string, Init];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning');
    expect(url).not.toMatch(/[?&]key=/);
    expect(url).not.toContain(KEY);
    expect(init.method).toBe('POST');
    expect(init.headers['x-goog-api-key']).toBe(KEY);
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.redirect).toBe('manual');
  });

  it('poll: no key in the URL, the key in the header, redirect: manual', async () => {
    const uri = 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri } }] } } }), { status: 200 }));

    expect(await pollGeminiVeoTask(OP)).toEqual({ status: 'succeeded', uri });
    const [url, init] = fetchMock.mock.calls[0] as [string, Init];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/${OP}`);
    expect(url).not.toMatch(/[?&]key=/);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
    expect(init.redirect).toBe('manual');
  });

  it('poll: a redirect is never followed — it reads as still processing', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/x' } }));

    expect(await pollGeminiVeoTask(OP)).toEqual({ status: 'processing', uri: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('submit: an error body or thrown message that echoes the key is reported redacted', async () => {
    fetchMock.mockResolvedValueOnce(new Response(`rejected ${KEY}`, { status: 400 }));
    expect(await createGeminiVeoClip({ promptText: 'x' })).toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError(`Headers.append: "${KEY}" is an invalid header value.`));
    expect(await createGeminiVeoClip({ promptText: 'x' })).toBeNull();

    expect(reported).toHaveBeenCalledTimes(2);
    for (const [args] of reported.mock.calls) {
      expect(args.detail).not.toContain(KEY);
      expect(args.detail).toContain('[redacted]');
    }
  });
});

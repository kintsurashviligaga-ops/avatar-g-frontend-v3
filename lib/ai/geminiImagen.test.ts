/** @jest-environment node */
jest.mock('./geminiFallbackReport', () => ({ reportGeminiFallback: jest.fn() }));

import { mapImagenAspect, geminiImagenModel, hasGeminiImagenProvider, generateImagenImages } from './geminiImagen';
import { reportGeminiFallback } from './geminiFallbackReport';

describe('Imagen 4 — aspect mapping', () => {
  it('passes through the five ratios Imagen actually accepts', () => {
    for (const a of ['1:1', '16:9', '9:16', '4:3', '3:4'] as const) {
      expect(mapImagenAspect(a)).toBe(a);
    }
  });

  it('snaps an unsupported ratio to the nearest supported one instead of a square surprise', () => {
    // The studio offers 4:5 (portrait) and 3:2 (landscape); Imagen accepts neither.
    expect(mapImagenAspect('4:5')).toBe('3:4');
    expect(mapImagenAspect('2:3')).toBe('3:4');
    expect(mapImagenAspect('3:2')).toBe('4:3');
    expect(mapImagenAspect('21:9')).toBe('4:3');
  });

  it('defaults to 1:1 for junk/empty input rather than throwing', () => {
    expect(mapImagenAspect(undefined)).toBe('1:1');
    expect(mapImagenAspect(null)).toBe('1:1');
    expect(mapImagenAspect('nonsense')).toBe('1:1');
  });
});

describe('Imagen 4 — model + kill switch', () => {
  const SAVE = { model: process.env.GEMINI_IMAGEN_MODEL, on: process.env.GEMINI_IMAGEN_ENABLED, key: process.env.GEMINI_API_KEY };
  afterEach(() => {
    process.env.GEMINI_IMAGEN_MODEL = SAVE.model; process.env.GEMINI_IMAGEN_ENABLED = SAVE.on;
    if (SAVE.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = SAVE.key;
  });

  it('defaults to imagen-4.0-generate-001 and is env-overridable', () => {
    delete process.env.GEMINI_IMAGEN_MODEL;
    expect(geminiImagenModel()).toBe('imagen-4.0-generate-001');
    process.env.GEMINI_IMAGEN_MODEL = 'imagen-4.0-fast-generate-001';
    expect(geminiImagenModel()).toBe('imagen-4.0-fast-generate-001');
  });

  it('is available by default with Google credentials and respects the explicit kill switch', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_IMAGEN_ENABLED;
    expect(hasGeminiImagenProvider()).toBe(true);
    process.env.GEMINI_IMAGEN_ENABLED = '1';
    expect(hasGeminiImagenProvider()).toBe(true);
    process.env.GEMINI_IMAGEN_ENABLED = '0';
    expect(hasGeminiImagenProvider()).toBe(false);
  });

  it('is OFF without a key — no key can never mean "try anyway"', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_IMAGEN_ENABLED;
    expect(hasGeminiImagenProvider()).toBe(false);
  });
});

describe('Imagen 4 — the key travels ONLY in the x-goog-api-key header', () => {
  const KEY = 'AQ.test-imagen-key-0123456789abcdef';
  const KEY_VARS = ['GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_IMAGEN_MODEL'] as const;
  const saved: Record<string, string | undefined> = {};
  const realFetch = global.fetch;
  const fetchMock = jest.fn();
  const reported = reportGeminiFallback as jest.MockedFunction<typeof reportGeminiFallback>;

  beforeEach(() => {
    for (const k of KEY_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.GEMINI_API_KEY = KEY;
    fetchMock.mockReset();
    reported.mockClear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
    for (const k of KEY_VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it('POSTs :predict with no key in the URL, the key in the header, and redirect: manual', async () => {
    const png = Buffer.from('fake-png-bytes').toString('base64');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ predictions: [{ bytesBase64Encoded: png, mimeType: 'image/png' }] }), { status: 200 }));

    const out = await generateImagenImages({ prompt: 'a red kite over a green hill' });

    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict');
    expect(url).not.toMatch(/[?&]key=/);
    expect(url).not.toContain(KEY);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.redirect).toBe('manual');
  });

  it('an error body that echoes the key reaches the fallback report redacted', async () => {
    fetchMock.mockResolvedValueOnce(new Response(`bad request for ${KEY}`, { status: 400 }));

    expect(await generateImagenImages({ prompt: 'x' })).toBeNull();
    const { detail, status } = reported.mock.calls[0][0];
    expect(status).toBe(400);
    expect(detail).not.toContain(KEY);
    expect(detail).toContain('[redacted]');
  });

  it('a thrown fetch error that echoes the key reaches the fallback report redacted', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`Headers.append: "${KEY}" is an invalid header value.`));

    expect(await generateImagenImages({ prompt: 'x' })).toBeNull();
    const { detail } = reported.mock.calls[0][0];
    expect(detail).not.toContain(KEY);
    expect(detail).toContain('[redacted]');
  });
});

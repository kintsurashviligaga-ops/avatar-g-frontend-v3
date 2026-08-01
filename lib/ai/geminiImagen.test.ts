/** @jest-environment node */
import { mapImagenAspect, geminiImagenModel, hasGeminiImagenProvider } from './geminiImagen';

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

  it('is OPT-IN — a present-but-unfunded key must not be tried ahead of FLUX/NanoBanana on every render', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_IMAGEN_ENABLED;
    expect(hasGeminiImagenProvider()).toBe(false);
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

/** @jest-environment node */
/**
 * The model registry is what the UI and Agent G see. Brief §5: every model has a Georgian label, a short
 * Georgian description, a tier and a fallback — and only the parameters its documentation allows.
 */
import { MODELS, fallbacksFor, getModel, isModelEnabled, listModels, parseModelInput, publicModel } from './registry';
import { priceFromUsd, samePrice, formatGel } from './pricing';

const GEORGIAN = /[Ⴀ-ჿ]/;

describe('every registered model', () => {
  test.each(MODELS.map((m) => [m.id, m] as const))('%s is complete and Georgian-first', (_id, m) => {
    expect(m.label_ka).toMatch(GEORGIAN);
    expect(m.description_ka).toMatch(GEORGIAN);
    expect(m.description_ka.length).toBeLessThanOrEqual(120);
    expect(['fast', 'standard', 'pro']).toContain(m.tier);
    expect(m.endpoint).toMatch(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/i);
    expect(m.id).toMatch(/^hf\//);
    expect(m.timeoutMs).toBeGreaterThan(0);
  });

  test('ids and endpoints are unique', () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    expect(new Set(MODELS.map((m) => m.endpoint)).size).toBe(MODELS.length);
  });

  test('fallbacks exist and never leave their family (a fallback resubmits the same parameters)', () => {
    for (const m of MODELS) {
      for (const f of m.fallback) {
        const t = getModel(f);
        expect(t).not.toBeNull();
        expect(t!.family).toBe(m.family);
        expect(t!.id).not.toBe(m.id);
      }
    }
    expect(fallbacksFor('hf/kling-3-pro-t2v').map((m) => m.id)).toEqual(['hf/kling-3-std-t2v']);
  });

  test('nothing the catalogue does not sell is registered (Nano Banana, Seedream, GPT Image)', () => {
    const ids = MODELS.map((m) => `${m.id} ${m.endpoint}`).join(' ');
    expect(ids).not.toMatch(/nano|banana|seedream|gpt-image/i);
  });

  test('the public view carries no endpoint and no schema', () => {
    const p = publicModel(MODELS[0]!);
    expect(Object.keys(p)).toEqual(['id', 'service', 'mode', 'label_ka', 'description_ka', 'label_en', 'tier', 'output']);
  });
});

describe('HF_ENABLED_MODELS narrows the set to what the account has', () => {
  const env = { HF_ENABLED_MODELS: 'hf/soul-2, hf/kling-3-std-t2v' } as NodeJS.ProcessEnv;
  test('only listed ids are enabled, and fallbacks respect it', () => {
    expect(listModels({ env }).map((m) => m.id)).toEqual(['hf/soul-2', 'hf/kling-3-std-t2v']);
    expect(isModelEnabled('hf/kling-3-pro-t2v', env)).toBe(false);
    expect(fallbacksFor('hf/kling-3-pro-t2v', { HF_ENABLED_MODELS: 'hf/kling-3-pro-t2v' } as NodeJS.ProcessEnv)).toEqual([]);
  });
  test('unset → everything registered', () => {
    expect(listModels({ env: {} as NodeJS.ProcessEnv })).toHaveLength(MODELS.length);
  });
});

describe('input schemas mirror the documentation', () => {
  const kling = getModel('hf/kling-3-std-t2v')!;
  const seedance = getModel('hf/seedance-2.5-t2v')!;
  const r2v = getModel('hf/seedance-2.5-r2v')!;
  const motion = getModel('hf/kling-3-motion-std')!;

  test('defaults are applied (Kling: 5 s, 16:9, sound on)', () => {
    expect(parseModelInput(kling, { prompt: 'ზღვა' })).toEqual({ ok: true, input: { prompt: 'ზღვა', duration: 5, aspect_ratio: '16:9', sound: 'on' } });
  });

  test('documented bounds are enforced (Kling 3–15 s, Seedance 4–30 s)', () => {
    expect(parseModelInput(kling, { prompt: 'x', duration: 2 }).ok).toBe(false);
    expect(parseModelInput(kling, { prompt: 'x', duration: 16 }).ok).toBe(false);
    expect(parseModelInput(seedance, { prompt: 'x', duration: 3 }).ok).toBe(false);
    expect(parseModelInput(seedance, { prompt: 'x', duration: 30 }).ok).toBe(true);
  });

  test('unknown keys are refused (several endpoints declare additionalProperties: false)', () => {
    const r = parseModelInput(seedance, { prompt: 'x', seed: 1 });
    expect(r.ok).toBe(false);
  });

  test('media must be public https — no http, no private hosts', () => {
    const base = { video_url: 'https://cdn.example.com/v.mp4' };
    expect(parseModelInput(motion, { ...base, image_url: 'https://cdn.example.com/a.jpg' }).ok).toBe(true);
    expect(parseModelInput(motion, { ...base, image_url: 'http://cdn.example.com/a.jpg' }).ok).toBe(false);
    expect(parseModelInput(motion, { ...base, image_url: 'https://169.254.169.254/latest' }).ok).toBe(false);
  });

  test('reference→video needs at least one reference and caps at five', () => {
    expect(parseModelInput(r2v, { prompt: 'x' }).ok).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    expect(parseModelInput(r2v, { image_urls: six }).ok).toBe(false);
    expect(parseModelInput(r2v, { image_urls: six.slice(0, 5) }).ok).toBe(true);
  });
});

describe('pricing: the GEL on the button IS the credits taken', () => {
  const cfg = { gelPerUsd: 2.7, margin: 1.35 };
  test('usd × rate × margin, rounded UP to a whole credit (0.10 ₾)', () => {
    expect(priceFromUsd(0.4, cfg)).toEqual({ credits: 15, gel: 1.5, usd: 0.4 }); // 1.458 ₾ → 15 cr
    expect(priceFromUsd(0.094, cfg)).toEqual({ credits: 4, gel: 0.4, usd: 0.094 }); // 0.3426 ₾ → 4 cr
    expect(priceFromUsd(0, cfg).credits).toBe(1); // never free
  });
  test('an exact multiple does not round up a credit through float noise', () => {
    // 1 × 2.8 × 1.5 = 4.2 ₾ exactly → 42 credits, not 43.
    expect(priceFromUsd(1, { gelPerUsd: 2.8, margin: 1.5 }).credits).toBe(42);
  });
  test('a confirmed price matches only the same credit amount', () => {
    const p = priceFromUsd(0.4, cfg);
    expect(samePrice(1.5, p)).toBe(true);
    expect(samePrice(1.4, p)).toBe(false);
    expect(samePrice(Number.NaN, p)).toBe(false);
  });
  test('the button label', () => {
    expect(formatGel(4.2)).toBe('4.20 ₾');
  });
});

/** @jest-environment node */
/**
 * The model registry is what the UI and Agent G see. Brief §5: every model has a Georgian label, a short
 * Georgian description, a tier and a fallback — and only the parameters its documentation allows.
 *
 * MyAvatar v32 (lib/providers/policy): Higgsfield is not a permitted provider. The registry stays so old jobs remain
 * readable (names, schemas, endpoints), but no model in it is enabled — no env (HF_ENABLED_MODELS included) can turn
 * one on — and the catalogue no longer offers its rows (they survive as legacy definitions only).
 */
import { MODELS, fallbacksFor, getModel, isModelEnabled, listModels, parseModelInput, publicModel } from './registry';
import { priceFromUsd, samePrice, formatGel } from './pricing';
import { CATALOGUE, catalogueEntry, legacyCatalogueDefinition } from './catalogue';
import { describeInput } from './paramSpec';

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
    expect(getModel('hf/kling-3-pro-t2v')!.fallback).toEqual(['hf/kling-3-std-t2v']); // declared…
    expect(fallbacksFor('hf/kling-3-pro-t2v')).toEqual([]); // …but never enabled under v32, so nothing can stand in
  });

  test('nothing the catalogue does not sell is registered (Nano Banana, Seedream, GPT Image)', () => {
    const ids = MODELS.map((m) => `${m.id} ${m.endpoint}`).join(' ');
    expect(ids).not.toMatch(/nano|banana|seedream|gpt-image/i);
  });

  test('the public view carries no endpoint and no schema — only a plain form description', () => {
    const p = publicModel(MODELS[0]!);
    expect(Object.keys(p)).toEqual(['id', 'service', 'mode', 'label_ka', 'description_ka', 'label_en', 'tier', 'output', 'params', 'requireOneOf']);
    for (const m of MODELS) {
      const json = JSON.stringify(publicModel(m));
      expect(json).not.toContain(m.endpoint);
      expect(json).not.toMatch(/_def|ZodObject/);
    }
  });

  test('reference→video says which references satisfy "at least one"', () => {
    expect(publicModel(getModel('hf/seedance-2.5-r2v')!).requireOneOf).toEqual(['image_urls', 'audio_urls']);
    expect(publicModel(getModel('hf/kling-3-std-t2v')!).requireOneOf).toEqual([]);
  });
});

describe('HF_ENABLED_MODELS cannot weaken the v32 allowlist', () => {
  const env = { HF_ENABLED_MODELS: 'hf/soul-2, hf/kling-3-std-t2v' } as NodeJS.ProcessEnv;
  test('a listed id is still not enabled, and no fallback is offered', () => {
    expect(listModels({ env })).toEqual([]);
    expect(isModelEnabled('hf/soul-2', env)).toBe(false);
    expect(isModelEnabled('hf/kling-3-std-t2v', env)).toBe(false);
    expect(fallbacksFor('hf/kling-3-pro-t2v', { HF_ENABLED_MODELS: 'hf/kling-3-pro-t2v,hf/kling-3-std-t2v' } as NodeJS.ProcessEnv)).toEqual([]);
  });
  test('unset → nothing enabled (it used to mean "everything registered")', () => {
    expect(listModels({ env: {} as NodeJS.ProcessEnv })).toEqual([]);
    for (const m of MODELS) expect(isModelEnabled(m.id, {} as NodeJS.ProcessEnv)).toBe(false);
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

describe('the registry and the catalogue are one list (lib/providers/catalogue — what every picker shows)', () => {
  const CYRILLIC = /[Ѐ-ӿ]/;

  test.each(MODELS.map((m) => [m.id, m] as const))(
    '%s (legacy) is named in ka / en / ru with a "best for" line, and the registry says the catalogue\'s words',
    (_id, m) => {
      expect(catalogueEntry(m.id)).toBeNull(); // not offered under v32…
      const c = legacyCatalogueDefinition(m.id)!; // …but its definition still names old jobs
      expect(c).not.toBeNull();
      expect(c.label.ka).toMatch(GEORGIAN);
      expect(c.label.ru).toMatch(CYRILLIC);
      expect(c.label.en.trim().length).toBeGreaterThan(3);
      expect(c.bestFor.ka).toMatch(GEORGIAN);
      expect(c.bestFor.ru).toMatch(CYRILLIC);
      expect(c.bestFor.en.trim().length).toBeGreaterThan(5);
      // One set of names: the registry (Agent G, Studio β's list) copies them from the catalogue.
      expect([m.label_ka, m.description_ka, m.label_en]).toEqual([c.label.ka, c.bestFor.ka, c.label.en]);
      expect(c.service).toBe(m.service);
      expect(c.tier).toBe(m.tier);
      expect(c.provider).toBe('higgsfield');
      expect(c.wire.runner).toBe('studio');
    },
  );

  test('the catalogue offers no Studio β row; every registered model keeps its legacy Studio β definition', () => {
    expect(CATALOGUE.filter((e) => e.wire.runner === 'studio')).toEqual([]);
    for (const m of MODELS) expect(legacyCatalogueDefinition(m.id)!.wire.runner).toBe('studio');
  });

  test('where a fact comes from is the same in both: a page read ↔ "docs", a sibling\'s page ↔ "family", unread ↔ "unverified"', () => {
    const as = { page: 'docs', family: 'family', unverified: 'unverified' } as const;
    for (const m of MODELS) expect(legacyCatalogueDefinition(m.id)!.verified).toBe(as[m.schema]);
    // Read 2026-10-02: the Pro siblings are verified by their own pages now.
    for (const id of ['hf/kling-3-pro-t2v', 'hf/kling-3-pro-i2v', 'hf/kling-3-motion-pro']) expect(getModel(id)!.schema).toBe('page');
  });

  test.each(MODELS.map((m) => [m.id, m] as const))('%s: the capabilities the picker states ARE its schema\'s', (_id, m) => {
    const caps = legacyCatalogueDefinition(m.id)!.caps;
    const specs = describeInput(m.input);
    const spec = (k: string) => specs.find((p) => p.key === k);
    const media = specs.filter((p) => p.kind === 'media' || p.kind === 'mediaList');
    const requiredMedia = media.filter((p) => p.required || (m.requireOneOf ?? []).includes(p.key));
    // t2v: words alone are enough — a prompt and no media the request cannot run without.
    expect(caps.fromText).toBe(!!spec('prompt') && requiredMedia.length === 0);
    // i2v: it takes a picture.
    expect(caps.fromImage).toBe(media.some((p) => p.media === 'image'));
    // references: how many pictures one list takes (a single first frame is not a reference set).
    const imageList = media.find((p) => p.kind === 'mediaList' && p.media === 'image');
    expect(caps.references).toBe(imageList?.max ?? 0);
    // max duration: the schema's own bound where it has one.
    const duration = spec('duration');
    if (duration) expect(caps.maxDurationSec).toBe(duration.max);
    // aspect ratios: the schema's options, in its order; none = it keeps the source's shape.
    expect([...caps.aspectRatios]).toEqual(spec('aspect_ratio')?.options ?? []);
    // needs: a source video for motion transfer.
    expect(!!caps.needs?.includes('video')).toBe(media.some((p) => p.media === 'video' && p.required));
  });

  test('⚠️ a model whose schema nobody read is OFF unless HF_ENABLED_MODELS names it — never because the list is unset', () => {
    // No such model ships today; the gate is the one isModelEnabled applies, pinned through the catalogue's own rule.
    expect(MODELS.filter((m) => m.schema === 'unverified')).toEqual([]);
    expect(isModelEnabled('hf/nope', {} as NodeJS.ProcessEnv)).toBe(false);
    expect(isModelEnabled('nb/pro', {} as NodeJS.ProcessEnv)).toBe(false); // a catalogue id that is not a Higgsfield model
    expect(isModelEnabled('google/veo-3.1', {} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('SOUL V2 takes the shape and the size its page documents — nothing else', () => {
  const soul = getModel('hf/soul-2')!;
  test('the provider\'s own defaults apply (1:1, 720p): a bare prompt renders what it always did', () => {
    expect(parseModelInput(soul, { prompt: 'პორტრეტი' })).toEqual({ ok: true, input: { prompt: 'პორტრეტი', aspect_ratio: '1:1', resolution: '720p' } });
    expect(parseModelInput(soul, { prompt: 'x', aspect_ratio: '9:16', resolution: '1080p' }).ok).toBe(true);
  });
  test('undocumented values and the fields we deliberately leave out are refused', () => {
    expect(parseModelInput(soul, { prompt: 'x', aspect_ratio: '21:9' }).ok).toBe(false);
    expect(parseModelInput(soul, { prompt: 'x', resolution: '4k' }).ok).toBe(false);
    expect(parseModelInput(soul, { prompt: 'x', batch_size: 4 }).ok).toBe(false); // four images is a different price
    expect(parseModelInput(soul, { prompt: 'x', custom_reference_id: '00000000-0000-4000-8000-000000000000' }).ok).toBe(false);
  });
});

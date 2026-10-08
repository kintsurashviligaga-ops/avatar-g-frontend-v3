/** @jest-environment node */
/**
 * lib/studio/imageCreate.ts — what the Create screen says about the image route must BE what the route does.
 *
 * The screen quotes a price, names an engine per size and limits the reference pictures. Each of those is read off
 * app/api/nanobanana/image/route.ts here (its source text, so no provider and no network is touched): when the route
 * changes and this module does not, a test fails instead of the Generate button promising something the bill disagrees with.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creditCostFor } from '@/lib/credits/pricing';
import { quoteCredits } from '@/lib/credits/quote';
import { geminiImageForEndpoint } from '@/lib/ai/geminiImage';
import { catalogueEntry, catalogueFor, imageEndpointFor } from '@/lib/providers/catalogue';
import { isProviderPermitted } from '@/lib/providers/policy';
import {
  IMAGE_MAX_REFERENCES, IMAGE_TIERS, IMG_ASPECTS, IMG_COUNTS, IMG_QUALITIES, IMG_STYLES,
  imageCredits, imageModelFor, imageStyleSlug, imageStyleSwatch, imageVariant, nativeQuality, tierFor, tierModelLabel,
} from './imageCreate';

const route = readFileSync(join(process.cwd(), 'app/api/nanobanana/image/route.ts'), 'utf8');

describe('the price', () => {
  test('is the quote — creditCostFor("image") per image, ×N for a batch — and the same at every size', () => {
    for (const n of IMG_COUNTS) {
      expect(imageCredits(n)).toBe(quoteCredits({ tool: 'image', count: n }));
      expect(imageCredits(n)).toBe(creditCostFor('image') * n);
    }
    expect(imageCredits(1)).toBeGreaterThan(0);
  });

  test('the route charges creditCostFor("image") up front, with no per-size price, so the button cannot disagree', () => {
    expect(route).toMatch(/deductCredits\(rUser\.id, creditCostFor\('image'\), reserveRef\)/);
    expect(route).toMatch(/refundCredits\(reservedUid, creditCostFor\('image'\)/);
    // No size-dependent charge anywhere in the route: `creditCostFor` is only ever asked for the image kind, with no options.
    const asks = [...route.matchAll(/creditCostFor\(([^)]*)\)/g)].map((m) => m[1]);
    expect(asks.length).toBeGreaterThan(0);
    expect(new Set(asks)).toEqual(new Set(["'image'"]));
  });
});

describe('the engine', () => {
  test('v32: one size — every model and every requested size renders on Google Imagen at 1K, resolved from the catalogue', () => {
    const auto = catalogueEntry('nb/auto')!;
    // The panel offers ONE size (standard · 1K); Auto still names its old 1K endpoint for it.
    expect(Object.fromEntries(IMAGE_TIERS.map((t) => [t.quality, imageEndpointFor(auto, t.quality)]))).toEqual({ standard: 'v2-1k' });
    for (const t of IMAGE_TIERS) expect(imageVariant('nb/auto', t.quality).endpoint).toBe(t.endpoint);
    expect(IMAGE_TIERS.map((t) => t.family)).toEqual(['Imagen']);
    // A legacy 2K/4K ask resolves to the one size there is — the label never promises a size the route does not render.
    expect(tierFor('ultra')).toBe(IMAGE_TIERS[0]);
    expect(tierModelLabel(tierFor('ultra'))).toBe('Imagen · 1K');
    // Whatever endpoint id the catalogue hands the route, the Google leg renders it as Imagen 1K.
    const endpoints = catalogueFor('image').flatMap((e) => (e.wire.runner === 'image' ? Object.values(e.wire.endpoints) : []));
    expect(endpoints.length).toBeGreaterThan(0);
    for (const e of endpoints) expect(geminiImageForEndpoint(e!).imageSize).toBe('1K');
    expect(route).not.toMatch(/QUALITY_ENDPOINT/);
    expect(route).toMatch(/const endpoint {4}= pick\.endpoint;/);
    expect(route).toMatch(/imageEndpointFor\(entry, quality\)/);
    expect(route).toMatch(/geminiImageForEndpoint\(endpoint\)/);
  });

  test('the sizes the panel offers are exactly the sizes the engine has', () => {
    expect(IMG_QUALITIES.map(([q, label]) => [q, label])).toEqual(IMAGE_TIERS.map((t) => [t.quality, t.res]));
  });

  test('the models a user can pick are the catalogue\'s Google image rows; each one is 1K standard; the reseller and backup legs are closed by policy', () => {
    const rows = catalogueFor('image').filter((e) => e.wire.runner === 'image');
    expect(rows.map((e) => e.id)).toEqual(['nb/auto', 'nb/v2', 'nb/pro']);
    for (const e of rows) expect(isProviderPermitted(e.provider, 'image')).toBe(true);
    // Any requested size on any model is the one native size: standard, 1K.
    for (const id of ['nb/auto', 'nb/v2', 'nb/pro']) {
      for (const q of ['standard', 'high', 'ultra']) {
        const v = imageVariant(id, q);
        expect([v.quality, v.res, v.family]).toEqual(['standard', '1K', 'Imagen']);
      }
      expect(imageVariant(id, 'standard').native).toBe(true);
      expect(nativeQuality(id, 'standard')).toBe('standard');
    }
    expect(['standard', 'high', 'ultra'].map((q) => imageVariant('nb/v2', q).endpoint)).toEqual(['v2-1k', 'v2-1k', 'v2-1k']);
    // A Studio β model, an unknown id, nothing: the image tool runs Auto — it never sends what its route cannot run.
    expect(imageModelFor('hf/soul-2').id).toBe('nb/auto');
    expect(imageModelFor('nope').id).toBe('nb/auto');
    expect(imageModelFor(null).id).toBe('nb/auto');
    // The price does not depend on the model: one image's quote at every model and size (the route's only charge).
    expect(imageCredits(1)).toBe(creditCostFor('image'));
    // The NanoBanana reseller, Grok and FLUX legs are still in the source, but each is gated on the v32 policy — which
    // refuses all three — so no request can reach them (and an edit never could).
    expect(route).toMatch(/isProviderPermitted\('nanobanana', 'image'\) && !backupB64/);
    expect(route).toMatch(/isProviderPermitted\('xai', 'image'\) && !providerUrl/);
    expect(route).toMatch(/isProviderPermitted\('replicate', 'image'\) && !providerUrl/);
    for (const p of ['nanobanana', 'xai', 'replicate']) expect(isProviderPermitted(p, 'image')).toBe(false);
  });
});

describe('the reference picture', () => {
  test('v32: Imagen has no edit adapter yet, so the limit is ZERO — the route refuses a referenceImage before any charge', () => {
    expect(IMAGE_MAX_REFERENCES).toBe(0);
    for (const e of catalogueFor('image').filter((r) => r.wire.runner === 'image')) {
      expect(e.caps.references).toBe(0);
      expect(e.caps.fromImage).toBe(false);
    }
    // The body still TYPES one string (old clients send it) — never an array…
    expect(route).toMatch(/referenceImage\?: string;/);
    expect(route).not.toMatch(/body\.referenceImages|referenceImage\?: string\[\]/);
    // …and a request that carries one is answered 503 image_edit_unavailable BEFORE the ledger is touched.
    const refusal = route.indexOf('if (refGiven || !hasGeminiImagenProvider())');
    expect(refusal).toBeGreaterThan(-1);
    expect(route.slice(refusal, refusal + 400)).toMatch(/image_edit_unavailable[\s\S]*status: 503/);
    expect(refusal).toBeLessThan(route.indexOf("deductCredits(rUser.id, creditCostFor('image')"));
  });
});

describe('the option lists', () => {
  test('v32: the ratios are the five native Imagen ones (the catalogue lists them); styles and counts are unchanged', () => {
    expect(IMG_ASPECTS).toHaveLength(5);
    expect(new Set(IMG_ASPECTS).size).toBe(5);
    expect(IMG_ASPECTS[0]).toBe('1:1');
    expect([...IMG_ASPECTS]).toEqual([...catalogueEntry('nb/auto')!.caps.aspectRatios]);
    expect(IMG_STYLES).toHaveLength(13);
    expect(IMG_STYLES[0]).toBe('Auto');
    expect([...IMG_COUNTS]).toEqual([1, 2, 4]);
  });
});

describe('the style swatches (site imagery v2)', () => {
  test('every style but Auto has its swatch on disk; Auto and anything unknown have none', () => {
    for (const s of IMG_STYLES) {
      const swatch = imageStyleSwatch(s);
      if (s === 'Auto') { expect(swatch).toBeNull(); continue; }
      expect(swatch).toBe(`/styles/image/${imageStyleSlug(s)}.jpg`);
      expect(existsSync(join(process.cwd(), 'public', swatch!))).toBe(true);
    }
    for (const bad of ['', 'Nope', 'constructor', '../x']) expect(imageStyleSwatch(bad)).toBeNull();
  });
  test('the slug is the file name: lowercase, dashes, nothing else', () => {
    expect(imageStyleSlug('Digital Art')).toBe('digital-art');
    expect(imageStyleSlug('3D Render')).toBe('3d-render');
    expect(new Set(IMG_STYLES.map(imageStyleSlug)).size).toBe(IMG_STYLES.length);
  });
});

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
import { catalogueEntry, catalogueFor, imageEndpointFor } from '@/lib/providers/catalogue';
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
  test('Auto runs each size on the endpoint the route always used — the route resolves it from the catalogue, nowhere else', () => {
    const auto = catalogueEntry('nb/auto')!;
    expect(Object.fromEntries(IMAGE_TIERS.map((t) => [t.quality, imageEndpointFor(auto, t.quality)]))).toEqual({ standard: 'v2-1k', high: 'v2-2k', ultra: 'pro-4k' });
    for (const t of IMAGE_TIERS) expect(imageVariant('nb/auto', t.quality).endpoint).toBe(t.endpoint);
    // The V2 family up to 2K, Pro at 4K — the label the picker prints.
    expect(IMAGE_TIERS.map((t) => t.family)).toEqual(['V2', 'V2', 'Pro']);
    expect(tierModelLabel(tierFor('ultra'))).toBe('Nano Banana Pro · 4K');
    expect(route).not.toMatch(/QUALITY_ENDPOINT/);
    expect(route).toMatch(/const endpoint {4}= pick\.endpoint;/);
    expect(route).toMatch(/imageEndpointFor\(entry, quality\)/);
  });

  test('the sizes the panel offers are exactly the sizes the engine has', () => {
    expect(IMG_QUALITIES.map(([q, label]) => [q, label])).toEqual(IMAGE_TIERS.map((t) => [t.quality, t.res]));
  });

  test('the models a user can pick are the catalogue\'s image-route rows; V2 and Pro pin the family, Pro starts at 2K', () => {
    expect(catalogueFor('image').filter((e) => e.wire.runner === 'image').map((e) => e.id)).toEqual(['nb/auto', 'nb/v2', 'nb/pro']);
    expect(['standard', 'high', 'ultra'].map((q) => imageVariant('nb/v2', q).endpoint)).toEqual(['v2-1k', 'v2-2k', 'v2-4k']);
    expect(['high', 'ultra'].map((q) => imageVariant('nb/pro', q).endpoint)).toEqual(['pro-1k2k', 'pro-4k']);
    expect(imageVariant('nb/pro', 'high').res).toBe('2K'); // pro-1k2k renders 2K (lib/nanobanana/client extractResolution)
    expect(imageVariant('nb/pro', 'standard').native).toBe(false);
    expect(nativeQuality('nb/pro', 'standard')).toBe('high');
    expect(nativeQuality('nb/v2', 'standard')).toBe('standard');
    // A Studio β model, an unknown id, nothing: the image tool runs Auto — it never sends what its route cannot run.
    expect(imageModelFor('hf/soul-2').id).toBe('nb/auto');
    expect(imageModelFor('nope').id).toBe('nb/auto');
    expect(imageModelFor(null).id).toBe('nb/auto');
    // The price does not depend on the model: one image's quote at every model and size (the route's only charge).
    expect(imageCredits(1)).toBe(creditCostFor('image'));
    // The backup legs are real in the route (and prompt-only: an edit never reaches them).
    expect(route).toMatch(/generateGrokImage\(finalPrompt\)/);
    expect(route).toMatch(/generateFluxProImage\(finalPrompt/);
    expect(route).toMatch(/!providerUrl && !referenceImageUrl/);
  });
});

describe('the reference picture', () => {
  test('the route reads ONE referenceImage (a string), so the limit is one — never an array', () => {
    expect(IMAGE_MAX_REFERENCES).toBe(1);
    expect(route).toMatch(/referenceImage\?: string;/);
    expect(route).not.toMatch(/referenceImages|referenceImage\?: string\[\]/);
  });
});

describe('the option lists', () => {
  test('ratios, sizes, styles and counts are what the studio has always offered (the templates reference them)', () => {
    expect(IMG_ASPECTS).toHaveLength(10);
    expect(new Set(IMG_ASPECTS).size).toBe(10);
    expect(IMG_ASPECTS[0]).toBe('1:1');
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

/** @jest-environment node */
/**
 * lib/studio/imageCreate.ts — what the Create screen says about the image route must BE what the route does.
 *
 * The screen quotes a price, names the engine and limits the reference pictures. Each of those is read off
 * app/api/nanobanana/image/route.ts here (its source text, so no provider and no network is touched): when the route
 * changes and this module does not, a test fails instead of the Generate button promising something the bill disagrees with.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creditCostFor } from '@/lib/credits/pricing';
import { quoteCredits } from '@/lib/credits/quote';
import { RETIRED_IMAGE_MODEL_IDS, catalogueEntry, catalogueFor, imageEndpointFor } from '@/lib/providers/catalogue';
import {
  IMAGE_MAX_REFERENCES, IMG_ASPECTS, IMG_COUNTS, IMG_QUALITIES, IMG_STYLES,
  imageCredits, imageModelFor, imageStyleSlug, imageStyleSwatch,
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
  test('each quality a request carries is filed under the endpoint the route always used — resolved from the catalogue only', () => {
    const row = catalogueEntry('nb/auto')!;
    expect(Object.fromEntries(IMG_QUALITIES.map(([q]) => [q, imageEndpointFor(row, q)]))).toEqual({ standard: 'v2-1k', high: 'v2-2k', ultra: 'pro-4k' });
    expect(route).not.toMatch(/QUALITY_ENDPOINT/);
    expect(route).toMatch(/const endpoint {4}= pick\.endpoint;/);
    expect(route).toMatch(/imageEndpointFor\(entry, quality\)/);
  });

  test('⚠️ the render takes no size, which is why no screen offers one (GG 2026-10-23, "Hide") — a size reaching it fails here', () => {
    const at = route.indexOf('generateGeminiImage({');
    const call = route.slice(at, route.indexOf('})', at));
    expect(call).toMatch(/prompt: finalPrompt/);
    expect(call).toMatch(/aspectRatio:/);
    expect(call).not.toMatch(/quality|endpoint|imageSize|resolution|\bsize\b/i);
  });

  test('the one model a user can pick is the catalogue\'s Google row; a retired Nano Banana V2 / Pro id resolves to it', () => {
    expect(catalogueFor('image').filter((e) => e.wire.runner === 'image').map((e) => e.id)).toEqual(['nb/auto']);
    for (const id of RETIRED_IMAGE_MODEL_IDS) expect(imageModelFor(id).id).toBe('nb/auto');
    // A Studio β model, an unknown id, nothing: the image tool runs the Google row — it never sends what its route cannot run.
    expect(imageModelFor('hf/soul-2').id).toBe('nb/auto');
    expect(imageModelFor('nope').id).toBe('nb/auto');
    expect(imageModelFor(null).id).toBe('nb/auto');
    // The price is one image's quote whatever the request carries (the route's only charge).
    expect(imageCredits(1)).toBe(creditCostFor('image'));
    // ⚠️ Google's image model is the route's ONE engine (MASTER TASK v3.1; PROJECT_MASTER R7, no silent fallback): the
    // NanoBanana leg and the Grok (xAI) and FLUX 1.1 Pro (Replicate) legs that stood behind it are gone, whatever
    // MEDIA_GOOGLE_ONLY says. The request's quality still chooses the endpoint the reply and the double-click key name.
    expect(route).not.toMatch(/generateGrokImage|generateFluxProImage|@\/lib\/ai\/xaiImage|@\/lib\/ai\/fluxImage/);
    expect(route).not.toMatch(/generateNanoBananaImage|@\/lib\/nanobanana\/client|isMediaGoogleOnly/);
    expect(route.match(/\bgenerateGeminiImage\(/g)).toHaveLength(1);
  });
});

describe('the reference picture', () => {
  test('the route reads ONE referenceImage (a string), so the limit is one — never an array', () => {
    expect(IMAGE_MAX_REFERENCES).toBe(1);
    expect(route).toMatch(/referenceImage\?: string;/);
    // (`referenceImages: [referenceImageUrl]` is the Google image call under MEDIA_GOOGLE_ONLY: still the one picture.)
    expect(route).not.toMatch(/body\.referenceImages|referenceImages\?: |referenceImage\?: string\[\]/);
  });
});

describe('the option lists', () => {
  test('ratios, styles and counts are what the studio has always offered; the qualities are what a template may set', () => {
    expect(IMG_ASPECTS).toHaveLength(10);
    expect(new Set(IMG_ASPECTS).size).toBe(10);
    expect(IMG_ASPECTS[0]).toBe('1:1');
    expect(IMG_STYLES).toHaveLength(13);
    expect(IMG_STYLES[0]).toBe('Auto');
    expect([...IMG_COUNTS]).toEqual([1, 2, 4]);
    expect(IMG_QUALITIES.map(([q]) => q)).toEqual(['standard', 'high', 'ultra']);
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

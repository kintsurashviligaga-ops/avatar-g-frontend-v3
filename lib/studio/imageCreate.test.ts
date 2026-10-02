/** @jest-environment node */
/**
 * lib/studio/imageCreate.ts — what the Create screen says about the image route must BE what the route does.
 *
 * The screen quotes a price, names an engine per size and limits the reference pictures. Each of those is read off
 * app/api/nanobanana/image/route.ts here (its source text, so no provider and no network is touched): when the route
 * changes and this module does not, a test fails instead of the Generate button promising something the bill disagrees with.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creditCostFor } from '@/lib/credits/pricing';
import { quoteCredits } from '@/lib/credits/quote';
import {
  IMAGE_ENGINES, IMAGE_MAX_REFERENCES, IMAGE_TIERS, IMG_ASPECTS, IMG_COUNTS, IMG_QUALITIES, IMG_STYLES,
  engineFor, imageCredits, tierFor, tierModelLabel,
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
  test('each size runs on the NanoBanana endpoint the route maps it to', () => {
    const block = /const QUALITY_ENDPOINT[^{]*\{([\s\S]*?)\};/.exec(route)?.[1] ?? '';
    const mapped = Object.fromEntries([...block.matchAll(/(\w+):\s*'([\w-]+)'/g)].map((m) => [m[1], m[2]]));
    expect(mapped).toEqual({ standard: 'v2-1k', high: 'v2-2k', ultra: 'pro-4k' });
    for (const t of IMAGE_TIERS) expect(mapped[t.quality]).toBe(t.endpoint);
    // The V2 family up to 2K, Pro at 4K — the label the picker prints.
    expect(IMAGE_TIERS.map((t) => t.family)).toEqual(['V2', 'V2', 'Pro']);
    expect(tierModelLabel(tierFor('ultra'))).toBe('Nano Banana Pro · 4K');
  });

  test('the sizes the panel offers are exactly the sizes the engine has', () => {
    expect(IMG_QUALITIES.map(([q, label]) => [q, label])).toEqual(IMAGE_TIERS.map((t) => [t.quality, t.res]));
  });

  test('the only engine a user can pick is Auto — the route has no engine switch — and it is priced from the quote', () => {
    expect(IMAGE_ENGINES.map((e) => e.id)).toEqual(['auto']);
    expect(engineFor('auto').perImage()).toBe(creditCostFor('image'));
    // An unknown id never leaves the picker empty.
    expect(engineFor('nope').id).toBe('auto');
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

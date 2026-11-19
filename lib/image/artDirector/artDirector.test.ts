/** @jest-environment node */
jest.mock('server-only', () => ({}));
import sharp from 'sharp';
import {
  ART_RATIOS, MAX_REFERENCES, nearestRatio, artDirectorAllowed, artDirectorAudience,
  imageCredits, quoteArt, sizesFor, IMAGE_COST_USD, REF_INPUT_USD, V8_IMAGE_CREDITS,
  composeArtPrompt, buildArtBody, imageFromResponse, runGrid, detectEditIntent,
  ArtRequestSchema, artWarnings, artLibraryMeta, downloadName, artLabel, STYLE_PRESETS,
} from './index';
import { toRaw, normaliseMask, maskGuide, pasteBack, unmaskedDigest, extendCanvas, maskCoverage } from './mask';
import { PRICE_BOOK } from '@/lib/credits/priceBook';

describe('spec: what the model supports', () => {
  it('offers exactly the 14 ratios of gemini-3.1-flash-image, incl. 1:4 4:1 1:8 8:1', () => {
    expect(ART_RATIOS).toHaveLength(14);
    expect(new Set(ART_RATIOS).size).toBe(14);
    for (const r of ['1:4', '4:1', '1:8', '8:1', '21:9', '9:16']) expect(ART_RATIOS).toContain(r);
  });
  it('allows up to 14 references', () => expect(MAX_REFERENCES).toBe(14));
  it('snaps a picture to its nearest listed ratio', () => {
    expect(nearestRatio(1080, 1920)).toBe('9:16');
    expect(nearestRatio(800, 6400)).toBe('1:8');
    expect(nearestRatio(4000, 1000)).toBe('4:1');
    expect(nearestRatio(500, 500)).toBe('1:1');
  });
  it('names no Imagen model anywhere', () => {
    expect(JSON.stringify(STYLE_PRESETS)).not.toMatch(/imagen/i);
  });
});

describe('flag IMAGE_ART_DIRECTOR', () => {
  it('is off unless said in words', () => {
    for (const v of [undefined, '', '1', 'true', 'on']) expect(artDirectorAudience({ IMAGE_ART_DIRECTOR: v })).toBe('off');
    expect(artDirectorAllowed(true, {})).toBe(false);
    expect(artDirectorAllowed(true, { IMAGE_ART_DIRECTOR: 'admin' })).toBe(true);
    expect(artDirectorAllowed(false, { IMAGE_ART_DIRECTOR: 'admin' })).toBe(false);
    expect(artDirectorAllowed(false, { IMAGE_ART_DIRECTOR: 'everyone' })).toBe(true);
  });
});

describe('price (65 % engine, GG approved 2026-11-15: 1K ✦8, 2K ✦12, 4K ✦17)', () => {
  it('v8 book', () => {
    expect(V8_IMAGE_CREDITS).toEqual({ '1K': 8, '2K': 12, '4K': 17 });
    expect(imageCredits({ size: '4K', references: 0, book: 'v8' })).toBe(17);
    expect(quoteArt({ size: '1K', references: 0, book: 'v8', count: 4 })).toEqual({ perImage: 8, count: 4, total: 32 });
  });
  it('today book sells only 1K at PRICE_BOOK.image, so 2K/4K chips are hidden', () => {
    expect(imageCredits({ size: '1K', references: 3, book: 'today' })).toBe(PRICE_BOOK.image);
    expect(imageCredits({ size: '2K', references: 0, book: 'today' })).toBeNull();
    expect(sizesFor('today')).toEqual(['1K']);
    expect(sizesFor('v8')).toEqual(['1K', '2K', '4K']);
  });
  it('hands the margin gate the full cost incl. every reference, and the gate may only raise', () => {
    const seen: number[] = [];
    const gate = (c: number, cost: number) => { seen.push(cost); return { credits: Math.max(c, 9), raised: c < 9 }; };
    expect(imageCredits({ size: '1K', references: 14, book: 'v8' }, gate)).toBe(9);
    expect(seen[0]).toBeCloseTo(IMAGE_COST_USD['1K'] + 14 * REF_INPUT_USD, 10);
  });
});

describe('prompt + body: multi-reference', () => {
  const refs = [
    { role: 'face' as const, locked: true },
    { role: 'outfit' as const, note: 'only the leather jacket' },
    { role: 'style' as const },
  ];
  it('maps "face from A, outfit from B, style from C" in attachment order', () => {
    const t = composeArtPrompt({ operation: 'generate', prompt: 'ქალი თბილისის ქუჩაში', references: refs, styleId: 'cinematic', avoid: ['blurry', 'extra fingers'] });
    expect(t).toContain('Image A — use its face and facial identity.');
    expect(t).toContain('Image B — use its outfit and clothing (only the leather jacket).');
    expect(t).toContain('Image C — use its art style');
    expect(t).toContain('Keep the same person exactly as in Image A');
    expect(t).toContain('ქალი თბილისის ქუჩაში'); // Georgian prompt sent as written
    expect(t).toMatch(/Style: cinematic film still/);
    expect(t.trim().split('\n').pop()).toBe('Avoid: blurry; extra fingers.');
  });
  it('builds a Vertex body with 14 references, ratio, size and seed', () => {
    const pic = { mimeType: 'image/png' as const, data: 'AAAA' };
    const body = buildArtBody({ text: 'x', references: Array(14).fill(pic), aspectRatio: '1:8', size: '4K', seed: 42 }) as unknown as { contents: Array<{ parts: Array<{ inlineData?: { data: string }; text?: string }> }>; generationConfig: unknown };
    expect(body.contents[0].parts).toHaveLength(15);
    expect(body.contents[0].parts[14]).toEqual({ text: 'x' });
    expect(body.generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:8', imageSize: '4K' }, seed: 42 });
  });
  it('refuses a 15th reference, an unknown ratio and a mask without a base', () => {
    const pic = { mimeType: 'image/png' as const, data: 'A' };
    expect(() => buildArtBody({ text: 'x', references: Array(15).fill(pic), aspectRatio: '1:1', size: '1K' })).toThrow(/14/);
    expect(() => buildArtBody({ text: 'x', references: [], aspectRatio: '7:3' as unknown as '1:1', size: '1K' })).toThrow(/ratio/);
    expect(() => buildArtBody({ text: 'x', references: [], mask: pic, aspectRatio: '1:1', size: '1K' })).toThrow(/base/);
  });
  it('mask edit puts base, then mask guide, then references', () => {
    const b = { mimeType: 'image/png' as const, data: 'BASE' }, m = { mimeType: 'image/png' as const, data: 'MASK' }, r = { mimeType: 'image/png' as const, data: 'REF' };
    const body = buildArtBody({ text: 't', base: b, mask: m, references: [r], aspectRatio: '1:1', size: '1K' }) as unknown as { contents: Array<{ parts: Array<{ inlineData?: { data: string }; text?: string }> }>; generationConfig: unknown };
    expect(body.contents[0].parts.map((p) => p.inlineData?.data ?? 'TEXT')).toEqual(['BASE', 'MASK', 'REF', 'TEXT']);
    const t = composeArtPrompt({ operation: 'mask_edit', prompt: 'make her jacket red', references: [{ role: 'color' }], hasBase: true });
    expect(t).toMatch(/change ONLY the area painted in solid red/);
    expect(t).toContain('Image A — use its colour palette.');
  });
  it('reads the image out of an answer, null on a safety block', () => {
    expect(imageFromResponse({ candidates: [{ content: { parts: [{ text: 'hi' }, { inlineData: { mimeType: 'image/png', data: 'Z' } }] } }] })?.data).toBe('Z');
    expect(imageFromResponse({ candidates: [{ finishReason: 'SAFETY' }] })).toBeNull();
  });
  it('warns (never refuses) above 5 people', () => {
    expect(artWarnings({ references: Array(6).fill({ path: 'a', role: 'face' }) })).toEqual(['identity_limit']);
    expect(artWarnings({ references: Array(14).fill({ path: 'a', role: 'object' }) })).toEqual([]);
  });
});

describe('request schema', () => {
  const ok = { v: 1, operation: 'generate', prompt: 'a cat', references: [], aspectRatio: '1:1', size: '1K', count: 4, locale: 'ka' };
  it('accepts a 4-grid and fills defaults', () => {
    const r = ArtRequestSchema.parse(ok);
    expect(r.keepRest).toBe(true);
    expect(r.avoid).toEqual([]);
  });
  it('refuses 3 images, 15 references, URL references, an edit grid and a 1K upscale', () => {
    expect(ArtRequestSchema.safeParse({ ...ok, count: 3 }).success).toBe(false);
    expect(ArtRequestSchema.safeParse({ ...ok, references: Array.from({ length: 15 }, (_, i) => ({ path: `u/${i}.png`, role: 'object' })) }).success).toBe(false);
    expect(ArtRequestSchema.safeParse({ ...ok, references: [{ path: 'https://evil/x.png', role: 'face' }] }).success).toBe(false);
    expect(ArtRequestSchema.safeParse({ ...ok, operation: 'mask_edit', basePath: 'u/a.png', maskPath: 'u/m.png', count: 4 }).success).toBe(false);
    expect(ArtRequestSchema.safeParse({ ...ok, operation: 'upscale', basePath: 'u/a.png', count: 1, prompt: '' }).success).toBe(false);
    expect(ArtRequestSchema.safeParse({ ...ok, operation: 'upscale', basePath: 'u/a.png', count: 1, prompt: '', size: '4K' }).success).toBe(true);
    expect(ArtRequestSchema.safeParse({ ...ok, operation: 'mask_edit', basePath: 'u/a.png', count: 1 }).success).toBe(false);
  });
});

describe('variation grid (mocked)', () => {
  const deps = (fail: number[] = [], chargeFails: number[] = [], deliverFails: number[] = []) => {
    const log: string[] = [];
    let running = 0, peak = 0;
    return {
      log, peak: () => peak,
      d: {
        hold: jest.fn(async (t: number) => { log.push(`hold ${t}`); return true; }),
        render: jest.fn(async (i: number) => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; return fail.includes(i) ? null : `img${i}`; }),
        charge: jest.fn(async (i: number, c: number) => { log.push(`charge ${i} ${c}`); return !chargeFails.includes(i); }),
        refund: jest.fn(async (i: number, c: number) => { log.push(`refund ${i} ${c}`); }),
        deliver: jest.fn(async (i: number) => { if (deliverFails.includes(i)) throw new Error('x'); }),
      },
    };
  };
  it('4 at 1K: holds ✦32, charges ✦8 per delivered image, max 2 at once', async () => {
    const t = deps();
    const r = await runGrid(4, 8, t.d);
    expect(t.log[0]).toBe('hold 32');
    expect(r.charged).toBe(32);
    expect(r.slots.map((s) => s.result)).toEqual(['img0', 'img1', 'img2', 'img3']);
    expect(t.peak()).toBe(2);
  });
  it('a failed image is never charged', async () => {
    const t = deps([1, 3]);
    const r = await runGrid(4, 12, t.d);
    expect(r.charged).toBe(24);
    expect(t.d.charge).not.toHaveBeenCalledWith(1, 12);
    expect(r.slots[1]).toMatchObject({ status: 'failed', error: 'no_image', charged: 0 });
  });
  it('a charged image that cannot be saved is refunded', async () => {
    const t = deps([], [], [2]);
    const r = await runGrid(4, 17, t.d);
    expect(r.refunded).toBe(17);
    expect(t.log).toContain('refund 2 17');
    expect(r.slots[2]).toMatchObject({ status: 'failed', error: 'save_failed' });
  });
  it('nothing starts when the balance cannot hold the total', async () => {
    const t = deps();
    t.d.hold.mockResolvedValueOnce(false);
    const r = await runGrid(2, 8, t.d);
    expect(r.started).toBe(false);
    expect(t.d.render).not.toHaveBeenCalled();
  });
  it('rejects 3', async () => { await expect(runGrid(3, 8, deps().d)).rejects.toThrow(); });
});

describe('conversational edit intent', () => {
  it.each([
    ['Make her jacket red', 'edit'],
    ['Remove the tree in the background', 'remove'],
    ['Change the background to the sea', 'background'],
    ['remove the tree', 'remove'],
    ['ქურთუკი წითელი გახადე', 'edit'],
    ['ხე მოაშორე', 'remove'],
    ['ფონი შეცვალე ზღვით', 'background'],
    ['убери дерево', 'remove'],
    ['გააუმჯობესე 4K-ში', 'upscale'],
    ['make it wider, zoom out', 'extend'],
  ])('%s → %s', (text, kind) => expect(detectEditIntent(text, true)?.kind).toBe(kind));
  it('a new picture or a thread with no image is not an edit', () => {
    expect(detectEditIntent('draw a man and add a hat', true)).toBeNull();
    expect(detectEditIntent('დახატე კატა', true)).toBeNull();
    expect(detectEditIntent('make her jacket red', false)).toBeNull();
    expect(detectEditIntent('a sunset over Tbilisi', true)).toBeNull();
  });
});

describe('inpainting: brush mask + server paste-back (real pixels, sharp)', () => {
  const W = 64, H = 48;
  const solid = (r: number, g: number, b: number, w = W, h = H) => sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
  const gradient = async () => {
    const data = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; data[i] = x * 4; data[i + 1] = y * 5; data[i + 2] = 128; data[i + 3] = 255; }
    return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  };
  // Brush painted at the canvas size the browser shows (128×96), white on transparent, a box in the middle.
  const brush = async () => {
    const w = 128, h = 96, data = Buffer.alloc(w * h * 4);
    for (let y = 32; y < 64; y++) for (let x = 40; x < 88; x++) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255; }
    return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  };

  it('keeps every pixel outside the brush byte-identical, even when the model changed them', async () => {
    const original = await toRaw(await gradient());
    const mask = (await normaliseMask(await brush(), W, H))!;
    expect(mask).not.toBeNull();
    expect(maskCoverage(mask)).toBeCloseTo((24 * 16) / (W * H), 2);
    // The "model" returned a whole new red picture at a different size (4K-ish answer to a 1K base).
    const edited = await solid(255, 0, 0, 256, 192);
    const out = await pasteBack(original, edited, mask);
    expect(unmaskedDigest(out, mask)).toBe(unmaskedDigest(original, mask));
    // Inside the brush the edit landed.
    const inside = (24 * W + 32) * 4;
    expect([out.data[inside], out.data[inside + 1], out.data[inside + 2]]).toEqual([255, 0, 0]);
    // Outside: original.
    expect(out.data.subarray(0, 4)).toEqual(original.data.subarray(0, 4));
  });

  it('the guide picture paints the region solid red and nothing else', async () => {
    const original = await toRaw(await gradient());
    const mask = (await normaliseMask(await brush(), W, H))!;
    const guide = await toRaw(await maskGuide(original, mask));
    expect(unmaskedDigest(guide, mask)).toBe(unmaskedDigest(original, mask));
    const i = (24 * W + 32) * 4;
    expect([guide.data[i], guide.data[i + 1], guide.data[i + 2]]).toEqual([255, 0, 0]);
  });

  it('an empty brush is not a region edit', async () => {
    const empty = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    expect(await normaliseMask(empty, W, H)).toBeNull();
  });

  it('extend (outpaint) centres the original on a 16:9 canvas and masks only the new area', async () => {
    const original = await toRaw(await solid(10, 20, 30, 100, 100));
    const { canvas, mask, left, top } = await extendCanvas(original, '16:9');
    expect(canvas.height).toBe(100);
    expect(canvas.width).toBe(178);
    expect(top).toBe(0);
    expect(left).toBe(39);
    expect(mask.data[50 * 178 + 0]).toBe(255);
    expect(mask.data[50 * 178 + 100]).toBe(0);
    await expect(extendCanvas(original, '1:1')).rejects.toThrow(/already/);
  });

  it('extend caps the canvas at 4096 px', async () => {
    const original = await toRaw(await solid(1, 2, 3, 2000, 2000));
    const { canvas } = await extendCanvas(original, '8:1');
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(4096);
    expect(canvas.width / canvas.height).toBeGreaterThan(7.5);
  });
});

describe('Library metadata + labels', () => {
  it('saves the full recipe with letters and the mask proof', () => {
    const m = artLibraryMeta({
      operation: 'mask_edit', prompt: 'p', finalPrompt: 'fp', styleId: 'anime', avoid: ['text'], aspectRatio: '3:4', size: '2K', seed: 7,
      references: [{ role: 'face', path: 'u/a.png', locked: true }, { role: 'outfit', path: 'u/b.png' }],
      parentId: 'img_1', gridId: null, gridIndex: null, credits: 12, width: 1536, height: 2048, unmaskedDigest: 'd', now: new Date('2026-11-15T06:00:00Z'),
    });
    expect(m).toMatchObject({ model: 'gemini-3.1-flash-image', seedBestEffort: true, credits: 12, createdAt: '2026-11-15T06:00:00.000Z' });
    expect(m.references.map((r) => r.letter + r.role + r.locked)).toEqual(['Afacetrue', 'Boutfitfalse']);
  });
  it('download names', () => expect(downloadName('ab/../c', '4K', 'jpg')).toBe('myavatar-abc-4k.jpg'));
  it("uses GG's upscale wording", () => {
    expect(artLabel('upscale', 'ka')).toBe('გაუმჯობესება (ხელახლა დახატვა)');
    expect(artLabel('upscale', 'en')).toBe('Upscale (Re-render)');
    expect(artLabel('upscaleTip', 'en')).toBe('Re-renders the image at a higher resolution for more detail.');
  });
});

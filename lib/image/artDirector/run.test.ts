/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any -- mocked Vertex bodies are inspected loosely */
jest.mock('server-only', () => ({}));
import sharp from 'sharp';
import { runArt, type ArtRunDeps } from './run';
import { ArtRequestSchema } from './request';
import { toRaw, unmaskedDigest, normaliseMask } from './mask';

const png = (w: number, h: number, rgb: [number, number, number]) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha: 1 } } }).png().toBuffer();
const answer = (b: Buffer) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: b.toString('base64') } }] } }] });

function deps(files: Record<string, Buffer>, gen: (body: any, n: number) => Promise<unknown>) {
  let n = 0, id = 0;
  const calls = { bodies: [] as any[], charges: [] as Array<[number, string]>, refunds: [] as Array<[number, string]>, saved: [] as string[], recorded: [] as any[] };
  const d: ArtRunDeps = {
    load: async (p) => { const f = files[p]; if (!f) { const { ArtError } = await import('./errors'); throw new ArtError('not_found', 'x', 404); } return f; },
    generate: async (body) => { calls.bodies.push(body); return gen(body, n++); },
    hold: async () => true,
    charge: async (_u, c, ref) => { calls.charges.push([c, ref]); return true; },
    refund: async (_u, c, ref) => { calls.refunds.push([c, ref]); },
    save: async (_u, i) => { calls.saved.push(i); return { path: `art-director/u1/${i}.png`, url: `https://x/${i}` }; },
    record: async (_u, _i, _url, meta) => { calls.recorded.push(meta); },
    newId: () => `id${id++}`,
    now: () => new Date('2026-11-15T07:00:00Z'),
  };
  return { d, calls };
}
const req = (x: Record<string, unknown>) => ArtRequestSchema.parse({ v: 1, operation: 'generate', prompt: 'p', references: [], aspectRatio: '1:1', size: '1K', count: 1, locale: 'ka', ...x });

describe('runArt — grid (mocked Vertex)', () => {
  it('4 images at 2K: 4 calls with imageSize 2K, ✦12 each, distinct seeds, all in the Library', async () => {
    const img = await png(32, 32, [0, 128, 0]);
    const { d, calls } = deps({}, async () => answer(img));
    const r = await runArt(d, 'u1', req({ count: 4, size: '2K', seed: 100 }), 12);
    expect(calls.bodies).toHaveLength(4);
    expect(calls.bodies.every((b) => b.generationConfig.imageConfig.imageSize === '2K')).toBe(true);
    expect(calls.bodies.map((b) => b.generationConfig.seed).sort()).toEqual([100, 101, 102, 103]);
    expect(r.charged).toBe(48);
    expect(calls.charges.map((c) => c[1])).toEqual(expect.arrayContaining([`art:${r.gridId}:0`, `art:${r.gridId}:3`]));
    expect(calls.recorded).toHaveLength(4);
    expect(r.slots.every((s) => s.status === 'done' && s.url)).toBe(true);
  });
  it('a safety-blocked tile is not charged and is reported failed', async () => {
    const img = await png(8, 8, [1, 1, 1]);
    const { d, calls } = deps({}, async (_b, n) => (n === 1 ? { candidates: [{ finishReason: 'SAFETY' }] } : answer(img)));
    const r = await runArt(d, 'u1', req({ count: 2 }), 8);
    expect(r.charged).toBe(8);
    expect(calls.charges).toHaveLength(1);
    expect(r.slots.filter((s) => s.status === 'failed')).toHaveLength(1);
  });
});

describe('runArt — multi-reference (mocked)', () => {
  it('sends 14 normalised references after the text map, refuses one the user does not own', async () => {
    const files: Record<string, Buffer> = {};
    for (let i = 0; i < 14; i++) files[`u1/ref${i}.png`] = await png(3000, 2000, [i * 10, 0, 0]);
    const img = await png(8, 8, [9, 9, 9]);
    const { d, calls } = deps(files, async () => answer(img));
    const references = Object.keys(files).map((path, i) => ({ path, role: i === 0 ? 'face' : i === 1 ? 'outfit' : i === 2 ? 'style' : 'object' }));
    const r = await runArt(d, 'u1', req({ references, prompt: 'face from A, outfit from B, style from C' }), 8);
    expect(r.slots[0]?.status).toBe('done');
    const parts = calls.bodies[0].contents[0].parts;
    expect(parts).toHaveLength(15);
    const text: string = parts[14].text;
    expect(text).toContain('Image A — use its face');
    expect(text).toContain('Image N — use its this object');
    const first = await sharp(Buffer.from(parts[0].inlineData.data, 'base64')).metadata();
    expect(Math.max(first.width!, first.height!)).toBe(1536);
    expect(r.slots[0]?.meta?.references.map((x) => x.letter).join('')).toBe('ABCDEFGHIJKLMN');

    const bad = deps({}, async () => answer(img));
    await expect(runArt(bad.d, 'u1', req({ references: [{ path: 'u2/theirs.png', role: 'face' }] }), 8)).rejects.toMatchObject({ code: 'not_found' });
    expect(bad.calls.bodies).toHaveLength(0);
  });
});

describe('runArt — inpainting (mocked Vertex, real pixels)', () => {
  it('"make her jacket red" with a brush: only the brushed area changes, the rest is byte-identical, ✦8', async () => {
    const W = 40, H = 30;
    const data = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { data[i * 4] = i % 251; data[i * 4 + 1] = (i * 7) % 253; data[i * 4 + 2] = 77; data[i * 4 + 3] = 255; }
    const base = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const bm = Buffer.alloc(W * H * 4);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 30; x++) { const i = (y * W + x) * 4; bm[i] = bm[i + 1] = bm[i + 2] = bm[i + 3] = 255; }
    const brush = await sharp(bm, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    // The model repaints EVERYTHING red (worst case), at a different size.
    const modelOut = await png(80, 60, [255, 0, 0]);
    const { d, calls } = deps({ 'u1/base.png': base, 'u1/brush.png': brush }, async () => answer(modelOut));
    const r = await runArt(d, 'u1', req({ operation: 'mask_edit', basePath: 'u1/base.png', maskPath: 'u1/brush.png', prompt: 'make her jacket red' }), 8);
    const parts = calls.bodies[0].contents[0].parts;
    expect(parts).toHaveLength(3); // base, red guide, text
    expect(parts[2].text).toMatch(/change ONLY the area painted in solid red/);
    const outBytes = (await sharp(Buffer.from(parts[0].inlineData.data, 'base64')).raw().toBuffer());
    expect(outBytes.length).toBe(W * H * 4);
    const mask = (await normaliseMask(brush, W, H))!;
    const orig = await toRaw(base);
    expect(r.slots[0]?.meta?.unmaskedDigest).toBe(unmaskedDigest(orig, mask));
    expect(r.charged).toBe(8);
  });
  it('an empty brush refuses before any call or charge', async () => {
    const base = await png(10, 10, [5, 5, 5]);
    const empty = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const { d, calls } = deps({ 'u1/b.png': base, 'u1/m.png': empty }, async () => answer(base));
    await expect(runArt(d, 'u1', req({ operation: 'mask_edit', basePath: 'u1/b.png', maskPath: 'u1/m.png', prompt: 'x' }), 8)).rejects.toMatchObject({ code: 'empty_mask' });
    expect(calls.bodies).toHaveLength(0);
    expect(calls.charges).toHaveLength(0);
  });
  it('upscale re-renders at 4K with the image as the only picture', async () => {
    const base = await png(64, 64, [3, 3, 3]);
    const { d, calls } = deps({ 'u1/b.png': base }, async () => answer(base));
    await runArt(d, 'u1', req({ operation: 'upscale', basePath: 'u1/b.png', prompt: '', size: '4K' }), 17);
    const b = calls.bodies[0];
    expect(b.generationConfig.imageConfig.imageSize).toBe('4K');
    expect(b.contents[0].parts).toHaveLength(2);
    expect(b.contents[0].parts[1].text).toMatch(/^Re-render the first picture at a higher resolution/);
  });
  it('not enough credits: nothing is called', async () => {
    const { d, calls } = deps({}, async () => ({}));
    d.hold = async () => false;
    await expect(runArt(d, 'u1', req({ count: 4 }), 8)).rejects.toMatchObject({ code: 'insufficient_credits' });
    expect(calls.bodies).toHaveLength(0);
  });
});

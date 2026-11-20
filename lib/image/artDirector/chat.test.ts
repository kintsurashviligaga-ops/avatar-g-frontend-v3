/** @jest-environment node */
import { artChatClientOn, lastArtBase, planArtChat, ratioInText, sizeInText, type ArtChatState } from './chat';
import { ArtRequestSchema } from './request';
import { artResultId, isArtLibraryMeta, recipeRows, artLibraryMeta } from './library';
import type { ArtSize } from './spec';

const TODAY: ArtSize[] = ['1K'];
const V8: ArtSize[] = ['1K', '2K', '4K'];
const base = { path: 'art-director/u/1.png', width: 1024, height: 1024 };
const plan = (text: string, opts: { base?: typeof base | null; sizes?: ArtSize[]; count?: number; aspect?: string } = {}) =>
  planArtChat({ text, base: opts.base === undefined ? base : opts.base, settings: { aspectRatio: opts.aspect ?? '1:1', count: opts.count ?? 4, avoid: '' }, locale: 'ka', sizes: opts.sizes ?? V8 });
const run = (p: ReturnType<typeof plan>) => { if (p.kind !== 'run') throw new Error('not run'); return p; };

describe('chat planner (conversational edits)', () => {
  it('client switch: only admin / everyone', () => {
    expect(artChatClientOn('admin')).toBe(true);
    expect(artChatClientOn('everyone')).toBe(true);
    expect(artChatClientOn('1')).toBe(false);
    expect(artChatClientOn(undefined)).toBe(false);
  });

  it('a new line with no Art Director picture → a grid of the chat count, at its ratio, 1K', () => {
    const p = run(plan('a red fox in snow', { base: null, aspect: '9:16' }));
    expect(p.intent).toBe('generate');
    expect(p.request).toMatchObject({ operation: 'generate', count: 4, aspectRatio: '9:16', size: '1K' });
    expect(ArtRequestSchema.safeParse(p.request).success).toBe(true);
  });

  it('"Make her jacket red" after a picture → one edit of THAT picture', () => {
    const p = run(plan('Make her jacket red'));
    expect(p.request).toMatchObject({ operation: 'edit', basePath: base.path, count: 1, prompt: 'Make her jacket red' });
    expect(ArtRequestSchema.safeParse(p.request).success).toBe(true);
  });

  it('Georgian / Russian edits and "remove the tree in the background"', () => {
    expect(run(plan('ქურთუკი წითელი გახადე')).request.operation).toBe('edit');
    expect(run(plan('убери дерево')).intent).toBe('remove');
    expect(run(plan('Remove the tree in the background')).intent).toBe('remove');
  });

  it('upscale: 2K by default, 4K when named; not sold in today\'s book', () => {
    expect(run(plan('upscale')).request).toMatchObject({ operation: 'upscale', size: '2K', basePath: base.path, count: 1 });
    expect(run(plan('upscale to 4K')).request.size).toBe('4K');
    expect(plan('upscale', { sizes: TODAY })).toEqual({ kind: 'not_sold', size: '2K' });
    expect(ArtRequestSchema.safeParse(run(plan('გააუმჯობესე')).request).success).toBe(true);
  });

  it('"a castle at dusk in 4K" names a size, it is not an upscale of the last picture', () => {
    const p = run(plan('a castle at dusk in 4K, cinematic light'));
    expect(p.intent).toBe('generate');
    expect(p.request.size).toBe('4K');
    expect(p.request.basePath).toBeUndefined();
  });

  it('extend: one step wider, or the ratio named', () => {
    expect(run(plan('make it wider')).request).toMatchObject({ operation: 'extend', aspectRatio: '16:9' });
    expect(run(plan('extend to 21:9')).request.aspectRatio).toBe('21:9');
    expect(run(plan('extend', { base: { path: base.path, width: 768, height: 1344 } })).request.aspectRatio).toBe('1:1');
    expect(ArtRequestSchema.safeParse(run(plan('extend to 21:9')).request).success).toBe(true);
  });

  it('vary keeps the chat count; a "draw …" line is a new picture even after one', () => {
    expect(run(plan('another version', { count: 2 })).request).toMatchObject({ operation: 'vary', count: 2 });
    expect(run(plan('draw a man and add a hat')).intent).toBe('generate');
  });

  it('ratio and size words', () => {
    expect(ratioInText('a poster 1:4 tall')).toBe('1:4');
    expect(ratioInText('7:3')).toBeNull();
    expect(sizeInText('in 2K')).toBe('2K');
    expect(sizeInText('plain')).toBeNull();
  });

  it('lastArtBase: the newest delivered tile', () => {
    const s = (path?: string): ArtChatState => ({ request: run(plan('x', { base: null })).request, tiles: [{ index: 0, status: path ? 'done' : 'failed', ...(path ? { path, width: 10, height: 20 } : {}) }] });
    expect(lastArtBase([s('a'), undefined, s(), s('b')])).toEqual({ path: 'b', width: 10, height: 20 });
    expect(lastArtBase([s(), undefined])).toBeNull();
  });
});

describe('Library recipe helpers', () => {
  const uid = '11111111-2222-4333-8444-555555555555';
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  it('artResultId: only this user\'s own result PNG', () => {
    expect(artResultId(`art-director/${uid}/${id}.png`, uid)).toBe(id);
    expect(artResultId(`art-director/${uid}/${id}.json`, uid)).toBeNull();
    expect(artResultId(`art-director/99999999-2222-4333-8444-555555555555/${id}.png`, uid)).toBeNull();
    expect(artResultId(`art-director/${uid}/../x/${id}.png`, uid)).toBeNull();
    expect(artResultId(`${uid}/${id}.png`, uid)).toBeNull();
    expect(artResultId(`art-director/${uid}/${id}.png`, 'not-a-uuid')).toBeNull();
  });

  it('recipe rows: prompt, model, frame, references by letter, seed best effort, price, mask proof', () => {
    const meta = artLibraryMeta({
      operation: 'mask_edit', prompt: 'red jacket', finalPrompt: 'f', styleId: 'cinematic', avoid: ['text'], aspectRatio: '4:5', size: '2K',
      seed: 42, references: [{ role: 'face', path: 'p', locked: true }], parentId: null, gridId: 'g', gridIndex: 0, credits: 12,
      width: 1632, height: 2048, unmaskedDigest: 'abcdef1234567890', now: new Date('2026-11-15T07:00:00Z'),
    });
    expect(isArtLibraryMeta(meta)).toBe(true);
    expect(isArtLibraryMeta({ subtype: 'other' })).toBe(false);
    const rows = Object.fromEntries(recipeRows(meta, 'en').map((r) => [r.key, r.value]));
    expect(rows).toMatchObject({ prompt: 'red jacket', model: 'gemini-3.1-flash-image', frame: '4:5 · 2K · 1632×2048', style: 'cinematic', avoid: 'text', refs: 'A face 🔒', seed: '42 (best effort)', price: '✦12' });
    expect(rows.kept).toMatch(/^sha256 abcdef123456/);
  });
});

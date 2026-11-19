/** @jest-environment node */
jest.mock('server-only', () => ({}));
import sharp from 'sharp';
import { artDownload, readArtRecipe, sizeOfPixels } from './download';
import { artLibraryMeta } from './library';

const uid = '11111111-2222-4333-8444-555555555555';
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const path = `art-director/${uid}/${id}.png`;
const pngOf = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
const meta = artLibraryMeta({ operation: 'generate', prompt: 'p', finalPrompt: 'p', styleId: null, avoid: [], aspectRatio: '1:1', size: '2K', seed: null,
  references: [], parentId: null, gridId: null, gridIndex: null, credits: 12, width: 64, height: 64, unmaskedDigest: null, now: new Date() });

describe('Art Director download (PNG / JPG)', () => {
  it('PNG as stored, named from the recipe', async () => {
    const png = await pngOf(64, 64);
    const files: Record<string, Buffer> = { [path]: png, [path.replace('.png', '.json')]: Buffer.from(JSON.stringify(meta)) };
    const f = await artDownload({ read: async (p) => files[p] ?? null }, path, uid, 'png');
    expect(f.contentType).toBe('image/png');
    expect(f.bytes.equals(png)).toBe(true);
    expect(f.filename).toBe(`myavatar-${id}-2k.png`);
  });

  it('JPG made from the PNG, transparency on white', async () => {
    const files: Record<string, Buffer> = { [path]: await pngOf(40, 20) };
    const f = await artDownload({ read: async (p) => files[p] ?? null }, path, uid, 'jpg');
    expect(f.contentType).toBe('image/jpeg');
    expect(f.bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
    const { data } = await sharp(f.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(245);
    expect(f.filename).toBe(`myavatar-${id}-1k.jpg`); // no recipe: size from pixels
  });

  it('refuses another user\'s picture, the sidecar and a missing file', async () => {
    const read = async () => Buffer.from('x');
    await expect(artDownload({ read }, path, '99999999-2222-4333-8444-555555555555', 'png')).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(artDownload({ read }, path.replace('.png', '.json'), uid, 'png')).rejects.toMatchObject({ status: 404 });
    await expect(artDownload({ read: async () => null }, path, uid, 'png')).rejects.toMatchObject({ status: 404 });
  });

  it('recipe: parsed when it is one, null when broken', async () => {
    expect(await readArtRecipe({ read: async () => Buffer.from(JSON.stringify(meta)) }, path, uid)).toMatchObject({ size: '2K', credits: 12 });
    expect(await readArtRecipe({ read: async () => Buffer.from('{oops') }, path, uid)).toBeNull();
    expect(sizeOfPixels(4096, 2304)).toBe('4K');
    expect(sizeOfPixels(1024, 2048)).toBe('2K');
  });
});

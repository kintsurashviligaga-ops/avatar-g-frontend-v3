/** @jest-environment node */
/**
 * What a Live-Avatar photo becomes before it is stored: real images made with sharp, so the checks run on real bytes —
 * the type comes from the bytes, the camera's metadata is gone, a sideways phone photo is stood up, and Google's 9:16
 * custom-avatar portrait is cut only when the source covers it without upscaling.
 */
jest.mock('server-only', () => ({}));

import sharp from 'sharp';
import { CUSTOM_AVATAR_SPEC, decodeImageDataUrl, portraitCrop, prepareLivePhoto } from './livePhoto';

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } });
/** Random pixels: the worst case for PNG size. */
const noise = (width: number, height: number) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width, height, channels: 3 } });
};

test('a 9:16 phone selfie: an upright JPEG to show, and a 1080×1920 RGB PNG for Google, under 5 MB', async () => {
  const src = await solid(1080, 1920).jpeg().withExif({ IFD0: { Make: 'TestCam', Model: 'GPS-Phone' } }).toBuffer();
  expect((await sharp(src).metadata()).exif).toBeDefined();
  const out = await prepareLivePhoto('image/jpeg', src);
  if ('error' in out) throw new Error(out.error);
  expect(out.prep).toEqual({ ok: true, reasons: [], faceChecked: false });
  expect(out.photo).toMatchObject({ mime: 'image/jpeg', width: 1080, height: 1920 });
  const photoMeta = await sharp(out.photo.bytes).metadata();
  expect(photoMeta.exif).toBeUndefined();
  expect(photoMeta.format).toBe('jpeg');
  expect(out.custom).toMatchObject({ mime: 'image/png', width: 1080, height: 1920 });
  const customMeta = await sharp(out.custom!.bytes).metadata();
  expect(customMeta).toMatchObject({ format: 'png', width: 1080, height: 1920, channels: 3, hasAlpha: false, space: 'srgb' });
  expect(customMeta.exif).toBeUndefined();
  expect(out.custom!.bytes.byteLength).toBeLessThan(CUSTOM_AVATAR_SPEC.maxBytes);
});

test('a sideways phone photo (EXIF orientation 6) is stored upright', async () => {
  const src = await solid(1920, 1080).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const out = await prepareLivePhoto('image/jpeg', src);
  if ('error' in out) throw new Error(out.error);
  expect(out.source).toEqual({ width: 1080, height: 1920 });
  expect(out.photo).toMatchObject({ width: 1080, height: 1920 });
  expect((await sharp(out.photo.bytes).metadata()).orientation).toBeUndefined();
  expect(out.custom).toMatchObject({ width: 1080, height: 1920 });
});

test('a big 4:3 photo is cut to its centred 9:16 and scaled DOWN; a noisy one too big as 1080×1920 PNG falls to 720×1280', async () => {
  const src = await noise(3000, 2250).jpeg({ quality: 95 }).toBuffer();
  const out = await prepareLivePhoto('image/jpeg', src);
  if ('error' in out) throw new Error(out.error);
  expect(out.photo.width).toBe(1920);
  expect(out.custom).toMatchObject({ width: 720, height: 1280 });
  expect(out.custom!.bytes.byteLength).toBeLessThan(CUSTOM_AVATAR_SPEC.maxBytes);
  expect(out.prep.ok).toBe(true);
});

test('the old square 720×720 selfie is saved, but is too small for a custom avatar — never upscaled', async () => {
  const src = await solid(720, 720).jpeg().toBuffer();
  const out = await prepareLivePhoto('image/jpeg', src);
  if ('error' in out) throw new Error(out.error);
  expect(out.photo).toMatchObject({ width: 720, height: 720 });
  expect(out.custom).toBeNull();
  expect(out.prep).toEqual({ ok: false, reasons: ['too_small'], faceChecked: false });
});

test('a 704×1280 source is short of an exact 9:16 at 720×1280 — reported, not stretched', async () => {
  const out = await prepareLivePhoto('image/png', await solid(704, 1280).png().toBuffer());
  if ('error' in out) throw new Error(out.error);
  expect(out.prep.reasons).toEqual(['too_small']);
});

test('refused: wrong label, not an image, unsupported type, tiny, undecodable', async () => {
  const png = await solid(800, 1400).png().toBuffer();
  expect(await prepareLivePhoto('image/jpeg', png)).toEqual({ status: 415, error: 'content_mismatch' });
  const html = Buffer.from(`<html><script>alert(1)</script>${' '.repeat(4000)}</html>`);
  expect(await prepareLivePhoto('image/jpeg', html)).toEqual({ status: 415, error: 'content_mismatch' });
  expect(await prepareLivePhoto('image/heic', png)).toEqual({ status: 415, error: 'unsupported_type' });
  expect(await prepareLivePhoto('image/png', await solid(120, 120).png().toBuffer())).toMatchObject({ status: 400 });
  expect(await prepareLivePhoto('image/png', await solid(200, 600).png({ compressionLevel: 0 }).toBuffer())).toEqual({ status: 400, error: 'too_small' });
  const truncated = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 7)]);
  expect(await prepareLivePhoto('image/jpeg', truncated)).toEqual({ status: 415, error: 'undecodable' });
  expect(await prepareLivePhoto('image/jpeg', Buffer.alloc(0))).toEqual({ status: 400, error: 'no_image' });
});

test('portraitCrop: the largest centred 9:16', () => {
  expect(portraitCrop(1080, 1920)).toEqual({ left: 0, top: 0, width: 1080, height: 1920 });
  expect(portraitCrop(1920, 1080)).toEqual({ left: 656, top: 0, width: 607, height: 1080 });
  expect(portraitCrop(1000, 3000)).toEqual({ left: 0, top: 611, width: 1000, height: 1777 });
});

test('decodeImageDataUrl reads the declared type and bytes', () => {
  expect(decodeImageDataUrl('data:image/png;base64,iVBORw0K')).toEqual({ mime: 'image/png', bytes: Buffer.from('iVBORw0K', 'base64') });
  expect(decodeImageDataUrl('data:IMAGE/JPEG;name=x.jpg;base64,AAAA')?.mime).toBe('image/jpeg');
  expect(decodeImageDataUrl('https://example.com/a.jpg')).toBeNull();
  expect(decodeImageDataUrl(42)).toBeNull();
});

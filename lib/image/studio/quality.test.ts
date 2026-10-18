/** @jest-environment node */
import sharp from 'sharp';
import { decodeImage, qualityCheck, MAX_IMAGE_BYTES } from './quality';
import { loadImageReference } from './assets';
import { imageRequest } from './testing';

test('real JPEG decoder orients pixels and removes EXIF from provider copy while source stays intact', async () => {
  const source = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'red' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const original = Buffer.from(source);
  const normalized = await decodeImage(source, 'image/jpeg');
  expect([normalized.width, normalized.height]).toEqual([8, 12]);
  const metadata = await sharp(normalized.data).metadata();
  expect(metadata.exif).toBeUndefined();
  expect(source.equals(original)).toBe(true);
});
test('malformed file, lying MIME, SVG and oversized body refused', async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } }).png().toBuffer();
  for (const [bytes, mime] of [[Buffer.from('bad'), 'image/png'], [png, 'image/jpeg'], [Buffer.from('<svg/>'), 'image/svg+xml'],
    [Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png']] as const) {
    await expect(decodeImage(bytes, mime)).rejects.toMatchObject({ code: 'invalid_reference' });
  }
});
test('real output QC refuses wrong aspect and insufficient resolution', async () => {
  const small = await sharp({ create: { width: 128, height: 128, channels: 3, background: 'red' } }).png().toBuffer();
  await expect(qualityCheck(small, 'image/png', imageRequest())).rejects.toMatchObject({ code: 'qc_failed' });
  const tall = await sharp({ create: { width: 768, height: 1376, channels: 3, background: 'blue' } }).png().toBuffer();
  await expect(qualityCheck(tall, 'image/png', imageRequest())).rejects.toMatchObject({ code: 'qc_failed' });
});
test.each(['upload', 'result'])('another user’s %s reference is refused before downloading bytes', async kind => {
  const io = { ownedUpload: jest.fn(async () => null), ownedResult: jest.fn(async () => null), download: jest.fn() };
  const asset = kind === 'upload' ? { kind: 'upload' as const, path: 'other/file.png' } :
    { kind: 'result' as const, id: '12345678-1234-4234-8234-123456789abc' };
  await expect(loadImageReference(io, { id: 'private', role: 'face', asset }, 'me')).rejects.toMatchObject({ code: 'not_found' });
  expect(io.download).not.toHaveBeenCalled();
});

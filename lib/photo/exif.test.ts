/** @jest-environment node */
/**
 * The capture-time reader: both byte orders, DateTimeOriginal before DateTime, and — because every offset comes from
 * a file a stranger may have crafted — null, never an exception, for anything malformed.
 */
import { parseExifDate, readExifCaptureTime } from './exif';

/** A minimal JPEG: SOI · APP1 „Exif" (IFD0 → optional Exif IFD) · SOS. */
function jpeg(opts: { le?: boolean; original?: string; dateTime?: string } = {}): Uint8Array {
  const le = opts.le ?? true;
  const tiff = new Uint8Array(256);
  const v = new DataView(tiff.buffer);
  tiff.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  const ifd0Entries: [number, number, number, number][] = []; // tag, type, count, value
  let heap = 120; // strings and the Exif IFD live after the IFDs
  const putString = (s: string) => {
    const at = heap;
    for (let i = 0; i < s.length; i++) tiff[at + i] = s.charCodeAt(i);
    tiff[at + s.length] = 0;
    heap += s.length + 1;
    return at;
  };
  if (opts.dateTime) ifd0Entries.push([0x0132, 2, opts.dateTime.length + 1, putString(opts.dateTime)]);
  let exifIfd = -1;
  if (opts.original) {
    exifIfd = 60;
    ifd0Entries.push([0x8769, 4, 1, exifIfd]);
    const str = putString(opts.original);
    v.setUint16(exifIfd, 1, le);
    v.setUint16(exifIfd + 2, 0x9003, le);
    v.setUint16(exifIfd + 4, 2, le);
    v.setUint32(exifIfd + 6, opts.original.length + 1, le);
    v.setUint32(exifIfd + 10, str, le);
    v.setUint32(exifIfd + 14, 0, le);
  }
  v.setUint16(8, ifd0Entries.length, le);
  ifd0Entries.forEach(([tag, type, count, value], i) => {
    const e = 10 + i * 12;
    v.setUint16(e, tag, le);
    v.setUint16(e + 2, type, le);
    v.setUint32(e + 4, count, le);
    v.setUint32(e + 8, value, le);
  });
  v.setUint32(10 + ifd0Entries.length * 12, 0, le);
  const payload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff.slice(0, heap)]);
  const segLen = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, segLen >> 8, segLen & 0xff, ...payload, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

describe('readExifCaptureTime', () => {
  it('reads DateTimeOriginal, little- and big-endian', () => {
    const want = Date.UTC(2026, 8, 30, 14, 5, 9);
    expect(readExifCaptureTime(jpeg({ original: '2026:09:30 14:05:09' }))).toBe(want);
    expect(readExifCaptureTime(jpeg({ le: false, original: '2026:09:30 14:05:09' }))).toBe(want);
  });

  it('prefers DateTimeOriginal (the shutter) over DateTime (the last edit), and falls back to it', () => {
    expect(readExifCaptureTime(jpeg({ original: '2026:09:30 14:05:09', dateTime: '2026:10:01 09:00:00' })))
      .toBe(Date.UTC(2026, 8, 30, 14, 5, 9));
    expect(readExifCaptureTime(jpeg({ dateTime: '2026:10:01 09:00:00' }))).toBe(Date.UTC(2026, 9, 1, 9, 0, 0));
  });

  it('is null — never a throw — for no EXIF, no date, a PNG, truncation and offsets that point outside the file', () => {
    expect(readExifCaptureTime(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
    expect(readExifCaptureTime(jpeg({}))).toBeNull();
    expect(readExifCaptureTime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(readExifCaptureTime(new Uint8Array(0))).toBeNull();
    const full = jpeg({ original: '2026:09:30 14:05:09' });
    for (let cut = 1; cut < full.length; cut += 7) expect(() => readExifCaptureTime(full.slice(0, cut))).not.toThrow();
    // Point the Exif IFD far outside the segment.
    const evil = jpeg({ original: '2026:09:30 14:05:09' });
    const tiffAt = 4 + 2 + 6; // SOI, APP1 marker+length, "Exif\0\0"
    new DataView(evil.buffer).setUint32(tiffAt + 10 + 8, 0x7fffffff, true);
    expect(readExifCaptureTime(evil)).toBeNull();
    // Random bytes after a valid SOI.
    let s = 7;
    const noise = new Uint8Array(4096).map(() => (s = (s * 1103515245 + 12345) & 0xff));
    noise[0] = 0xff; noise[1] = 0xd8;
    expect(() => readExifCaptureTime(noise)).not.toThrow();
  });
});

describe('parseExifDate', () => {
  it('reads the EXIF format and rejects zeros and nonsense', () => {
    expect(parseExifDate('2026:01:02 03:04:05')).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(parseExifDate('0000:00:00 00:00:00')).toBeNull();
    expect(parseExifDate('2026:13:02 03:04:05')).toBeNull();
    expect(parseExifDate('yesterday')).toBeNull();
  });
});

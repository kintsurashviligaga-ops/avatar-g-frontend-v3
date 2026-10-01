/**
 * The one EXIF field the culling assistant reads: when the photo was taken (DateTimeOriginal, else DateTime). It
 * keeps two visits to the same view out of one burst (lib/photo/cullMetrics.ts groupBursts). Read on the device from
 * the file's first bytes; nothing else in the EXIF block — GPS, the camera's serial — is parsed, kept or sent.
 *
 * ⚠️ NEVER THROWS. Every offset comes from the file, so every read is bounds-checked and anything malformed is
 * simply "no capture time" (null) — a broken or hostile JPEG must not stop the rest of the batch from being culled.
 */

/** How much of a file is worth reading: EXIF lives in APP1, which sits right after SOI and is capped at 64 KB. */
export const EXIF_SCAN_BYTES = 128 * 1024;

const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;

/** "YYYY:MM:DD HH:MM:SS" → ms. The camera's wall clock, read as UTC: only the gaps between frames matter. */
export function parseExifDate(s: string): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) return null;
  return Date.UTC(y, mo - 1, d, h, mi, se);
}

/** The capture time of a JPEG, in ms, or null (not a JPEG, no EXIF, no date, or anything malformed). */
export function readExifCaptureTime(input: ArrayBuffer | Uint8Array): number | null {
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = bytes.byteLength;
    if (len < 4 || view.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 <= len) {
      if (bytes[p] !== 0xff) return null;
      const marker = bytes[p + 1]!;
      if (marker === 0xff) { p += 1; continue; } // fill byte
      if (marker === 0xda || marker === 0xd9) return null; // image data / end: no EXIF before it
      const segLen = view.getUint16(p + 2);
      if (segLen < 2) return null;
      const start = p + 4;
      const end = Math.min(len, p + 2 + segLen);
      if (marker === 0xe1 && end - start >= 14
        && bytes[start] === 0x45 && bytes[start + 1] === 0x78 && bytes[start + 2] === 0x69 && bytes[start + 3] === 0x66
        && bytes[start + 4] === 0 && bytes[start + 5] === 0) {
        const t = readTiffDate(view, start + 6, end);
        if (t !== null) return t;
      }
      p += 2 + segLen;
    }
    return null;
  } catch {
    return null;
  }
}

function readTiffDate(view: DataView, tiff: number, end: number): number | null {
  if (tiff + 8 > end) return null;
  const order = view.getUint16(tiff);
  const le = order === 0x4949;
  if (!le && order !== 0x4d4d) return null;
  if (view.getUint16(tiff + 2, le) !== 42) return null;
  const u16 = (o: number) => (o + 2 <= end ? view.getUint16(o, le) : -1);
  const u32 = (o: number) => (o + 4 <= end ? view.getUint32(o, le) : -1);

  /** Finds `tag` in the IFD at TIFF offset `ifdOff`; returns the entry's absolute position or -1. */
  const findTag = (ifdOff: number, tag: number): number => {
    const ifd = tiff + ifdOff;
    const n = u16(ifd);
    if (n <= 0 || n > 512) return -1;
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > end) return -1;
      if (u16(e) === tag) return e;
    }
    return -1;
  };
  const asciiAt = (entry: number): string | null => {
    if (u16(entry + 2) !== 2) return null; // ASCII
    const count = u32(entry + 4);
    if (count < 19 || count > 64) return null;
    const at = count <= 4 ? entry + 8 : tiff + u32(entry + 8);
    if (at < tiff || at + count > end) return null;
    let s = '';
    for (let k = 0; k < count; k++) {
      const c = view.getUint8(at + k);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  const ifd0 = u32(tiff + 4);
  if (ifd0 < 8) return null;
  const exifPtr = findTag(ifd0, TAG_EXIF_IFD);
  if (exifPtr >= 0) {
    const exifOff = u32(exifPtr + 8);
    if (exifOff >= 8) {
      const dto = findTag(exifOff, TAG_DATETIME_ORIGINAL);
      const s = dto >= 0 ? asciiAt(dto) : null;
      const t = s ? parseExifDate(s) : null;
      if (t !== null) return t;
    }
  }
  const dt = findTag(ifd0, TAG_DATETIME);
  const s = dt >= 0 ? asciiAt(dt) : null;
  return s ? parseExifDate(s) : null;
}

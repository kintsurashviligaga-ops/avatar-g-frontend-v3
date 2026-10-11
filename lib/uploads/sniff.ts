/**
 * lib/uploads/sniff.ts — what a stored file REALLY is, read from its first bytes. Pure and isomorphic.
 *
 * ⚠️ A FILE'S NAME AND ITS DECLARED TYPE ARE THE BROWSER'S GUESS, NOT ITS CONTENT. The chat attaches a clip, the bucket
 * stores whatever bytes the signed PUT carried, and every later step (the montage plan, FFmpeg, Gemini) trusted the
 * declared type. A renamed text file declared as video/mp4 got as far as the render before failing with an FFmpeg
 * error nobody could read. /api/upload/verify reads the first bytes of the stored object and asks this function
 * whether they can be the kind the user attached; a file that cannot is refused by name, before anything runs on it.
 *
 * Containers are judged, not codecs: an MP4/MOV (`ftyp`) or a Matroska/WebM file can hold video or only sound, so
 * either kind is accepted for them. Unknown bytes are `null` — never a guess.
 */

export type SniffKind = 'video' | 'audio' | 'image';

export interface SniffResult {
  /** The container or format the bytes start with. */
  format: string;
  /** The attachment kinds this format can carry. */
  kinds: readonly SniffKind[];
}

const AV: readonly SniffKind[] = ['video', 'audio'];
const VIDEO: readonly SniffKind[] = ['video'];
const AUDIO: readonly SniffKind[] = ['audio'];
const IMAGE: readonly SniffKind[] = ['image'];

const ascii = (b: Uint8Array, at: number, len: number): string => {
  let s = '';
  for (let i = at; i < at + len && i < b.length; i += 1) s += String.fromCharCode(b[i]!);
  return s;
};

/** ISO-BMFF brands that hold only sound (an .m4a / .m4b / .aac in MP4). */
const AUDIO_BRANDS = /^(M4A |M4B |M4P |F4A |F4B )$/;
/** ISO-BMFF brands of still images (HEIC / AVIF), never a clip. */
const IMAGE_BRANDS = /^(heic|heix|heim|heis|hevc|hevx|mif1|msf1|avif|avis)$/;

/**
 * What the first bytes (at least 12; 64 is plenty) say the file is, or null when they match nothing known.
 */
export function sniffMedia(bytes: Uint8Array): SniffResult | null {
  const b = bytes;
  if (b.length < 4) return null;
  // ISO base media (MP4, MOV, M4A, 3GP, HEIC, AVIF): a box size then `ftyp` and the major brand.
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (AUDIO_BRANDS.test(brand)) return { format: 'm4a', kinds: AUDIO };
    if (IMAGE_BRANDS.test(brand)) return { format: brand.startsWith('av') ? 'avif' : 'heic', kinds: IMAGE };
    if (brand === 'qt  ') return { format: 'mov', kinds: AV };
    if (brand.startsWith('3g')) return { format: '3gp', kinds: AV };
    return { format: 'mp4', kinds: AV };
  }
  // QuickTime files without `ftyp` start with a moov / mdat / wide / free box.
  if (b.length >= 8 && /^(moov|mdat|wide|free|skip|pnot)$/.test(ascii(b, 4, 4))) return { format: 'mov', kinds: AV };
  // EBML: Matroska / WebM (video or audio-only).
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { format: 'webm', kinds: AV };
  // RIFF: WAVE (audio), AVI (video), WEBP (image).
  if (ascii(b, 0, 4) === 'RIFF' && b.length >= 12) {
    const sub = ascii(b, 8, 4);
    if (sub === 'WAVE') return { format: 'wav', kinds: AUDIO };
    if (sub === 'AVI ') return { format: 'avi', kinds: VIDEO };
    if (sub === 'WEBP') return { format: 'webp', kinds: IMAGE };
    return null;
  }
  if (ascii(b, 0, 4) === 'OggS') return { format: 'ogg', kinds: AV };
  if (ascii(b, 0, 4) === 'fLaC') return { format: 'flac', kinds: AUDIO };
  if (ascii(b, 0, 4) === 'FORM' && b.length >= 12 && /^AIF[FC]$/.test(ascii(b, 8, 4))) return { format: 'aiff', kinds: AUDIO };
  if (ascii(b, 0, 6) === '#!AMR\n' || ascii(b, 0, 5) === '#!AMR') return { format: 'amr', kinds: AUDIO };
  // MP3 with an ID3v2 tag, or a bare MPEG audio / ADTS AAC frame (11 sync bits).
  if (ascii(b, 0, 3) === 'ID3') return { format: 'mp3', kinds: AUDIO };
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) {
    // ADTS AAC has layer bits 00; MPEG audio layers I–III have 01–11.
    return { format: (b[1]! & 0x06) === 0 ? 'aac' : 'mp3', kinds: AUDIO };
  }
  // MPEG program / transport streams.
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && (b[3] === 0xba || b[3] === 0xb3)) return { format: 'mpeg', kinds: VIDEO };
  if (b[0] === 0x47 && b.length >= 189 && b[188] === 0x47) return { format: 'ts', kinds: VIDEO };
  // Images.
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { format: 'jpeg', kinds: IMAGE };
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return { format: 'png', kinds: IMAGE };
  if (ascii(b, 0, 4) === 'GIF8') return { format: 'gif', kinds: IMAGE };
  return null;
}

/** Can these bytes be the kind the user attached? Unknown bytes cannot. */
export function sniffMatches(bytes: Uint8Array, kind: SniffKind): { ok: boolean; format: string | null } {
  const got = sniffMedia(bytes);
  return { ok: !!got && got.kinds.includes(kind), format: got?.format ?? null };
}

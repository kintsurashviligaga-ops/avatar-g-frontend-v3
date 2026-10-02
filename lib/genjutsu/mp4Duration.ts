/**
 * lib/genjutsu/mp4Duration.ts — the LENGTH OF A STORED VIDEO, measured from its own bytes. Pure parser + one tiny
 * range-reading fetcher; no ffmpeg, no download of the whole file.
 *
 * ⚠️ WHY THE SERVER MEASURES. The browser measures the source video (an HTMLVideoElement) and says so in the request —
 * and a forged request can say anything. The price of a motion transfer scales with SECONDS, and the provider bills the
 * length of the file it fetches, not the number a client typed. So the route asks the stored object: it walks the file's
 * top-level boxes (ftyp · … · moov · mdat, in any order — phones put `moov` at the END), reads only the `moov` box and
 * takes `mvhd.duration / mvhd.timescale`. A handful of Range requests, a few KB each, against OUR OWN signed storage URL
 * (never a URL the user supplied — contract.ts refuses those), and the answer is the file's, not the client's.
 *
 * MP4 and QuickTime share this layout (ISO 14496-12 / QTFF). Not handled, and refused as `video_unreadable` rather than
 * guessed at: fragmented MP4 with an empty `mvhd` duration, a compressed `moov` (`cmov`, a QuickTime relic), WebM. The
 * accepted containers are mp4 and mov (limits.SOURCE_VIDEO_MIMES) — what Kling documents.
 */
import { SOURCE_VIDEO_MAX_BYTES, SOURCE_VIDEO_MAX_SEC, SOURCE_VIDEO_MIN_SEC } from './limits';

/** Reads bytes [start, endInclusive] of the file; null when the range cannot be read. */
export type RangeReader = (start: number, endInclusive: number) => Promise<Uint8Array | null>;

const MOOV_MAX_BYTES = 16 * 1024 * 1024;
const MAX_TOP_LEVEL_BOXES = 64;

const u32 = (b: Uint8Array, at: number): number => ((b[at]! * 0x1000000) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!) >>> 0;
const u64 = (b: Uint8Array, at: number): number => u32(b, at) * 0x1_0000_0000 + u32(b, at + 4);
const fourcc = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

/** `mvhd` payload → seconds. version 0: 32-bit times, version 1: 64-bit. */
function mvhdSeconds(p: Uint8Array): number | null {
  if (p.length < 20) return null;
  const version = p[0]!;
  if (version === 1) {
    if (p.length < 32) return null;
    const timescale = u32(p, 20);
    const duration = u64(p, 24);
    return timescale > 0 && Number.isFinite(duration) ? duration / timescale : null;
  }
  if (version !== 0) return null;
  const timescale = u32(p, 12);
  const duration = u32(p, 16);
  return timescale > 0 ? duration / timescale : null;
}

/** Walks a `moov` payload's child boxes for `mvhd`. */
function durationFromMoov(moov: Uint8Array): number | null {
  let at = 0;
  while (at + 8 <= moov.length) {
    let size = u32(moov, at);
    let head = 8;
    if (size === 1) {
      if (at + 16 > moov.length) return null;
      size = u64(moov, at + 8);
      head = 16;
    } else if (size === 0) {
      size = moov.length - at;
    }
    if (size < head || at + size > moov.length) return null;
    if (fourcc(moov, at + 4) === 'mvhd') return mvhdSeconds(moov.subarray(at + head, at + size));
    at += size;
  }
  return null;
}

/**
 * The duration in seconds, or null when the file is not a readable MP4 / MOV (or has no usable `mvhd`).
 * `total` is the file's size in bytes. At most 64 header reads + one `moov` read.
 */
export async function readMp4DurationSec(read: RangeReader, total: number): Promise<number | null> {
  if (!Number.isFinite(total) || total < 16) return null;
  let offset = 0;
  for (let i = 0; i < MAX_TOP_LEVEL_BOXES && offset + 8 <= total; i++) {
    const hdr = await read(offset, Math.min(offset + 15, total - 1));
    if (!hdr || hdr.length < 8) return null;
    let size = u32(hdr, 0);
    let head = 8;
    if (size === 1) {
      if (hdr.length < 16) return null;
      size = u64(hdr, 8);
      head = 16;
    } else if (size === 0) {
      size = total - offset; // "to the end of the file"
    }
    if (!Number.isFinite(size) || size < head || offset + size > total) return null;
    if (fourcc(hdr, 4) === 'moov') {
      const payload = size - head;
      if (payload <= 0 || payload > MOOV_MAX_BYTES) return null;
      const moov = await read(offset + head, offset + size - 1);
      if (!moov || moov.length !== payload) return null;
      const sec = durationFromMoov(moov);
      return sec !== null && Number.isFinite(sec) && sec > 0 ? sec : null;
    }
    offset += size;
  }
  return null;
}

// ─── Reading a stored object over HTTP ───────────────────────────────────────────────────────────────────────────

export interface RemoteFile {
  size: number;
  read: RangeReader;
}

type FetchLike = typeof fetch;

const RANGE_TIMEOUT_MS = 15_000;

/**
 * Opens OUR OWN signed storage URL for ranged reading. The size comes from the first ranged response's
 * `Content-Range: bytes 0-0/<total>`. A server that ignores Range answers 200 with the whole body — then the file is
 * read once, under the size ceiling, so a range-less storage still verifies instead of being refused or trusted.
 * Returns null when the object is missing / unreadable, and 'too_large' when it exceeds `maxBytes`.
 */
export async function openRemoteFile(url: string, opts: { fetchFn?: FetchLike; maxBytes?: number } = {}): Promise<RemoteFile | null | 'too_large'> {
  const f = opts.fetchFn ?? fetch;
  const maxBytes = opts.maxBytes ?? SOURCE_VIDEO_MAX_BYTES;
  let first: Response;
  try {
    first = await f(url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store', signal: AbortSignal.timeout(RANGE_TIMEOUT_MS) });
  } catch {
    return null;
  }

  if (first.status === 206) {
    await first.arrayBuffer().catch(() => undefined);
    const m = /\/(\d+)\s*$/.exec(first.headers.get('content-range') ?? '');
    const size = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(size) || size <= 0) return null;
    if (size > maxBytes) return 'too_large';
    const read: RangeReader = async (start, endInclusive) => {
      try {
        const res = await f(url, { headers: { Range: `bytes=${start}-${endInclusive}` }, cache: 'no-store', signal: AbortSignal.timeout(RANGE_TIMEOUT_MS) });
        if (res.status !== 206 && res.status !== 200) return null;
        const buf = new Uint8Array(await res.arrayBuffer());
        // A 200 means this response ignored the range after all: slice it ourselves.
        return res.status === 200 ? buf.subarray(start, endInclusive + 1) : buf;
      } catch {
        return null;
      }
    };
    return { size, read };
  }

  if (first.status === 200) {
    const declared = Number(first.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await first.body?.cancel().catch(() => undefined);
      return 'too_large';
    }
    // Range ignored: this response IS the whole file. Read it once, capped.
    const whole = await readCapped(first, maxBytes);
    if (whole === 'too_large') return 'too_large';
    if (!whole) return null;
    return { size: whole.length, read: async (s, e) => whole.subarray(s, e + 1) };
  }

  await first.body?.cancel().catch(() => undefined);
  return null;
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | 'too_large' | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return 'too_large';
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

// ─── The verdict the route acts on ───────────────────────────────────────────────────────────────────────────────

/** Rounding slack between the container's `mvhd` and the browser's media element (they agree to ~0.05 s). */
const DURATION_SLACK_SEC = 0.1;

export type VideoVerdict =
  | { ok: true; durationSec: number; sizeBytes: number }
  | { ok: false; code: 'video_missing' | 'video_unreadable' | 'video_size' | 'video_duration'; durationSec?: number };

export async function verifyStoredVideo(signedUrl: string, opts: { fetchFn?: FetchLike } = {}): Promise<VideoVerdict> {
  const file = await openRemoteFile(signedUrl, opts);
  if (file === 'too_large') return { ok: false, code: 'video_size' };
  if (!file) return { ok: false, code: 'video_missing' };
  const durationSec = await readMp4DurationSec(file.read, file.size);
  if (durationSec === null) return { ok: false, code: 'video_unreadable' };
  if (durationSec < SOURCE_VIDEO_MIN_SEC - DURATION_SLACK_SEC || durationSec > SOURCE_VIDEO_MAX_SEC + DURATION_SLACK_SEC) {
    return { ok: false, code: 'video_duration', durationSec };
  }
  return { ok: true, durationSec, sizeBytes: file.size };
}

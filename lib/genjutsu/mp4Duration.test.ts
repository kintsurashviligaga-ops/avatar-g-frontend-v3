/** @jest-environment node */
/**
 * The server-side length check: the length of a stored video is measured from the file's own `mvhd`, never taken from
 * the client's claim. Files are built byte by byte here (no fixtures to ship) in the layouts that matter: `moov`
 * FIRST (faststart), `moov` LAST (what phones record), 64-bit boxes, and the broken shapes that must be refused.
 */
import { SOURCE_VIDEO_MAX_BYTES } from './limits';
import { openRemoteFile, readMp4DurationSec, verifyStoredVideo, type RangeReader } from './mp4Duration';

// ─── a tiny MP4 writer ──────────────────────────────────────────────────────────────────────────────────────────
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be64 = (n: number) => [...be32(Math.floor(n / 0x1_0000_0000)), ...be32(n >>> 0)];
const tag = (s: string) => [...s].map((c) => c.charCodeAt(0));
const box = (type: string, payload: number[]) => [...be32(8 + payload.length), ...tag(type), ...payload];
const mvhd = (timescale: number, duration: number, version: 0 | 1 = 0) =>
  box('mvhd', version === 0
    ? [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(timescale), ...be32(duration), ...new Array(80).fill(0)]
    : [1, 0, 0, 0, ...be64(0), ...be64(0), ...be32(timescale), ...be64(duration), ...new Array(80).fill(0)]);
const moov = (children: number[]) => box('moov', children);
const ftyp = () => box('ftyp', [...tag('isom'), ...be32(512), ...tag('isom'), ...tag('mp41')]);

/** A file of `total` bytes with `parts` written back to back from byte 0. */
function file(parts: number[][], total?: number): Uint8Array {
  const flat = parts.flat();
  const out = new Uint8Array(total ?? flat.length);
  out.set(flat.slice(0, out.length));
  return out;
}
const reader = (bytes: Uint8Array): RangeReader => async (a, b) => (a >= bytes.length ? null : bytes.slice(a, Math.min(b, bytes.length - 1) + 1));

/** An mdat header that DECLARES `size` bytes without carrying them (the sparse layout of a 40 MB phone video). */
const mdatHeader = (size: number) => [...be32(size), ...tag('mdat')];

// ─── the parser ─────────────────────────────────────────────────────────────────────────────────────────────────

test('faststart layout (moov before mdat): 12.5 s', async () => {
  const bytes = file([ftyp(), moov(mvhd(1000, 12_500)), box('mdat', new Array(64).fill(7))]);
  expect(await readMp4DurationSec(reader(bytes), bytes.length)).toBeCloseTo(12.5, 3);
});

test('phone layout (moov LAST, after a large mdat) — only headers are read to find it', async () => {
  const head = [...ftyp()];
  const mdatSize = 30 * 1024 * 1024;
  const moovBytes = moov(mvhd(600, 7_200)); // 12 s at a 600 timescale, the QuickTime classic
  const total = head.length + mdatSize + moovBytes.length;
  const bytes = new Uint8Array(total);
  bytes.set(head, 0);
  bytes.set(mdatHeader(mdatSize), head.length);
  bytes.set(moovBytes, head.length + mdatSize);
  const reads: Array<[number, number]> = [];
  const spy: RangeReader = async (a, b) => { reads.push([a, b]); return reader(bytes)(a, b); };
  expect(await readMp4DurationSec(spy, total)).toBeCloseTo(12, 3);
  // ftyp header, mdat header, moov header, moov payload — never the 30 MB in between.
  expect(reads).toHaveLength(4);
  expect(Math.max(...reads.map(([a, b]) => b - a + 1))).toBeLessThan(1024);
});

test('version-1 mvhd (64-bit duration) is read', async () => {
  const bytes = file([ftyp(), moov(mvhd(90_000, 90_000 * 25, 1))]);
  expect(await readMp4DurationSec(reader(bytes), bytes.length)).toBeCloseTo(25, 3);
});

test('a 64-bit (largesize) mdat box is skipped correctly', async () => {
  const head = ftyp();
  const big = 3 * 1024 * 1024;
  const moovBytes = moov(mvhd(1000, 9_000));
  const total = head.length + big + moovBytes.length;
  const bytes = new Uint8Array(total);
  bytes.set(head, 0);
  bytes.set([...be32(1), ...tag('mdat'), ...be64(big)], head.length);
  bytes.set(moovBytes, head.length + big);
  expect(await readMp4DurationSec(reader(bytes), total)).toBeCloseTo(9, 3);
});

test('mvhd may sit after other moov children (trak first)', async () => {
  const trak = box('trak', new Array(40).fill(1));
  const bytes = file([ftyp(), moov([...trak, ...mvhd(1000, 4_000)])]);
  expect(await readMp4DurationSec(reader(bytes), bytes.length)).toBeCloseTo(4, 3);
});

test('refused, never guessed: not an MP4, truncated, zero duration (fragmented), no moov, a lying box size', async () => {
  const junk = new Uint8Array(4096).map((_, i) => (i * 31) % 251);
  expect(await readMp4DurationSec(reader(junk), junk.length)).toBeNull();

  const good = file([ftyp(), moov(mvhd(1000, 12_000))]);
  const cut = good.slice(0, good.length - 20);
  expect(await readMp4DurationSec(reader(cut), cut.length)).toBeNull();

  const zero = file([ftyp(), moov(mvhd(1000, 0))]);
  expect(await readMp4DurationSec(reader(zero), zero.length)).toBeNull();

  const noMoov = file([ftyp(), box('mdat', new Array(64).fill(7))]);
  expect(await readMp4DurationSec(reader(noMoov), noMoov.length)).toBeNull();

  const lying = file([ftyp(), [...be32(0x7fffffff), ...tag('mdat'), 0, 0, 0, 0]]);
  expect(await readMp4DurationSec(reader(lying), lying.length)).toBeNull();

  const tiny = file([[...be32(4), ...tag('free'), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]);
  expect(await readMp4DurationSec(reader(tiny), tiny.length)).toBeNull();

  const zeroScale = file([ftyp(), moov(mvhd(0, 5_000))]);
  expect(await readMp4DurationSec(reader(zeroScale), zeroScale.length)).toBeNull();
  expect(await readMp4DurationSec(reader(good), 4)).toBeNull();
});

test('a failing range read is a refusal, not a crash', async () => {
  expect(await readMp4DurationSec(async () => null, 1000)).toBeNull();
});

// ─── the HTTP side: a fake storage that honours Range ───────────────────────────────────────────────────────────

function storage(bytes: Uint8Array | null, opts: { honourRange?: boolean } = {}): typeof fetch {
  const honour = opts.honourRange ?? true;
  return (async (_url: unknown, init?: RequestInit) => {
    if (!bytes) return new Response('not found', { status: 404 });
    const range = /bytes=(\d+)-(\d+)/.exec(String((init?.headers as Record<string, string> | undefined)?.Range ?? ''));
    if (!honour || !range) return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
    const a = Number(range[1]);
    const b = Math.min(Number(range[2]), bytes.length - 1);
    return new Response(bytes.slice(a, b + 1), { status: 206, headers: { 'content-range': `bytes ${a}-${b}/${bytes.length}` } });
  }) as unknown as typeof fetch;
}

test('verifyStoredVideo: a 12.5 s file is accepted and its size and length come from the FILE', async () => {
  const bytes = file([ftyp(), moov(mvhd(1000, 12_500)), box('mdat', new Array(500).fill(1))]);
  const v = await verifyStoredVideo('https://x.supabase.co/obj', { fetchFn: storage(bytes) });
  expect(v).toEqual({ ok: true, durationSec: 12.5, sizeBytes: bytes.length });
});

test('verifyStoredVideo: 2 s and 45 s are out of range — whatever the browser claimed', async () => {
  for (const [ms, ok] of [[2_000, false], [2_950, true], [3_000, true], [30_000, true], [30_100, true], [30_500, false], [45_000, false]] as const) {
    const bytes = file([ftyp(), moov(mvhd(1000, ms))]);
    const v = await verifyStoredVideo('https://x.supabase.co/obj', { fetchFn: storage(bytes) });
    expect(v.ok).toBe(ok);
    if (!v.ok) expect(v.code).toBe('video_duration');
  }
});

test('verifyStoredVideo: missing object, unreadable file and an oversized file each have their own reason', async () => {
  expect(await verifyStoredVideo('https://x.supabase.co/obj', { fetchFn: storage(null) })).toEqual({ ok: false, code: 'video_missing' });

  const junk = new Uint8Array(2048).map((_, i) => (i * 13) % 241);
  expect(await verifyStoredVideo('https://x.supabase.co/obj', { fetchFn: storage(junk) })).toEqual({ ok: false, code: 'video_unreadable' });

  const huge: typeof fetch = (async () => new Response(new Uint8Array(1), { status: 206, headers: { 'content-range': `bytes 0-0/${SOURCE_VIDEO_MAX_BYTES + 1}` } })) as unknown as typeof fetch;
  expect(await verifyStoredVideo('https://x.supabase.co/obj', { fetchFn: huge })).toEqual({ ok: false, code: 'video_size' });
});

test('a storage that ignores Range still verifies (read once, under the cap) and still refuses an oversized body', async () => {
  const bytes = file([ftyp(), moov(mvhd(1000, 8_000))]);
  const v = await verifyStoredVideo('https://x.supabase.co/obj', { fetchFn: storage(bytes, { honourRange: false }) });
  expect(v).toEqual({ ok: true, durationSec: 8, sizeBytes: bytes.length });

  const declaredHuge: typeof fetch = (async () => new Response(new Uint8Array(4), { status: 200, headers: { 'content-length': String(SOURCE_VIDEO_MAX_BYTES + 5) } })) as unknown as typeof fetch;
  expect(await openRemoteFile('https://x.supabase.co/obj', { fetchFn: declaredHuge })).toBe('too_large');
});

test('a network failure is "missing", not a thrown error', async () => {
  const boom: typeof fetch = (async () => { throw new Error('socket hang up'); }) as unknown as typeof fetch;
  expect(await verifyStoredVideo('https://x.supabase.co/obj', { fetchFn: boom })).toEqual({ ok: false, code: 'video_missing' });
});

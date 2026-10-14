/**
 * lib/music/studio/audio.ts — real audio checks and deterministic edits with the bundled ffmpeg (no model, no network).
 *
 * Inputs are always local files written from bytes we already hold, so ffmpeg never fetches anything. Every result is
 * measured again after it is made (duration, audio stream, level), and a track that is silent, streamless or the wrong
 * length is refused instead of delivered.
 *
 * NOTE (Vercel): a route importing this must be listed with ffmpeg-static in next.config.js outputFileTracingIncludes.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import type { AudioQc } from './contracts';
import { MusicError } from './errors';

export type AudioFormat = 'mp3' | 'wav' | 'm4a';
export const FORMAT_MIME: Record<AudioFormat, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' };

export function formatOfMime(mime: string): AudioFormat | null {
  const m = mime.toLowerCase();
  if (/mpeg|mp3/.test(m)) return 'mp3';
  if (/wav|wave/.test(m)) return 'wav';
  if (/mp4|m4a|aac/.test(m)) return 'm4a';
  return null;
}

function bin(): string {
  const b = (ffmpegStatic as unknown as string) || '';
  if (!b) throw new MusicError('edit_failed', 'The audio tool is not available on this server.', 503);
  return b;
}

function run(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(bin(), args, { maxBuffer: 1 << 24, timeout: timeoutMs, ...(signal ? { signal } : {}) }, (err, _out, stderr) => {
      const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
      if (e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')) return reject(new MusicError('cancelled', 'The edit was stopped.', 409));
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stderr: String(stderr ?? '') });
    });
    child.stdin?.end();
  });
}

/** Parse ffmpeg's banner + volumedetect lines. Pure (exported for tests). */
export function parseAudioReport(stderr: string): AudioQc {
  const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const durationSec = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const a = /Stream #\d+:\d+[^:]*: Audio: ([a-z0-9_]+)[^,\n]*(?:,\s*(\d+) Hz)?(?:,\s*([a-z0-9.() ]+?))?(?:,|\n|$)/i.exec(stderr);
  const ch = a?.[3]?.trim().toLowerCase() ?? '';
  const channels = ch.startsWith('mono') ? 1 : ch.startsWith('stereo') ? 2 : /^(\d+)/.test(ch) ? Number(/^(\d+)/.exec(ch)![1]) : null;
  const max = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr);
  const mean = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr);
  const db = (m: RegExpExecArray | null) => (m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : null);
  return {
    durationSec: Math.round(durationSec * 100) / 100,
    codec: a?.[1]?.toLowerCase() ?? null,
    sampleRate: a?.[2] ? Number(a[2]) : null,
    channels,
    maxVolumeDb: db(max),
    meanVolumeDb: db(mean),
  };
}

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'music-studio-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}

/** Measure real bytes: decode the whole stream (volumedetect), so a truncated or corrupt file fails here. */
export async function measureAudio(bytes: Buffer, format: AudioFormat, signal?: AbortSignal): Promise<AudioQc> {
  if (!bytes?.byteLength) throw new MusicError('quality_failed', 'The audio is empty.', 502);
  return withDir(async (dir) => {
    const file = join(dir, `in.${format}`);
    await writeFile(file, bytes);
    const r = await run(['-hide_banner', '-nostdin', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], 60_000, signal);
    const qc = parseAudioReport(r.stderr);
    if (r.code !== 0 && !qc.durationSec) throw new MusicError('quality_failed', 'The audio could not be decoded.', 502);
    return qc;
  });
}

export interface QcRule { minSec: number; maxSec: number }

/** Refuse what must not be delivered: no audio stream, silence, or a length outside the rule. */
export function assertDeliverable(qc: AudioQc, rule: QcRule): void {
  if (!qc.codec) throw new MusicError('quality_failed', 'The file has no audio stream.', 502);
  if (!(qc.durationSec >= rule.minSec)) throw new MusicError('quality_failed', `The track is too short (${qc.durationSec} s).`, 502);
  if (!(qc.durationSec <= rule.maxSec)) throw new MusicError('quality_failed', `The track is too long (${qc.durationSec} s).`, 502);
  if (qc.maxVolumeDb === null || qc.maxVolumeDb === -Infinity || qc.maxVolumeDb < -60) throw new MusicError('quality_failed', 'The track is silent.', 502);
}

// ── deterministic edits ─────────────────────────────────────────────────────────────────────────────────────────

export type EditOp =
  | { op: 'trim'; startSec: number; endSec: number }
  | { op: 'volume'; db: number }
  | { op: 'mute' }
  | { op: 'fade_in'; sec: number }
  | { op: 'fade_out'; sec: number };

const n2 = (x: number) => (Math.round(x * 1000) / 1000).toString();

/**
 * The filter chain for one source and its ops, plus the length it will have. Pure (exported for tests). The source's
 * measured length bounds every op: a trim past the end, or a fade longer than the track, is refused, not clamped.
 */
export function editFilters(ops: EditOp[], sourceSec: number): { filters: string[]; outSec: number } {
  let start = 0;
  let end = sourceSec;
  const trims = ops.filter((o) => o.op === 'trim') as Array<Extract<EditOp, { op: 'trim' }>>;
  if (trims.length > 1) throw new MusicError('validation_failed', 'Use one trim per edit.', 400);
  if (trims[0]) {
    const t = trims[0];
    if (!(t.startSec >= 0) || !(t.endSec > t.startSec) || t.endSec > sourceSec + 0.05) {
      throw new MusicError('validation_failed', `The trim must lie within 0–${n2(sourceSec)} s.`, 400);
    }
    start = t.startSec;
    end = Math.min(t.endSec, sourceSec);
  }
  const outSec = end - start;
  if (outSec < 1) throw new MusicError('validation_failed', 'The result would be shorter than 1 s.', 400);
  const filters: string[] = [];
  if (trims[0]) filters.push(`atrim=start=${n2(start)}:end=${n2(end)}`, 'asetpts=PTS-STARTPTS');
  for (const o of ops) {
    if (o.op === 'volume') {
      if (!(o.db >= -60 && o.db <= 12)) throw new MusicError('validation_failed', 'Volume must be between −60 and +12 dB.', 400);
      filters.push(`volume=${n2(o.db)}dB`);
    } else if (o.op === 'mute') {
      filters.push('volume=0');
    } else if (o.op === 'fade_in' || o.op === 'fade_out') {
      if (!(o.sec > 0) || o.sec > outSec) throw new MusicError('validation_failed', 'A fade must be shorter than the track.', 400);
      filters.push(o.op === 'fade_in' ? `afade=t=in:st=0:d=${n2(o.sec)}` : `afade=t=out:st=${n2(outSec - o.sec)}:d=${n2(o.sec)}`);
    }
  }
  return { filters, outSec };
}

const ENCODE: Record<AudioFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'],
  wav: ['-c:a', 'pcm_s16le'],
  m4a: ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
};

/** Apply ops to one source and encode to `format`. Returns the new bytes; the source bytes are never modified. */
export async function renderEdit(src: { bytes: Buffer; format: AudioFormat }, ops: EditOp[], sourceSec: number, format: AudioFormat, signal?: AbortSignal): Promise<{ bytes: Buffer; expectedSec: number }> {
  const { filters, outSec } = editFilters(ops, sourceSec);
  return withDir(async (dir) => {
    const input = join(dir, `src.${src.format}`);
    const output = join(dir, `out.${format}`);
    await writeFile(input, src.bytes);
    const args = ['-hide_banner', '-nostdin', '-y', '-i', input, '-vn', '-ar', '44100', '-ac', '2'];
    if (filters.length) args.push('-af', filters.join(','));
    args.push(...ENCODE[format], output);
    const r = await run(args, 120_000, signal);
    if (r.code !== 0) throw new MusicError('edit_failed', 'The audio edit could not be rendered.', 502);
    return { bytes: await readFile(output), expectedSec: outSec };
  });
}

/** Join sources end to end (optionally crossfaded), resampled to one format. */
export async function renderJoin(srcs: Array<{ bytes: Buffer; format: AudioFormat; sec: number }>, crossfadeSec: number, format: AudioFormat, signal?: AbortSignal): Promise<{ bytes: Buffer; expectedSec: number }> {
  if (srcs.length < 2 || srcs.length > 6) throw new MusicError('validation_failed', 'Join 2 to 6 tracks.', 400);
  const shortest = Math.min(...srcs.map((s) => s.sec));
  if (!(crossfadeSec >= 0) || crossfadeSec > 10 || (crossfadeSec > 0 && crossfadeSec >= shortest)) {
    throw new MusicError('validation_failed', 'The crossfade must be 0–10 s and shorter than every track.', 400);
  }
  return withDir(async (dir) => {
    const args = ['-hide_banner', '-nostdin', '-y'];
    for (let i = 0; i < srcs.length; i += 1) {
      const f = join(dir, `s${i}.${srcs[i]!.format}`);
      await writeFile(f, srcs[i]!.bytes);
      args.push('-i', f);
    }
    const norm = srcs.map((_, i) => `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    let chain: string;
    if (crossfadeSec > 0) {
      const steps: string[] = [];
      let last = 'a0';
      for (let i = 1; i < srcs.length; i += 1) {
        const out = i === srcs.length - 1 ? 'out' : `x${i}`;
        steps.push(`[${last}][a${i}]acrossfade=d=${n2(crossfadeSec)}[${out}]`);
        last = out;
      }
      chain = steps.join(';');
    } else {
      chain = `${srcs.map((_, i) => `[a${i}]`).join('')}concat=n=${srcs.length}:v=0:a=1[out]`;
    }
    const output = join(dir, `out.${format}`);
    args.push('-filter_complex', `${norm.join(';')};${chain}`, '-map', '[out]', ...ENCODE[format], output);
    const r = await run(args, 180_000, signal);
    if (r.code !== 0) throw new MusicError('edit_failed', 'The tracks could not be joined.', 502);
    const total = srcs.reduce((s, x) => s + x.sec, 0) - crossfadeSec * (srcs.length - 1);
    return { bytes: await readFile(output), expectedSec: total };
  });
}

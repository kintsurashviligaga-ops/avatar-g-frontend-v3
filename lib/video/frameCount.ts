/**
 * lib/video/frameCount.ts — how many frames a file REALLY holds (Video Core v1.0 §4: frame accuracy is judged on the
 * frames a decoder yields, never read off the container's duration).
 *
 * ffmpeg decodes the first video stream to the null muxer with the frame cadence untouched (`-fps_mode passthrough`: no
 * frame duplicated or dropped on the way) and reports machine-readable progress on stdout (`-progress pipe:1`); the last
 * `frame=N` line is the number of frames decoded — the same count a frame-by-frame reader gets, in one pass, with no
 * ffprobe (none is bundled). Local files only: a URL is refused here; a caller downloads first (lib/video/ffmpegExec).
 *
 * The verdict is exact. A contracted final of framesFor(finalSec) frames is delivered with exactly that many decoded
 * frames, or the QC says by how many it is off: 24 s at 30 fps = 720, 29.7 s = 891, 60 s = 1800, 240 s = 7200.
 */
import { execFile } from 'node:child_process';
import { VIDEO_FPS, framesFor } from '@/lib/video/durationContract';

/** The decode-and-count argv (pure; pinned by frameCount.test). `file` is a local path. */
export function decodedFrameArgs(file: string): string[] {
  return ['-hide_banner', '-nostdin', '-nostats', '-progress', 'pipe:1', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'null', '-'];
}

/** The decoded frame count out of ffmpeg's progress report (its last `frame=N`); the final stats line on stderr as a fallback. */
export function parseDecodedFrames(stdout: string, stderr = ''): number | null {
  let last: number | null = null;
  for (const m of String(stdout ?? '').matchAll(/^frame=\s*(\d+)\s*$/gm)) last = Number(m[1]);
  if (last === null) for (const m of String(stderr ?? '').matchAll(/frame=\s*(\d+)/g)) last = Number(m[1]);
  return last !== null && Number.isFinite(last) ? last : null;
}

export type FrameVerdict =
  | { ok: true; expected: number; actual: number; fps: number }
  | { ok: false; reason: 'unreadable' | 'count_mismatch'; expected: number; actual: number | null; offBy: number | null; fps: number };

/** Exactly framesFor(finalSec, fps) frames, or how the file misses it. */
export function frameExactVerdict(actual: number | null, finalSec: number, fps: number = VIDEO_FPS): FrameVerdict {
  const expected = framesFor(finalSec, fps);
  if (actual === null || !Number.isFinite(actual)) return { ok: false, reason: 'unreadable', expected, actual: null, offBy: null, fps };
  if (actual !== expected) return { ok: false, reason: 'count_mismatch', expected, actual, offBy: actual - expected, fps };
  return { ok: true, expected, actual, fps };
}

/** Decode `file` (a local path) with `bin` and count its frames; null when the file could not be read. */
export function countDecodedFrames(bin: string, file: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<number | null> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file)) return Promise.reject(new Error('countDecodedFrames: local files only'));
  return new Promise((resolve) => {
    execFile(
      bin,
      decodedFrameArgs(file),
      { maxBuffer: 1 << 24, timeout: opts.timeoutMs ?? 120_000, killSignal: 'SIGKILL', ...(opts.signal ? { signal: opts.signal } : {}) },
      (error, stdout, stderr) => {
        if (error && !String(stdout ?? '').trim()) return resolve(null);
        resolve(parseDecodedFrames(String(stdout ?? ''), String(stderr ?? '')));
      },
    );
  });
}

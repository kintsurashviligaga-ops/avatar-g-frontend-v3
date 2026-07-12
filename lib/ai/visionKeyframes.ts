/**
 * lib/ai/visionKeyframes.ts
 * =========================
 * PHASE 27 (VECTOR 2) — the server-only ffmpeg IO for the Vision Quality Gate: sample up to `count`
 * keyframes evenly across an MP4 → base64 JPEGs. Split out of visionQualityGate.ts (which stays a plain,
 * jest-importable module) because `import 'server-only'` + ffmpeg-static/node-fs cannot load in a client
 * bundle or a node test. The gate lazy-imports this only when it actually runs (FILM_VISION_QA=1).
 *
 * FAIL-OPEN → [] on ANY error (no ffmpeg binary, download failure/timeout, probe failure, exec failure),
 * so a QA sample can never break, pin, or OOM a render. Downloads the master to a bounded temp file
 * first (ffmpeg-static's HTTP support is not guaranteed on the serverless build), probes the duration
 * from ffmpeg's stderr (no ffprobe bundled — same trick masterQa uses), then seeks to evenly-spaced
 * timestamps and grabs one downscaled frame each. Cleans up the temp dir in a finally.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const exec = promisify(execFile);

export async function extractKeyframes(videoUrl: string, count = 4, timeoutMs = 20_000): Promise<string[]> {
  const bin = typeof ffmpegStatic === 'string' ? ffmpegStatic : '';
  if (!bin || !videoUrl) return [];
  let dir: string | null = null;
  try {
    // 1) bounded download — a QA sample must never pin the function or OOM.
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    let buf: Buffer;
    try {
      const res = await fetch(videoUrl, { signal: ac.signal });
      if (!res.ok) return [];
      // Reject an over-large body BEFORE buffering it into RAM (a true upfront guard, not post-hoc).
      const advertised = Number(res.headers.get('content-length') || 0);
      if (advertised > 200 * 1024 * 1024) return [];
      buf = Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(to);
    }
    if (!buf.length || buf.length > 200 * 1024 * 1024) return [];
    dir = await mkdtemp(join(tmpdir(), 'visqa-'));
    const src = join(dir, 'master.mp4');
    await writeFile(src, buf);

    // 2) probe duration from stderr (ffmpeg -i with no output prints the header + exits non-zero).
    let dur = 0;
    try {
      await exec(bin, ['-i', src], { maxBuffer: 1 << 24, timeout: 15_000 });
    } catch (e) {
      const log = String((e as { stderr?: string } | null)?.stderr ?? '');
      const dm = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
      if (dm) dur = Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]);
    }

    // 3) seek to evenly-spaced timestamps and grab one downscaled JPEG each.
    const n = Math.max(1, Math.min(8, Math.floor(count)));
    const frames: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const frac = (i + 0.5) / n; // spread; never the very first/last frame
      const t = dur > 0 ? (frac * dur).toFixed(2) : String(i);
      const out = join(dir, `f${i}.jpg`);
      try {
        await exec(bin, ['-y', '-ss', t, '-i', src, '-frames:v', '1', '-vf', 'scale=384:-1', '-q:v', '4', out], { maxBuffer: 1 << 24, timeout: 15_000 });
        const jpg = await readFile(out).catch(() => null);
        if (jpg && jpg.length) frames.push(jpg.toString('base64'));
      } catch {
        /* skip this frame — fail-open */
      }
    }
    return frames;
  } catch {
    return [];
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

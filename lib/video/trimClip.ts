/**
 * lib/video/trimClip.ts
 * =====================
 * Stage 2b — slice a window [startSec, startSec+durationSec] out of a clip with the
 * bundled ffmpeg-static, host it, return the URL. Used to cut the continuous 30s
 * HeyGen singer performance into per-scene 5s segments so each close-up scene shows
 * the singer singing the SAME timeline position as the final song → lips stay in sync.
 *
 * Fail-open: any miss (no ffmpeg, fetch/exec error, empty output) returns null and the
 * caller keeps the cinematic LTX clip for that scene.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

const exec = promisify(execFile);

export async function trimClip(videoUrl: string, startSec: number, durationSec: number): Promise<string | null> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin || !videoUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'trim-'));
    const out = join(dir, 'seg.mp4');
    // -ss before -i = fast input seek; re-encode (ultrafast) so the cut is frame-precise
    // and the output is uniform with the other segments the assembler normalises.
    await exec(bin, [
      '-y',
      '-ss', String(Math.max(0, startSec)),
      '-i', videoUrl,
      '-t', String(Math.max(1, durationSec)),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26, timeout: 90_000 });
    const buf = await readFile(out);
    if (buf.byteLength < 1_024) return null;
    const path = `films/heyseg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), 'video/mp4', 604_800)) ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[trim] failed (keeping the LTX clip for this scene):', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

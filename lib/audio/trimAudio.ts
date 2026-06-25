/**
 * lib/audio/trimAudio.ts
 * ======================
 * Trim a remote audio URL to its first `durationSec` seconds with the bundled
 * ffmpeg-static, re-host the clip to Supabase, return the signed URL.
 *
 * Why: the Udio gateway (chirp-v4-5) has NO duration param — it always returns a
 * full ~2–4 min song, ignoring the panel's 30/60/90s selection. This trims the
 * Udio result down to what the user actually asked for. Stream-copy (`-c copy`)
 * cuts on MP3 frame boundaries, so it's fast and lossless (no re-encode).
 *
 * Fail-open: any miss (no ffmpeg, fetch/exec error, empty output) returns null and
 * the caller keeps the full-length track — trimming must never break a generation.
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

export async function trimAudioToDuration(url: string, durationSec: number): Promise<string | null> {
  const bin = ffmpegStatic as unknown as string | null;
  const secs = Math.max(1, Math.round(durationSec));
  if (!bin || !url || !Number.isFinite(secs)) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'trim-audio-'));
    const out = join(dir, 'trimmed.mp3');
    // -t AFTER -i = limit OUTPUT to the first `secs` seconds; -c copy = stream copy
    // (no re-encode). ffmpeg reads the remote URL directly as the input.
    await exec(bin, ['-y', '-i', url, '-t', String(secs), '-c', 'copy', out], {
      maxBuffer: 1 << 26,
      timeout: 90_000,
    });
    const buf = await readFile(out);
    if (buf.byteLength < 1_024) return null;
    const path = `omni-music/udio-trim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), 'audio/mpeg', 604_800)) ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[trimAudio] failed (keeping full-length track):', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

import 'server-only';

/**
 * Voice clip → clean MP3 normalizer.
 *
 * WHY: MiniMax music-01's `voice_file` "must be a .wav or .mp3". But the browser
 * records WEBM/Opus (desktop) or MP4/AAC (iOS), and users upload M4A/OGG/etc. —
 * feeding those straight to MiniMax silently fails ("doesn't generate"). So before
 * the voice clone runs, we fetch the uploaded clip, transcode it to a clean mono
 * 44.1kHz MP3 with the bundled ffmpeg-static, re-host it to Supabase, and hand
 * MiniMax that. Fail-OPEN: any problem returns null and the caller keeps the
 * original URL (still works for clips that were already wav/mp3).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

const exec = promisify(execFile);

export async function transcodeVoiceToMp3(sourceUrl: string): Promise<string | null> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin || !sourceUrl) return null;
  let dir = '';
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 25_000);
    const r = await fetch(sourceUrl, { signal: ac.signal }).finally(() => clearTimeout(to));
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.byteLength || buf.byteLength > 25 * 1024 * 1024) return null;

    dir = await mkdtemp(join(tmpdir(), 'voice_'));
    const inPath = join(dir, 'in');
    const outPath = join(dir, 'out.mp3');
    await writeFile(inPath, buf);
    // ffmpeg auto-detects the input container; output a clean mono 44.1kHz MP3.
    await exec(bin, ['-y', '-i', inPath, '-ac', '1', '-ar', '44100', '-b:a', '192k', '-f', 'mp3', outPath], { timeout: 60_000 });
    const mp3 = await readFile(outPath);
    if (!mp3.byteLength) return null;

    const path = `omni-music-voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    return (await uploadAndSign('uploads', path, mp3.toString('base64'), 'audio/mpeg', 7200)) || null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

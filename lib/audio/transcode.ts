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
    // Probe TRUE duration by decoding to null (ffmpeg-static ships no ffprobe, and the
    // browser's MediaRecorder webm has NO duration in its header — so `-i` alone reports
    // N/A. Decoding emits progress lines whose LAST `time=` is the real length).
    const parseDur = (s: string): number => {
      const all = [...s.matchAll(/time=\s*(\d+):(\d+):([\d.]+)/g)];
      if (all.length) { const m = all[all.length - 1]!; return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]); }
      const d = s.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
    };
    let dur = 0;
    try {
      const { stderr } = await exec(bin, ['-i', inPath, '-f', 'null', '-'], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
      dur = parseDur(String(stderr || ''));
    } catch (e) {
      dur = parseDur(String((e as { stderr?: string })?.stderr || ''));
    }
    // MiniMax needs the voice LONGER than 15s. Loop a short clip (or one whose length we
    // couldn't read) up to a clean ~18s so even a brief recording still clones; otherwise
    // cap very long clips at 30s. Output is a clean mono 44.1kHz MP3.
    const args = ['-y'];
    const needsLoop = !(dur >= 15.5); // short OR unknown → loop past the 15s floor
    if (needsLoop) args.push('-stream_loop', dur > 0 ? String(Math.ceil(18 / dur)) : '24');
    args.push('-i', inPath, '-ac', '1', '-ar', '44100', '-b:a', '192k');
    if (needsLoop) args.push('-t', '18');
    else if (dur > 30) args.push('-t', '30');
    args.push('-f', 'mp3', outPath);
    await exec(bin, args, { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
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

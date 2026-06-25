/**
 * lib/pipeline/compositing/musicVideoGraphics.ts
 * ==============================================
 * The "Graphics Agent" for a music video: a fail-open pass that layers BEAUTIFUL
 * motion graphics over the finished master —
 *   • a music-synced EQUALIZER (ffmpeg showfreqs) along the bottom,
 *   • an animated TITLE CARD (theme + LIVE SESSION) that fades in over the intro,
 *   • an animated LOWER-THIRD (the MTV music-bug) during the performance.
 *
 * Text is rasterised SVG→PNG (resvg) because Vercel's ffmpeg has no libfreetype
 * (`drawtext` renders tofu); the equalizer is a pure ffmpeg filter so it works
 * everywhere. Strictly fail-open: any miss returns null and the caller keeps the
 * ungraphic master — graphics can never break a good render.
 */
import 'server-only';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { renderTitleCardPng, renderMusicBugPng, renderSubtitleCardPng, splitIntoSubtitleLines, subtitleStripHeight, type MusicBug } from './ffmpeg-overlay';

const exec = (bin: string, args: string[], timeoutMs = 240_000): Promise<{ ok: boolean; err: string }> =>
  new Promise((resolve) => {
    const ff = spawn(bin, args);
    let err = '';
    const t = setTimeout(() => { try { ff.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('close', (code) => { clearTimeout(t); resolve({ ok: code === 0, err: err.slice(-700) }); });
    ff.on('error', (e) => { clearTimeout(t); resolve({ ok: false, err: `spawn: ${e.message}` }); });
  });

/** Probe width, height, duration and whether the file has an audio stream. */
async function probe(bin: string, path: string): Promise<{ w: number; h: number; dur: number; hasAudio: boolean }> {
  const out = await new Promise<string>((resolve) => {
    const ff = spawn(bin, ['-i', path]);
    let s = '';
    ff.stderr.on('data', (d) => { s += d.toString(); });
    ff.on('close', () => resolve(s));
    ff.on('error', () => resolve(s));
  });
  const dim = out.match(/,\s*(\d{2,5})x(\d{2,5})/);
  const dur = out.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  return {
    w: dim ? parseInt(dim[1]!, 10) : 1080,
    h: dim ? parseInt(dim[2]!, 10) : 1920,
    dur: dur ? (+dur[1]! * 3600 + +dur[2]! * 60 + +dur[3]!) : 30,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(out),
  };
}

export interface MusicVideoGraphicsOpts {
  /** Big intro title (theme/track). */
  title?: string;
  /** Accent sub-line under the title (default "LIVE SESSION" / "ცოცხალი შესრულება"). */
  subtitle?: string;
  lang?: 'ka' | 'en' | 'ru';
  /** The MTV-style lower-third info bug (artist/track/theme). */
  musicBug?: MusicBug | null;
  /** Seconds of cinematic intro before the performance — title shows over this,
   *  equalizer + lower-third start after it. Defaults to ~10s (two intro scenes). */
  introSec?: number;
  /** Spoken dialogue → burned, reference-style subtitle cards distributed across the
   *  timeline (white BOLD caps + heavy black outline). Empty/absent → no subtitles. */
  dialogue?: string;
}

/**
 * Layer motion graphics over `videoUrl` → a new hosted MP4 URL, or null (fail-open).
 */
export async function enhanceMusicVideoGraphics(videoUrl: string, opts: MusicVideoGraphicsOpts = {}): Promise<string | null> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin || !videoUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'mvgfx-'));
    const inPath = join(dir, 'in.mp4');
    const res = await fetch(videoUrl);
    if (!res.ok) return null;
    await writeFile(inPath, Buffer.from(await res.arrayBuffer()));
    const { w, h, dur, hasAudio } = await probe(bin, inPath);
    const introSec = Math.max(0, Math.min(opts.introSec ?? 10, Math.max(0, dur - 6)));

    // Render the text PNGs (resvg). Either can be null → that layer is skipped.
    const subtitle = opts.subtitle ?? (opts.lang === 'ka' ? 'ცოცხალი შესრულება' : opts.lang === 'ru' ? 'ЖИВОЕ ВЫСТУПЛЕНИЕ' : 'LIVE SESSION');
    const [titlePng, bugPng] = await Promise.all([
      opts.title ? renderTitleCardPng({ title: opts.title, subtitle, lang: opts.lang }, w, h) : Promise.resolve(null),
      opts.musicBug ? renderMusicBugPng(opts.musicBug, w, h) : Promise.resolve(null),
    ]);
    // DIALOGUE SUBTITLES — split into ≤3-word cards, rasterise each (resvg). Keep only
    // the cards that rendered, so a single failed glyph never aborts the whole pass.
    const subLines = opts.dialogue ? splitIntoSubtitleLines(opts.dialogue) : [];
    const subPngs = subLines.length
      ? (await Promise.all(subLines.map((l) => renderSubtitleCardPng(l, w, h)))).filter((b): b is Buffer => !!b)
      : [];
    if (!titlePng && !bugPng && !hasAudio && subPngs.length === 0) return null; // nothing to add

    // Image overlays MUST be looped (`-loop 1`) so they become a continuous stream —
    // otherwise the single PNG frame sits at t=0, the time-based alpha fade renders it
    // fully transparent, and the title/lower-third never appear.
    const inputs: string[] = ['-y', '-i', inPath];
    let titleIdx = -1; let bugIdx = -1; let nextIdx = 1;
    if (titlePng) { const p = join(dir, 'title.png'); await writeFile(p, titlePng); inputs.push('-loop', '1', '-i', p); titleIdx = nextIdx++; }
    if (bugPng) { const p = join(dir, 'bug.png'); await writeFile(p, bugPng); inputs.push('-loop', '1', '-i', p); bugIdx = nextIdx++; }
    const subIdxs: number[] = [];
    for (let i = 0; i < subPngs.length; i += 1) {
      const p = join(dir, `sub${i}.png`); await writeFile(p, subPngs[i]!); inputs.push('-loop', '1', '-i', p); subIdxs.push(nextIdx++);
    }

    // Build the filtergraph. Each layer is optional; `cur` tracks the live video label.
    const eqH = Math.round(h * 0.10);
    const parts: string[] = [];
    let cur = '0:v';
    if (hasAudio) {
      parts.push(`[0:a]aformat=channel_layouts=stereo,showfreqs=s=${w}x${eqH}:mode=bar:ascale=sqrt:fscale=log:colors=0xFFC857|0xFF8C42[eqr]`);
      parts.push(`[eqr]format=rgba,colorchannelmixer=aa=0.85[eq]`);
      parts.push(`[${cur}][eq]overlay=0:${h - eqH}:format=auto:enable='gte(t,${introSec.toFixed(1)})'[veq]`);
      cur = 'veq';
    }
    if (titleIdx >= 0) {
      const outT = (introSec - 1).toFixed(1);
      parts.push(`[${titleIdx}:v]format=rgba,fade=t=in:st=1.5:d=0.7:alpha=1,fade=t=out:st=${outT}:d=0.8:alpha=1[title]`);
      parts.push(`[${cur}][title]overlay=0:0:format=auto:enable='lt(t,${introSec.toFixed(1)})'[vtitle]`);
      cur = 'vtitle';
    }
    if (bugIdx >= 0) {
      const inB = (introSec + 0.5).toFixed(1); const outB = Math.max(introSec + 2, dur - 2.5).toFixed(1);
      parts.push(`[${bugIdx}:v]format=rgba,fade=t=in:st=${inB}:d=0.6:alpha=1,fade=t=out:st=${outB}:d=0.7:alpha=1[bug]`);
      parts.push(`[${cur}][bug]overlay=0:0:format=auto:enable='gte(t,${introSec.toFixed(1)})'[vbug]`);
      cur = 'vbug';
    }
    // DIALOGUE SUBTITLES — burned LAST (on top of eq/title/bug), distributed evenly
    // across the timeline. Hard-cut in/out via `enable='between()'` (no alpha fade) —
    // both cheaper (no full-stream fade pass → keeps the graphics pass in budget) AND
    // a closer match to the reference video's snappy burned captions.
    if (subIdxs.length) {
      const per = dur / subIdxs.length;
      const subY = h - subtitleStripHeight(h); // strip sits at the bottom of the frame
      subIdxs.forEach((idx, i) => {
        const st = +(i * per).toFixed(2);
        const en = +(Math.min(dur, (i + 1) * per) - 0.12).toFixed(2);
        parts.push(`[${idx}:v]format=rgba[sub${i}]`);
        parts.push(`[${cur}][sub${i}]overlay=0:${subY}:format=auto:enable='between(t,${st},${en})'[vsub${i}]`);
        cur = `vsub${i}`;
      });
    }
    parts.push(`[${cur}]format=yuv420p[vout]`);

    const outPath = join(dir, 'out.mp4');
    const args = [
      ...inputs,
      '-filter_complex', parts.join(';'),
      '-map', '[vout]', '-map', '0:a?',
      // The looped image inputs are infinite — bound the output to the master's length.
      '-t', String(Math.max(1, Math.ceil(dur))),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', outPath,
    ];
    const r = await exec(bin, args);
    if (!r.ok) { console.warn('[mv-graphics] ffmpeg failed:', r.err); return null; }
    const buf = await readFile(outPath);
    if (buf.byteLength < 4096) return null;
    const path = `films/mvgfx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), 'video/mp4', 604_800)) ?? null;
  } catch (err) {
    console.warn('[mv-graphics] error:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

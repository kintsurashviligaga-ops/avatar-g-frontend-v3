/**
 * lib/video/omniEditInput.ts — the uploaded video, made ready for Gemini Omni Flash's edit / extend (app/api/video/omni-edit).
 * Server-only.
 *
 * One ffmpeg pass, before anything is charged: the video is fetched through the public-fetch guard (lib/video/ffmpegExec,
 * never by ffmpeg itself), measured, and re-encoded to what the 2026-10-25 probe measured — H.264 / AAC mp4, 24 fps, the
 * short side at most 720 px (never upscaled), the phone's rotation applied. A 1080p or 4K input's token rate was never
 * measured, so nothing larger is sent. The result travels inline (Vertex takes up to 20 MB inline); 10 s at 720p is a few MB.
 *
 * Fail-closed and free: an unreadable file, a video over 10 s or one too short comes back as a reason, and the route
 * refuses it before the slot, the row and the charge.
 */
import 'server-only';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { ffmpegExec } from '@/lib/video/ffmpegExec';
import { OMNI_EDIT_INPUT_MAX_SEC, OMNI_EDIT_INPUT_SLACK_SEC } from './omniEdit';

/** Under Vertex's 20 MB inline ceiling, with room for the base64 request around it. */
export const OMNI_EDIT_INLINE_MAX_BYTES = 18 * 1024 * 1024;
const TRANSCODE_TIMEOUT_MS = 40_000;

export type OmniEditInput =
  | { ok: true; base64: string; mimeType: 'video/mp4'; seconds: number; width: number; height: number; bytes: number }
  | { ok: false; reason: 'unavailable' | 'unreadable' | 'too_long' | 'too_large'; seconds?: number };

const clock = (h: string, m: string, s: string): number => Number(h) * 3600 + Number(m) * 60 + Number(s);

/** The input's own length from ffmpeg's log (`Duration: 00:00:05.04`); null when it says N/A. */
export function inputSecondsFromLog(log: string): number | null {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(log);
  const sec = m ? clock(m[1]!, m[2]!, m[3]!) : NaN;
  return Number.isFinite(sec) && sec > 0 ? sec : null;
}

/** How much ffmpeg wrote, from its last progress line (`time=00:00:05.00`). */
export function writtenSecondsFromLog(log: string): number | null {
  const all = [...log.matchAll(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
  const last = all[all.length - 1];
  const sec = last ? clock(last[1]!, last[2]!, last[3]!) : NaN;
  return Number.isFinite(sec) && sec > 0 ? sec : null;
}

/** The frame ffmpeg wrote (after rotation and scaling), from the `Output #0` section of its log. */
export function outputFrameFromLog(log: string): { width: number; height: number } | null {
  const out = log.slice(Math.max(0, log.indexOf('Output #0')));
  const m = /Stream #0:\d+.*?Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(out);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** The re-encode, as ffmpeg arguments (pure, so the shape is tested without a binary). */
export function omniEditTranscodeArgs(input: string, out: string): string[] {
  return [
    '-y', '-i', input,
    // A video over 10 s is refused once measured; reading past 10.5 s would only cost the lambda time.
    '-t', String(OMNI_EDIT_INPUT_MAX_SEC + 0.5),
    '-map', '0:v:0', '-map', '0:a:0?',
    // The short side at most 720 px, even, never upscaled; 24 fps (the probe's input).
    '-vf', "fps=24,scale='if(gte(iw,ih),-2,trunc(min(720,iw)/2)*2)':'if(gte(iw,ih),trunc(min(720,ih)/2)*2,-2)',setsar=1",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000',
    '-movflags', '+faststart', out,
  ];
}

/** Fetch, measure and re-encode the caller's video (`url`: one of our signed URLs, already checked to be theirs). */
export async function prepareOmniEditInput(url: string): Promise<OmniEditInput> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) return { ok: false, reason: 'unavailable' };
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'omni-edit-'));
    const out = join(dir, 'input.mp4');
    let log = '';
    try {
      const r = await ffmpegExec(bin, omniEditTranscodeArgs(url, out), { maxBuffer: 1 << 26, timeout: TRANSCODE_TIMEOUT_MS });
      log = String(r.stderr ?? '');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[video.omni-edit] transcode failed:', err instanceof Error ? err.message.slice(0, 300) : String(err));
      return { ok: false, reason: 'unreadable' };
    }
    const seconds = inputSecondsFromLog(log) ?? writtenSecondsFromLog(log);
    if (seconds === null) return { ok: false, reason: 'unreadable' };
    if (seconds > OMNI_EDIT_INPUT_MAX_SEC + OMNI_EDIT_INPUT_SLACK_SEC) return { ok: false, reason: 'too_long', seconds };
    const frame = outputFrameFromLog(log);
    const buf = await readFile(out);
    if (buf.byteLength < 1_024 || !frame) return { ok: false, reason: 'unreadable' };
    if (buf.byteLength > OMNI_EDIT_INLINE_MAX_BYTES) return { ok: false, reason: 'too_large', seconds };
    return { ok: true, base64: buf.toString('base64'), mimeType: 'video/mp4', seconds, width: frame.width, height: frame.height, bytes: buf.byteLength };
  } catch {
    return { ok: false, reason: 'unavailable' };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

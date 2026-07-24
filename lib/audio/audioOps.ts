/**
 * lib/audio/audioOps.ts — DETERMINISTIC audio edits for the AI Audio Studio (ffmpeg-static, no AI).
 *
 * `audioProcess` applies pitch shift (semitones), speed (playback multiplier), a trim window, and fade in/out in
 * ONE ffmpeg pass, then re-hosts the result (m4a/AAC). Same fail-open plumbing as lib/video/surgicalOps.
 *
 * NOTE (Vercel): the importing route MUST be in next.config.js outputFileTracingIncludes with ffmpeg-static.
 */
import 'server-only';
import { reportError } from '@/lib/observability/report-error';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

const exec = promisify(execFile);
const WEEK_SEC = 604_800;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const num = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);

/** atempo only accepts 0.5–2.0 per instance, so chain factors for the full range. */
function atempoChain(factor: number): string[] {
  let f = clamp(factor, 0.25, 4);
  const out: string[] = [];
  while (f > 2.0 + 1e-6) { out.push('atempo=2.0'); f /= 2.0; }
  while (f < 0.5 - 1e-6) { out.push('atempo=0.5'); f /= 0.5; }
  if (Math.abs(f - 1) > 1e-3) out.push(`atempo=${f.toFixed(4)}`);
  return out;
}

export interface AudioProcessParams {
  /** pitch shift in semitones, -12..12 (0 = none) */ semitones?: number;
  /** speed multiplier, 0.5..2 (1 = none) */ speed?: number;
  /** trim start (s) */ trimStart?: number;
  /** trim end (s); <= start ⇒ no trim */ trimEnd?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  /** loudness gain multiplier, 0..2 (1 = unchanged, 2 = +6dB doubled) */ volume?: number;
  /** full track length (s) — used to position the out-fade when there's no trim */ durationSec?: number;
}

export async function audioProcess(audioUrl: string, p: AudioProcessParams): Promise<string | null> {
  const bin = (ffmpegStatic as unknown as string | null) ?? null;
  if (!bin || !audioUrl) return null;

  const semis = clamp(num(p.semitones, 0), -12, 12);
  const speed = clamp(num(p.speed, 1), 0.5, 2);
  const f = Math.pow(2, semis / 12);
  const ts = Math.max(0, num(p.trimStart, 0));
  const teRaw = num(p.trimEnd, 0);
  const hasTrim = teRaw > ts + 0.05;
  const trimDur = hasTrim ? teRaw - ts : Math.max(0.1, num(p.durationSec, 0));
  const outDur = speed > 0 ? trimDur / speed : trimDur; // net speed == `speed` (pitch's asetrate is compensated)
  const fi = Math.max(0, num(p.fadeInSec, 0));
  const fo = Math.max(0, num(p.fadeOutSec, 0));
  const vol = clamp(num(p.volume, 1), 0, 2);

  const af: string[] = [];
  if (hasTrim) af.push(`atrim=start=${ts.toFixed(3)}:end=${teRaw.toFixed(3)}`, 'asetpts=PTS-STARTPTS');
  if (Math.abs(f - 1) > 1e-3) af.push(`asetrate=44100*${f.toFixed(6)}`, 'aresample=44100');
  // Net tempo = user speed / f (compensates the asetrate speed-up from the pitch shift).
  af.push(...atempoChain(speed / f));
  if (Math.abs(vol - 1) > 1e-3) af.push(`volume=${vol.toFixed(3)}`);
  if (fi > 0) af.push(`afade=t=in:st=0:d=${fi}`);
  if (fo > 0 && outDur > 0.1) af.push(`afade=t=out:st=${Math.max(0, outDur - fo).toFixed(3)}:d=${fo}`);

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'audio-'));
    const out = join(dir, 'out.m4a');
    const args = ['-y', '-i', audioUrl, '-vn'];
    if (af.length) args.push('-af', af.join(','));
    args.push('-c:a', 'aac', '-b:a', '192k', out);
    await exec(bin, args, { maxBuffer: 1 << 26, timeout: 180_000 });
    const buf = await readFile(out);
    if (buf.byteLength < 256) return null;
    const path = `audio-edits/proc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), 'audio/mp4', WEEK_SEC)) ?? null;
  } catch (err) {
    console.warn('[audio/process] failed:', err instanceof Error ? err.message : err);
    reportError(err, { where: 'audioOps.process' });
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * lib/video/surgicalOps.ts — DETERMINISTIC (non-generative) editing ops for the Surgical Editor.
 * =============================================================================================
 * Every op runs the bundled `ffmpeg-static` binary on a media URL and hosts the result — the exact
 * proven plumbing of lib/video/trimClip.ts (temp dir → execFile ffmpeg → uploadAndSign → cleanup).
 * These transforms NEVER fabricate frames: they crop, re-grade, fade, or split existing pixels only.
 *
 * Fail-open by construction: any miss (no ffmpeg binary in the lambda, fetch/exec error, empty output)
 * returns null and the caller reports a clean error — nothing throws.
 *
 * NOTE (Vercel): the route that imports these MUST be listed in next.config.js outputFileTracingIncludes
 * with './node_modules/ffmpeg-static/**' or the binary is absent in the lambda and every op ENOENTs.
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
const WEEK_SEC = 604_800;

function bin(): string | null {
  return (ffmpegStatic as unknown as string | null) ?? null;
}

async function host(buf: Buffer, tag: string, ext: 'mp4' | 'm4a', contentType: string): Promise<string | null> {
  if (buf.byteLength < 512) return null;
  const path = `edits/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return (await uploadAndSign('uploads', path, buf.toString('base64'), contentType, WEEK_SEC)) ?? null;
}

/** Common libx264 encode tail — uniform, faststart, frame-precise (re-encode, not stream-copy). */
const VIDEO_TAIL = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];

/**
 * CROP to an exact pixel rectangle. Coordinates are clamped to even integers (yuv420p needs even
 * dimensions). Only the selected pixels survive — zero generative fill.
 */
export async function cropClip(videoUrl: string, x: number, y: number, w: number, h: number): Promise<string | null> {
  const b = bin();
  if (!b || !videoUrl) return null;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const cw = even(w), ch = even(h), cx = Math.max(0, Math.round(x)), cy = Math.max(0, Math.round(y));
  if (!(cw > 0 && ch > 0)) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'crop-'));
    const out = join(dir, 'crop.mp4');
    await exec(b, ['-y', '-i', videoUrl, '-vf', `crop=${cw}:${ch}:${cx}:${cy}`, ...VIDEO_TAIL, out], { maxBuffer: 1 << 26, timeout: 120_000 });
    return await host(await readFile(out), 'crop', 'mp4', 'video/mp4');
  } catch (err) {
    console.warn('[surgical/crop] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export interface GradeParams {
  /** 0–200 (%), 100 = neutral */ saturation?: number;
  /** 0–200 (%), 100 = neutral */ contrast?: number;
  /** 0–200 (%), 100 = neutral */ brightness?: number;
  /** -100..100, 0 = neutral (positive = warmer) */ temperature?: number;
}

const numFinite = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** eq + colortemperature filter strings for a grade (shared by gradeClip + the batch renderers). */
function buildGradeFilters(g?: GradeParams): string[] {
  if (!g) return [];
  const sat = Math.max(0, numFinite(g.saturation, 100) / 100);
  const con = Math.max(0, numFinite(g.contrast, 100) / 100);
  const bri = Math.max(-1, Math.min(1, (numFinite(g.brightness, 100) - 100) / 100));
  const t = Math.max(-100, Math.min(100, numFinite(g.temperature, 0)));
  const out = [`eq=saturation=${sat.toFixed(3)}:contrast=${con.toFixed(3)}:brightness=${bri.toFixed(3)}`];
  if (t !== 0) out.push(`colortemperature=temperature=${Math.round(6500 - t * 25)}`);
  return out;
}

/** A crop filter string for a bounds rect (even dims, clamped ≥0), or null when there's no crop. */
function buildCropFilter(crop?: { x: number; y: number; w: number; h: number } | null): string | null {
  if (!crop || !(crop.w > 0) || !(crop.h > 0)) return null;
  return `crop=${even(crop.w)}:${even(crop.h)}:${Math.max(0, Math.round(crop.x))}:${Math.max(0, Math.round(crop.y))}`;
}

/**
 * COLOR GRADE via the `eq` filter (saturation/contrast/brightness) plus `colortemperature` for warmth.
 * Slider units (0–200%, temp -100..100) map onto ffmpeg's native ranges. Deterministic per-pixel math —
 * no new content is invented, so the graded frame is the SAME frame with a colour transform applied.
 */
export async function gradeClip(videoUrl: string, p: GradeParams): Promise<string | null> {
  const b = bin();
  if (!b || !videoUrl) return null;
  // Finite guard — the route coerces with Number(...), so an OMITTED field arrives as NaN, and `?? default`
  // does NOT catch NaN. Without this a single missing slider NaNs the whole eq filter string → ffmpeg errors.
  const num = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);
  const sat = Math.max(0, num(p.saturation, 100) / 100);            // eq saturation: 1 = neutral
  const con = Math.max(0, num(p.contrast, 100) / 100);              // eq contrast:   1 = neutral
  const bri = Math.max(-1, Math.min(1, (num(p.brightness, 100) - 100) / 100)); // eq brightness: 0 neutral, [-1,1]
  const t = Math.max(-100, Math.min(100, num(p.temperature, 0)));
  const kelvin = Math.round(6500 - t * 25); // +100 → 4000K (warm), -100 → 9000K (cool)
  const filters = [`eq=saturation=${sat.toFixed(3)}:contrast=${con.toFixed(3)}:brightness=${bri.toFixed(3)}`];
  if (t !== 0) filters.push(`colortemperature=temperature=${kelvin}`);
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'grade-'));
    const out = join(dir, 'grade.mp4');
    await exec(b, ['-y', '-i', videoUrl, '-vf', filters.join(','), ...VIDEO_TAIL, out], { maxBuffer: 1 << 26, timeout: 120_000 });
    return await host(await readFile(out), 'grade', 'mp4', 'video/mp4');
  } catch (err) {
    console.warn('[surgical/grade] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * DETACH audio: split the visual layer from the audio layer. Returns the muted video (`-an`, stream-copied
 * so the picture is byte-for-byte untouched) and the extracted audio track (m4a). Either may be null (e.g.
 * a silent source yields no audio track).
 */
export async function detachAudio(videoUrl: string): Promise<{ video: string | null; audio: string | null }> {
  const b = bin();
  if (!b || !videoUrl) return { video: null, audio: null };
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'detach-'));
    const vOut = join(dir, 'muted.mp4');
    const aOut = join(dir, 'audio.m4a');
    // Muted video: copy the video stream verbatim (lossless), drop audio.
    await exec(b, ['-y', '-i', videoUrl, '-an', '-c:v', 'copy', '-movflags', '+faststart', vOut], { maxBuffer: 1 << 26, timeout: 120_000 });
    // Extracted audio (best-effort — a silent source will error, which we swallow to null).
    const audio = await exec(b, ['-y', '-i', videoUrl, '-vn', '-c:a', 'aac', '-b:a', '192k', aOut], { maxBuffer: 1 << 26, timeout: 120_000 })
      .then(async () => host(await readFile(aOut), 'audio', 'm4a', 'audio/mp4'))
      .catch(() => null);
    const video = await host(await readFile(vOut), 'muted', 'mp4', 'video/mp4');
    return { video, audio };
  } catch (err) {
    console.warn('[surgical/detach] failed:', err instanceof Error ? err.message : err);
    return { video: null, audio: null };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export interface FadeParams {
  /** fade-in duration (s) from the start */ fadeInSec?: number;
  /** fade-out duration (s) at the end */ fadeOutSec?: number;
  /** total clip duration (s) — needed to place the out-fade */ durationSec: number;
}

/**
 * FADE in/out on the picture (`fade`) and the audio (`afade`). Boundary effect only — the interior frames
 * are untouched. `durationSec` positions the out-fade (client passes the known clip length).
 */
export async function fadeClip(videoUrl: string, p: FadeParams): Promise<string | null> {
  const b = bin();
  if (!b || !videoUrl) return null;
  const fi = Math.max(0, p.fadeInSec ?? 0);
  const fo = Math.max(0, p.fadeOutSec ?? 0);
  const total = Math.max(0.1, p.durationSec);
  if (fi <= 0 && fo <= 0) return null;
  const vf: string[] = [];
  const af: string[] = [];
  if (fi > 0) { vf.push(`fade=t=in:st=0:d=${fi}`); af.push(`afade=t=in:st=0:d=${fi}`); }
  if (fo > 0) { const st = Math.max(0, total - fo); vf.push(`fade=t=out:st=${st}:d=${fo}`); af.push(`afade=t=out:st=${st}:d=${fo}`); }
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'fade-'));
    const out = join(dir, 'fade.mp4');
    await exec(b, ['-y', '-i', videoUrl, '-vf', vf.join(','), '-af', af.join(','), ...VIDEO_TAIL, out], { maxBuffer: 1 << 26, timeout: 120_000 });
    return await host(await readFile(out), 'fade', 'mp4', 'video/mp4');
  } catch (err) {
    console.warn('[surgical/fade] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── BATCH RENDER (Premiere-style export) ────────────────────────────────────────────────────────────────
// The non-linear editor accumulates every edit into a client-side draft and calls the server ONCE. These render
// the whole draft in a SINGLE ffmpeg pass — crop → colour grade → fade, plus (video) audio muting of the ranges
// the user split-and-muted. No per-action server round-trips.

export interface DraftMutedRange { start: number; end: number }
/** One timeline segment in the FINAL sequence order (delete = omitted, reorder = array order changes). */
export interface DraftSegment { start: number; end: number; muted: boolean }
export interface RenderDraft {
  grade?: GradeParams;
  fadeInSec?: number;
  fadeOutSec?: number;
  crop?: { x: number; y: number; w: number; h: number } | null;
  /** Time ranges (s) to silence — from timeline segments the user muted. */
  mutedRanges?: DraftMutedRange[];
  /** The ordered export sequence. When it isn't the pristine full clip (deleted/reordered), it is concat-rendered. */
  segments?: DraftSegment[];
  /** Total clip length (s) — positions the out-fade. */
  durationSec?: number;
}

/** Is the sequence the pristine, in-order, gap-free full clip? If so, no concat is needed (structure only — mute
 *  is handled by the cheaper mutedRanges path). Reorder/delete/gaps make it non-trivial → concat render. */
function sequenceIsTrivial(segs: DraftSegment[] | undefined, total: number): boolean {
  if (!segs || segs.length === 0) return true;
  let t = 0;
  for (const s of segs) {
    if (!(s.end > s.start)) return false;
    if (Math.abs(s.start - t) > 0.06) return false; // a gap or out-of-order jump
    t = s.end;
  }
  return Math.abs(t - Math.max(0.1, total)) < 0.2; // covers the whole source
}

/** Render a full video draft in one pass: crop → grade → fade (video) + afade + per-range mute (audio). */
export async function renderVideoDraft(videoUrl: string, d: RenderDraft): Promise<string | null> {
  const b = bin();
  if (!b || !videoUrl) return null;
  const total = Math.max(0.1, numFinite(d.durationSec, 0));

  // Deleted/reordered segments → the sequence is no longer the pristine clip → render via trim+concat.
  if (d.segments && d.segments.length > 0 && !sequenceIsTrivial(d.segments, total)) {
    return renderSequenceDraft(videoUrl, d.segments, d);
  }

  const fi = Math.max(0, numFinite(d.fadeInSec, 0));
  const fo = Math.max(0, numFinite(d.fadeOutSec, 0));

  const vf: string[] = [];
  const cropF = buildCropFilter(d.crop);
  if (cropF) vf.push(cropF);
  vf.push(...buildGradeFilters(d.grade));
  if (fi > 0) vf.push(`fade=t=in:st=0:d=${fi}`);
  if (fo > 0 && total > 0.1) vf.push(`fade=t=out:st=${Math.max(0, total - fo).toFixed(3)}:d=${fo}`);

  const af: string[] = [];
  if (fi > 0) af.push(`afade=t=in:st=0:d=${fi}`);
  if (fo > 0 && total > 0.1) af.push(`afade=t=out:st=${Math.max(0, total - fo).toFixed(3)}:d=${fo}`);
  // Muted ranges come from muted segments (trivial sequence) or an explicit list.
  const segMuted = (d.segments ?? []).filter((s) => s.muted).map((s) => ({ start: s.start, end: s.end }));
  const muted = (segMuted.length ? segMuted : (d.mutedRanges ?? [])).filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  if (muted.length) {
    // Single volume filter, enabled (→ 0) whenever t is inside ANY muted range. The commas inside between()
    // are protected by the surrounding single quotes so ffmpeg doesn't read them as filter separators.
    const expr = muted.map((r) => `between(t,${Math.max(0, r.start).toFixed(3)},${r.end.toFixed(3)})`).join('+');
    af.push(`volume=0:enable='${expr}'`);
  }

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'render-'));
    const out = join(dir, 'render.mp4');
    const args = ['-y', '-i', videoUrl];
    if (vf.length) args.push('-vf', vf.join(','));
    if (af.length) args.push('-af', af.join(','));
    args.push(...VIDEO_TAIL, out);
    await exec(b, args, { maxBuffer: 1 << 26, timeout: 180_000 });
    return await host(await readFile(out), 'render', 'mp4', 'video/mp4');
  } catch (err) {
    console.warn('[surgical/renderVideo] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Render a NON-trivial timeline sequence (segments deleted/reordered) with a single filter_complex: trim each
 * kept segment (+ mute its audio if flagged), concat in the given order, then apply crop → grade → fade globally.
 * The exported clip length = Σ kept-segment durations. One ffmpeg pass, no intermediate files.
 */
async function renderSequenceDraft(videoUrl: string, segments: DraftSegment[], d: RenderDraft): Promise<string | null> {
  const b = bin();
  if (!b) return null;
  const segs = segments.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
  if (!segs.length) return null;
  const total = segs.reduce((acc, s) => acc + (s.end - s.start), 0);
  const fi = Math.max(0, numFinite(d.fadeInSec, 0));
  const fo = Math.max(0, numFinite(d.fadeOutSec, 0));

  const parts: string[] = [];
  const concatInputs: string[] = [];
  segs.forEach((s, i) => {
    const st = Math.max(0, s.start).toFixed(3);
    const en = Math.max(s.start + 0.04, s.end).toFixed(3);
    parts.push(`[0:v]trim=start=${st}:end=${en},setpts=PTS-STARTPTS[v${i}]`);
    const a = [`atrim=start=${st}:end=${en}`, 'asetpts=PTS-STARTPTS'];
    if (s.muted) a.push('volume=0');
    parts.push(`[0:a]${a.join(',')}[a${i}]`);
    concatInputs.push(`[v${i}][a${i}]`);
  });
  parts.push(`${concatInputs.join('')}concat=n=${segs.length}:v=1:a=1[cv][ca]`);

  const post: string[] = [];
  const cropF = buildCropFilter(d.crop);
  if (cropF) post.push(cropF);
  post.push(...buildGradeFilters(d.grade));
  if (fi > 0) post.push(`fade=t=in:st=0:d=${fi}`);
  if (fo > 0 && total > 0.1) post.push(`fade=t=out:st=${Math.max(0, total - fo).toFixed(3)}:d=${fo}`);
  parts.push(`[cv]${post.length ? post.join(',') : 'null'}[outv]`);

  const apost: string[] = [];
  if (fi > 0) apost.push(`afade=t=in:st=0:d=${fi}`);
  if (fo > 0 && total > 0.1) apost.push(`afade=t=out:st=${Math.max(0, total - fo).toFixed(3)}:d=${fo}`);
  parts.push(`[ca]${apost.length ? apost.join(',') : 'anull'}[outa]`);

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'seq-'));
    const out = join(dir, 'seq.mp4');
    await exec(b, [
      '-y', '-i', videoUrl, '-filter_complex', parts.join(';'), '-map', '[outv]', '-map', '[outa]', ...VIDEO_TAIL, out,
    ], { maxBuffer: 1 << 26, timeout: 240_000 });
    return await host(await readFile(out), 'seq', 'mp4', 'video/mp4');
  } catch (err) {
    console.warn('[surgical/renderSequence] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** One entry in a MULTI-CLIP sequence — references a source by index, with its own trim window + mute. */
export interface ConcatEntry { src: number; start: number; end: number; muted: boolean }

/**
 * MULTI-CLIP concat — stitch trimmed windows of SEVERAL distinct sources into one clip. Each entry is trimmed
 * from its own input, scaled + letterbox-padded to a UNIFORM target resolution (so mixed formats/resolutions
 * line up), muted if flagged, then concatenated in order; grade + fade apply to the composed result.
 * One ffmpeg pass, N inputs, one filter_complex. (Crop is a single-source op and is intentionally skipped here.)
 *
 * NOTE: assumes each source has an audio stream (concat with a=1). A silent source will fail the concat cleanly
 * (→ null); pin audio-bearing clips, or split within one clip (single-source path) if a clip has no audio.
 */
export async function renderConcat(sources: string[], seq: ConcatEntry[], d: RenderDraft, targetW: number, targetH: number): Promise<string | null> {
  const b = bin();
  if (!b) return null;
  const srcs = sources.filter((s) => typeof s === 'string' && s.length > 0);
  const entries = seq.filter((e) => Number.isInteger(e.src) && e.src >= 0 && e.src < srcs.length && e.end > e.start);
  if (!srcs.length || !entries.length) return null;
  const W = even(targetW > 0 ? targetW : 1280);
  const H = even(targetH > 0 ? targetH : 720);
  const total = entries.reduce((a, e) => a + (e.end - e.start), 0);
  const fi = Math.max(0, numFinite(d.fadeInSec, 0));
  const fo = Math.max(0, numFinite(d.fadeOutSec, 0));

  const args: string[] = ['-y'];
  srcs.forEach((s) => { args.push('-i', s); });

  const parts: string[] = [];
  const concatInputs: string[] = [];
  entries.forEach((e, i) => {
    const st = Math.max(0, e.start).toFixed(3);
    const en = Math.max(e.start + 0.04, e.end).toFixed(3);
    parts.push(`[${e.src}:v]trim=start=${st}:end=${en},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`);
    const a = [`atrim=start=${st}:end=${en}`, 'asetpts=PTS-STARTPTS'];
    if (e.muted) a.push('volume=0');
    parts.push(`[${e.src}:a]${a.join(',')}[a${i}]`);
    concatInputs.push(`[v${i}][a${i}]`);
  });
  parts.push(`${concatInputs.join('')}concat=n=${entries.length}:v=1:a=1[cv][ca]`);

  const post: string[] = [...buildGradeFilters(d.grade)];
  if (fi > 0) post.push(`fade=t=in:st=0:d=${fi}`);
  if (fo > 0 && total > 0.1) post.push(`fade=t=out:st=${Math.max(0, total - fo).toFixed(3)}:d=${fo}`);
  parts.push(`[cv]${post.length ? post.join(',') : 'null'}[outv]`);
  const apost: string[] = [];
  if (fi > 0) apost.push(`afade=t=in:st=0:d=${fi}`);
  if (fo > 0 && total > 0.1) apost.push(`afade=t=out:st=${Math.max(0, total - fo).toFixed(3)}:d=${fo}`);
  parts.push(`[ca]${apost.length ? apost.join(',') : 'anull'}[outa]`);

  args.push('-filter_complex', parts.join(';'), '-map', '[outv]', '-map', '[outa]', ...VIDEO_TAIL);

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'concat-'));
    const out = join(dir, 'concat.mp4');
    await exec(b, [...args, out], { maxBuffer: 1 << 26, timeout: 300_000 });
    return await host(await readFile(out), 'concat', 'mp4', 'video/mp4');
  } catch (err) {
    console.warn('[surgical/renderConcat] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Render a photo draft in one pass: crop → grade → single output frame (PNG). */
export async function renderPhotoDraft(imageUrl: string, d: RenderDraft): Promise<string | null> {
  const b = bin();
  if (!b || !imageUrl) return null;
  const vf: string[] = [];
  const cropF = buildCropFilter(d.crop);
  if (cropF) vf.push(cropF);
  vf.push(...buildGradeFilters(d.grade));

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'photo-'));
    const out = join(dir, 'render.png');
    const args = ['-y', '-i', imageUrl];
    if (vf.length) args.push('-vf', vf.join(','));
    args.push('-frames:v', '1', out);
    await exec(b, args, { maxBuffer: 1 << 26, timeout: 60_000 });
    const buf = await readFile(out);
    if (buf.byteLength < 128) return null;
    const path = `edits/photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), 'image/png', WEEK_SEC)) ?? null;
  } catch (err) {
    console.warn('[surgical/renderPhoto] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

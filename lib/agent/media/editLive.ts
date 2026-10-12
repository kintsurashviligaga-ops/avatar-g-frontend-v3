/**
 * lib/agent/media/editLive.ts — the live effects behind ./editExec and ./editWorker: the caller's files
 * (lib/security/callerMedia: an upload, a Library item, or a result of ours), ffmpeg-static through lib/video/ffmpegExec
 * (public hosts only, media types, a byte cap, killed on abort), the caption's PNG (the overlay renderer the remix
 * burns captions with: ffmpeg-static has no drawtext), the `renders` bucket, generation_jobs as the lease queue, and
 * the shared audit trail (./montageLive).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { probeMedia } from '@/lib/services/montage/beatAnalysis';
import { ffmpegExec, type FfmpegIo } from '@/lib/video/ffmpegExec';
import { parseProbeBanner, type BannerProbe } from '@/lib/video/probeBanner';
import { isStillProbe } from './montageAsk';
import { reSignIfInternal, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import type { EditExecDeps, RenderOutcome } from './editExec';
import { COMPOSED_EDITS, displayDims, renderArgs, type EditRequest } from './editPlan';
import { audit, every, quoteKey } from './montageLive';
import { runLayerPass } from './layerPass';
import { missingGlyphs } from './layerRender';
import { grabFrame } from './layerQc';
import { OVERLAY_FLAT_SPREAD, frameDiff, lumaCorrelation, lumaSpread, overlayArgs, overlayCheckPoints, overlayVerdict, type OverlayQcRecord } from './overlayFx';

const WEEK_SEC = 604_800;
/** A signed link to the caller's own file: the quote's 30 minutes plus a run, with room to spare. */
const SOURCE_TTL_SEC = 3600;
/** Both passes together stay inside the worker's 600 s. */
const FF_TIMEOUT_MS = 480_000;

const stderrOf = (e: unknown): string => String((e as { stderr?: string })?.stderr ?? (e as Error)?.message ?? '');

/** ffmpeg's refusal of a download (lib/video/ffmpegExec "ffmpeg input refused (<code>)") → the job's error. */
function refusalOf(text: string): RenderOutcome | null {
  const code = /ffmpeg input refused \(([a-z_]+)\)/i.exec(text)?.[1];
  if (!code) return null;
  if (code === 'too_large') return { ok: false, error: 'too_large', detail: 'the file is over the size limit' };
  return { ok: false, error: 'unavailable', detail: code };
}

/**
 * The source → the edited MP4 (or the JPEG): ./editPlan's first pass, then the overlay pass (./overlayFx, measured) when
 * the edit has one, then the composition pass (./layerPass: the caption, the layers, the caption track, measured on the
 * rendered file) when the edit has any.
 */
export async function renderEdit(
  url: string,
  request: Pick<EditRequest, 'edits' | 'plan'>,
  opts: { signal: AbortSignal; assets?: Record<string, string> },
  io: FfmpegIo = {},
): Promise<RenderOutcome> {
  const bin = (ffmpegStatic as unknown as string | null) ?? null;
  if (!bin) return { ok: false, error: 'render_failed', detail: 'ffmpeg is missing' };
  const ext = request.plan.output;
  const composed = request.edits.some((e) => COMPOSED_EDITS.has(e.op));
  const overlay = ext === 'mp4' ? request.edits.find((e) => e.op === 'overlay') : undefined;
  const dir = await mkdtemp(join(tmpdir(), 'edit-'));
  const final = join(dir, `out.${ext}`);
  const first = composed || overlay ? join(dir, ext === 'jpg' ? 'mid.png' : 'mid.mp4') : final;
  const exec = { maxBuffer: 1 << 24, timeout: FF_TIMEOUT_MS, signal: opts.signal };
  try {
    let stderr: string;
    try {
      ({ stderr } = await ffmpegExec(bin, renderArgs(request, url, first), exec, io));
    } catch (e) {
      if (opts.signal.aborted) return { ok: false, error: 'render_failed', detail: 'cancelled' };
      const text = stderrOf(e);
      const refused = refusalOf(text);
      if (refused) return refused;
      const input = parseProbeBanner(text);
      if (/matches no streams/i.test(text) || (!input.hasVideo && (input.hasAudio || input.durationSec > 0))) {
        return { ok: false, error: 'no_video', detail: 'the file has no picture' };
      }
      const last = text.trim().split('\n').filter(Boolean).pop() ?? 'ffmpeg failed';
      return { ok: false, error: 'render_failed', detail: last.slice(0, 160) };
    }
    const input = parseProbeBanner(stderr);

    let base = first;
    let overlayQc: OverlayQcRecord | undefined;
    if (overlay?.op === 'overlay') {
      const mid = await probeMedia(first);
      const { width, height } = mid ? displayDims(mid) : { width: request.plan.width, height: request.plan.height };
      const lit = composed ? join(dir, 'lit.mp4') : final;
      const fade = request.edits.find((e) => e.op === 'fade');
      try {
        await ffmpegExec(bin, overlayArgs(first, lit, {
          look: overlay.look, width, height, durationSec: request.plan.durationSec, ...(fade?.op === 'fade' ? { fade: { inSec: fade.inSec, outSec: fade.outSec } } : {}),
        }), exec, io);
      } catch (e) {
        if (opts.signal.aborted) return { ok: false, error: 'render_failed', detail: 'cancelled' };
        const last = stderrOf(e).trim().split('\n').filter(Boolean).pop() ?? 'ffmpeg failed';
        return { ok: false, error: 'render_failed', detail: `overlay: ${last.slice(0, 150)}` };
      }
      // Measured on the files: the same instants without and with the overlay, at a small size.
      const qw = 160, qh = Math.max(2, Math.round((160 * height) / width / 2) * 2);
      const samples: OverlayQcRecord['samples'] = [];
      for (const at of overlayCheckPoints(request.plan.durationSec)) {
        const a = await grabFrame(bin, first, at, qw, qh).catch(() => null);
        const b = await grabFrame(bin, lit, at, qw, qh).catch(() => null);
        if (a?.length && b?.length) {
          samples.push({ atSec: at, diff: frameDiff(a, b), corr: lumaCorrelation(a, b), ...(lumaSpread(a) < OVERLAY_FLAT_SPREAD ? { flat: true as const } : {}) });
        }
      }
      overlayQc = overlayVerdict(overlay.look, samples);
      if (opts.signal.aborted) return { ok: false, error: 'render_failed', detail: 'cancelled' };
      if (overlayQc.outcome === 'FAIL') return { ok: false, error: 'qc_failed', detail: overlayQc.problems.join('; ') };
      base = lit;
    }

    if (composed) {
      const mid = await probeMedia(base);
      const { width, height } = mid ? displayDims(mid) : { width: request.plan.width, height: request.plan.height };
      const cleanOut = join(dir, `clean.${ext}`);
      const pass = await runLayerPass({
        bin, dir, base, out: final, cleanOut, still: ext === 'jpg', fw: width, fh: height,
        durationSec: ext === 'jpg' ? 0 : request.plan.durationSec, edits: request.edits, assets: opts.assets ?? {},
        wantClean: Boolean(request.plan.clean), exec, io,
      });
      if (opts.signal.aborted) return { ok: false, error: 'render_failed', detail: 'cancelled' };
      if (!pass.ok) return { ok: false, error: pass.error, detail: pass.detail };
      const output = await probeMedia(final);
      const bytes = await readFile(final);
      const clean = pass.clean ? { bytes: await readFile(pass.clean), output: await probeMedia(pass.clean) } : undefined;
      return { ok: true, bytes, input, output, layerQc: pass.layerQc, ...(overlayQc ? { overlayQc } : {}), ...(clean ? { clean } : {}), ...(pass.subtitles ? { subtitles: pass.subtitles } : {}) };
    }
    const output = await probeMedia(final);
    const bytes = await readFile(final);
    return { ok: true, bytes, input, output, ...(overlayQc ? { overlayQc } : {}) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The size of the first frame as ffmpeg decodes it („Output #0 … Stream #0:0: Video: wrapped_avframe, …, 300x400"). */
export function decodedSizeOf(stderr: string): { width: number; height: number } | null {
  const out = stderr.slice(stderr.indexOf('Output #0'));
  const m = /Stream #0:0[^\n]*?Video:[^\n]*?(?<![\dx])(\d{2,5})x(\d{2,5})(?![\dx])/.exec(out);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/**
 * A photo as ffmpeg will decode it. A phone JPEG is often stored on its side with an EXIF turn (Orientation 6 or 8):
 * ffmpeg turns it upright when it decodes it, but its banner gives the stored sides with no rotation, so a plan made
 * from the banner (the frame size, the places to erase, the size QC expects) is for the wrong frame. The first decoded
 * frame's size wins when its sides are the banner's swapped.
 */
export async function probeUpright(url: string): Promise<BannerProbe | null> {
  const p = await probeMedia(url);
  const bin = (ffmpegStatic as unknown as string | null) ?? null;
  if (!p || !bin || !isStillProbe(p) || p.width === p.height) return p;
  try {
    const { stderr } = await ffmpegExec(bin, ['-hide_banner', '-i', url, '-frames:v', '1', '-f', 'null', '-'], { maxBuffer: 1 << 22, timeout: 60_000 });
    const d = decodedSizeOf(stderr);
    return d && d.width === p.height && d.height === p.width ? { ...p, width: d.width, height: d.height, rotation: 0 } : p;
  } catch {
    return p;
  }
}

export function liveEditDeps(): EditExecDeps {
  return {
    async resolveFile(ref, userId) {
      const r = await resolveCallerMedia(ref, userId, SOURCE_TTL_SEC);
      if (r.ok) return r.own ? { ok: true, url: r.url } : { ok: false, reason: 'not_yours' };
      return { ok: false, reason: r.reason === 'not_owner' ? 'not_yours' : 'unreadable' };
    },
    probe: (url) => probeUpright(url),
    render: (url, request, opts) => renderEdit(url, request, opts),
    upload: (jobId, bytes, output, variant) => uploadBufferAndSign(
      'renders', `edits/${jobId}${variant === 'clean' ? '-clean' : ''}.${output}`, bytes, output === 'jpg' ? 'image/jpeg' : 'video/mp4', WEEK_SEC,
    ),
    missingGlyphs: (texts) => missingGlyphs(texts.join(' ')),
    resign: (url) => reSignIfInternal(url, WEEK_SEC),
    store: supabaseLeaseStore(() => createServiceRoleClient(), reportError),
    audit,
    key: quoteKey,
    now: () => Date.now(),
    newId: () => randomUUID(),
    every,
  };
}

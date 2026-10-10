/**
 * lib/agent/media/editLive.ts — the live effects behind ./editExec and ./editWorker: the caller's files
 * (lib/security/callerMedia: an upload, a Library item, or a result of ours), ffmpeg-static through lib/video/ffmpegExec
 * (public hosts only, media types, a byte cap, killed on abort), the caption's PNG (the overlay renderer the remix
 * burns captions with: ffmpeg-static has no drawtext), the `renders` bucket, generation_jobs as the lease queue, and
 * the shared audit trail (./montageLive).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { probeMedia } from '@/lib/services/montage/beatAnalysis';
import { ffmpegExec, type FfmpegIo } from '@/lib/video/ffmpegExec';
import { parseProbeBanner } from '@/lib/video/probeBanner';
import { renderTextLayerPng } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { reSignIfInternal, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import type { EditExecDeps, RenderOutcome } from './editExec';
import { captionArgs, captionFontPx, displayDims, renderArgs, type EditRequest } from './editPlan';
import { audit, every, quoteKey } from './montageLive';

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

/** The source → the edited MP4 (or the JPEG): ./editPlan's first pass, then the caption's pass when there is one. */
export async function renderEdit(
  url: string,
  request: Pick<EditRequest, 'edits' | 'plan'>,
  opts: { signal: AbortSignal },
  io: FfmpegIo = {},
): Promise<RenderOutcome> {
  const bin = (ffmpegStatic as unknown as string | null) ?? null;
  if (!bin) return { ok: false, error: 'render_failed', detail: 'ffmpeg is missing' };
  const ext = request.plan.output;
  const caption = request.edits.find((e) => e.op === 'caption');
  const dir = await mkdtemp(join(tmpdir(), 'edit-'));
  const final = join(dir, `out.${ext}`);
  const first = caption ? join(dir, ext === 'jpg' ? 'mid.png' : 'mid.mp4') : final;
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

    if (caption?.op === 'caption') {
      const mid = await probeMedia(first);
      const { width, height } = mid ? displayDims(mid) : { width: request.plan.width, height: request.plan.height };
      const png = await renderTextLayerPng(
        { text: caption.text, position: 'bottom-center', fontSize: captionFontPx(width, height), fontColor: '#FFFFFF' },
        width, height,
      );
      if (!png) return { ok: false, error: 'render_failed', detail: 'the caption could not be drawn' };
      const pngPath = join(dir, 'caption.png');
      await writeFile(pngPath, png);
      try {
        await ffmpegExec(bin, captionArgs(ext, first, pngPath, final), exec, io);
      } catch (e) {
        if (opts.signal.aborted) return { ok: false, error: 'render_failed', detail: 'cancelled' };
        const last = stderrOf(e).trim().split('\n').filter(Boolean).pop() ?? 'ffmpeg failed';
        return { ok: false, error: 'render_failed', detail: `caption: ${last.slice(0, 150)}` };
      }
    }
    const output = await probeMedia(final);
    const bytes = await readFile(final);
    return { ok: true, bytes, input, output };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function liveEditDeps(): EditExecDeps {
  return {
    async resolveFile(ref, userId) {
      const r = await resolveCallerMedia(ref, userId, SOURCE_TTL_SEC);
      if (r.ok) return r.own ? { ok: true, url: r.url } : { ok: false, reason: 'not_yours' };
      return { ok: false, reason: r.reason === 'not_owner' ? 'not_yours' : 'unreadable' };
    },
    probe: (url) => probeMedia(url),
    render: (url, request, opts) => renderEdit(url, request, opts),
    upload: (jobId, bytes, output) => uploadBufferAndSign(
      'renders', `edits/${jobId}.${output}`, bytes, output === 'jpg' ? 'image/jpeg' : 'video/mp4', WEEK_SEC,
    ),
    resign: (url) => reSignIfInternal(url, WEEK_SEC),
    store: supabaseLeaseStore(() => createServiceRoleClient(), reportError),
    audit,
    key: quoteKey,
    now: () => Date.now(),
    newId: () => randomUUID(),
    every,
  };
}

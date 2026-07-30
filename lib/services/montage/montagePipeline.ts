/**
 * lib/services/montage/montagePipeline.ts — the Montage render, leg by leg.
 *
 *   1 resolve   re-sign internal urls so ffmpeg can actually fetch them
 *   2 bridge    stills → Ken Burns clips (renderConcat needs real video streams, not JPEGs)
 *   3 normalize every source scaled/padded to ONE aspect BEFORE the graph — see ROTATION below
 *   4 stitch    renderConcat, VBV-capped and hosted through a non-base64 sink
 *   5 music     optional bed mixed under the master
 *
 * ⚠️ ROTATION: `renderConcat` builds a `-filter_complex` graph, and ffmpeg does NOT apply a source's
 * rotation side-data metadata when the stream goes through filter_complex. A phone clip shot in portrait
 * therefore stitches in SIDEWAYS. `fitAspect` is a plain `-vf` pass where autorotation still applies, so
 * running every video source through it first is what keeps portrait footage upright — it is a correctness
 * step, not just a letterboxing convenience.
 *
 * FAIL POLICY: fail-open per shot is wrong here. A montage with shot 3 silently missing is not a partial
 * result, it is a wrong edit — the user would have to watch the whole thing to notice. Any shot that
 * cannot be prepared fails the job with the shot number.
 */
import 'server-only';
import { renderConcat, type ConcatEntry, type Transition, type TextOverlay } from '@/lib/video/surgicalOps';
import { fitAspect, kenBurnsClip, muxAudioOntoVideo } from '@/lib/video/remixOps';
import { uploadBufferAndSign, reSignIfInternal } from '@/lib/orchestrator/storage-adapter';
import { updateJobStage } from '@/lib/orchestrator/jobs';
import { reportError } from '@/lib/observability/report-error';
import {
  ASPECT_DIMS,
  buildConcatPlan,
  timelineDuration,
  shotDuration,
  maxrateForTarget,
  type MontageRequest,
} from './montagePlan';

const WEEK_SEC = 604_800;

export type MontageStep = 'resolve' | 'bridge' | 'normalize' | 'stitch' | 'music';

const PCT: Record<MontageStep, number> = { resolve: 6, bridge: 26, normalize: 58, stitch: 88, music: 96 };

export interface MontageResult {
  videoUrl: string;
  durationSec: number;
  shots: number;
  aspect: string;
  /** Shots that had to be bridged from a still. */
  bridged: number;
  hasMusic: boolean;
  stepsRun: MontageStep[];
}

export type MontageOutcome =
  | { ok: true; result: MontageResult }
  | { ok: false; step: MontageStep; error: string };

async function stage(jobId: string | null, step: MontageStep): Promise<void> {
  if (!jobId) return;
  await updateJobStage(jobId, step, PCT[step]).catch(() => {});
}

/** surgicalOps speaks 'none'; the studio speaks 'cut'. Map once, here. */
function toTransition(t: 'crossfade' | 'fade' | undefined): Transition {
  return t ?? 'none';
}

export async function runMontage(
  req: MontageRequest,
  opts: { jobId?: string | null } = {},
): Promise<MontageOutcome> {
  const jobId = opts.jobId ?? null;
  const stepsRun: MontageStep[] = [];
  const { w, h } = ASPECT_DIMS[req.aspect];

  try {
    // ── LEG 1 · resolve ────────────────────────────────────────────────────────────────────────────
    await stage(jobId, 'resolve');
    const resolved: string[] = [];
    for (const shot of req.shots) {
      // Signed Supabase URLs expire; a montage assembled from library clips is exactly the case where
      // some of them will have gone stale since the user added them to the timeline.
      const url = (await reSignIfInternal(shot.url, WEEK_SEC).catch(() => shot.url)) || shot.url;
      resolved.push(url);
    }
    stepsRun.push('resolve');

    // ── LEG 2 · bridge stills ──────────────────────────────────────────────────────────────────────
    await stage(jobId, 'bridge');
    let bridged = 0;
    for (let i = 0; i < req.shots.length; i += 1) {
      const shot = req.shots[i];
      const src = resolved[i];
      if (!shot || !src || shot.kind !== 'image') continue;
      const clip = await kenBurnsClip(src, shotDuration(shot), req.aspect);
      if (!clip) return { ok: false, step: 'bridge', error: `shot ${i + 1}: could not turn the image into a clip` };
      resolved[i] = clip;
      bridged += 1;
    }
    stepsRun.push('bridge');

    // ── LEG 3 · normalize ──────────────────────────────────────────────────────────────────────────
    // Ken Burns clips are already produced at the target aspect, so only real video needs this pass.
    await stage(jobId, 'normalize');
    for (let i = 0; i < req.shots.length; i += 1) {
      const shot = req.shots[i];
      const src = resolved[i];
      if (!shot || !src || shot.kind !== 'video') continue;
      const fitted = await fitAspect(src, req.aspect);
      if (!fitted) return { ok: false, step: 'normalize', error: `shot ${i + 1}: could not be conformed to ${req.aspect}` };
      resolved[i] = fitted;
    }
    stepsRun.push('normalize');

    // ── LEG 4 · stitch ─────────────────────────────────────────────────────────────────────────────
    await stage(jobId, 'stitch');
    const totalSec = timelineDuration(req.shots);
    const plan = buildConcatPlan(req.shots, { musicOnly: req.musicOnly, aspect: req.aspect });
    const seq: ConcatEntry[] = plan.map((p) => ({
      src: p.src,
      start: p.start,
      end: p.end,
      muted: p.muted,
      transition: toTransition(p.transition),
      ...(p.textOverlay ? { textOverlay: p.textOverlay as TextOverlay } : {}),
    }));

    const master = await renderConcat(resolved, seq, {}, w, h, {
      // Without this the ultrafast/CRF20 master of a multi-minute montage exceeds the ~50MB storage
      // limit and the upload is REJECTED after a full encode. See maxrateForTarget.
      maxrateKbps: maxrateForTarget(totalSec),
      // The route budget is 600s; the shared default is 300s and would kill a long stitch mid-encode.
      timeoutMs: 540_000,
      // The shared host() base64s the whole buffer (+33% peak memory). A montage master is the largest
      // artefact this codebase produces outside the film pipeline, so it goes up as raw bytes.
      sink: (buf) =>
        uploadBufferAndSign(
          'renders',
          `montage/master-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`,
          buf,
          'video/mp4',
          WEEK_SEC,
        ),
    });
    if (!master) return { ok: false, step: 'stitch', error: 'the shots could not be stitched together' };
    stepsRun.push('stitch');

    // ── LEG 5 · music ──────────────────────────────────────────────────────────────────────────────
    let videoUrl = master;
    if (req.musicUrl) {
      await stage(jobId, 'music');
      // 'under' keeps the clips' own audio and ducks it beneath the bed. 'replace' would DELETE it —
      // the same trap that silently removed Veo's native dialogue in the film pipeline.
      const mixed = await muxAudioOntoVideo(master, req.musicUrl, req.musicOnly ? 'replace' : 'under', Math.abs(req.musicDuckDb));
      // A failed bed is not worth throwing away a good edit — the master is still exactly what was asked
      // for, minus music, and the caller is told.
      if (mixed) {
        videoUrl = mixed;
        stepsRun.push('music');
      }
    }

    return {
      ok: true,
      result: {
        videoUrl,
        durationSec: totalSec,
        shots: req.shots.length,
        aspect: req.aspect,
        bridged,
        hasMusic: stepsRun.includes('music'),
        stepsRun,
      },
    };
  } catch (err) {
    reportError(err, { where: 'montagePipeline.run' });
    const last = stepsRun[stepsRun.length - 1] ?? 'resolve';
    return { ok: false, step: last, error: err instanceof Error ? err.message : 'montage failed' };
  }
}

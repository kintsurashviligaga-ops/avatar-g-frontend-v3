/**
 * filmStudioStages
 * ================
 * Pure, framework-free derivation of the Conversational Film Studio's per-leg
 * STATUS PIPELINE from the live `FilmStudioProgress` matrix. Extracted out of the
 * React component so the workflow logic (storyboard → N scene renders → stitch →
 * score) is independently unit-testable and never drifts from the UI.
 *
 * Nothing here touches the DOM, network, or `window`, so it runs in a plain
 * `node` Jest environment. The component imports `summarizeFilmPipeline` and
 * renders the returned stages + percent verbatim.
 */
import { FILM_SCENE_COUNT } from './filmPipeline';
import type {
  FilmStudioProgress,
  FilmStudioMatrix,
  FilmStudioPhase,
  FilmLegClientStatus,
} from './filmStudioClient';

/** Visual state of a single pipeline leg. */
export type StageState = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface PipelineStage {
  key: string;
  label: string;
  state: StageState;
  /** Inline scrub-preview for a rendered scene clip, when one has landed. */
  previewUrl?: string | null;
}

export interface PipelineSummary {
  stages: PipelineStage[];
  /** Planned scene count for this film. */
  totalScenes: number;
  /** Scene clips that have fully rendered. */
  scenesRendered: number;
  /** Scene clips currently in flight (dispatched / rendering). */
  scenesRendering: number;
  /** Scene clips that failed to render. */
  scenesFailed: number;
  /** Coarse 0–100 progress across the WHOLE pipeline (storyboard + clips + stitch + score). */
  percent: number;
  /** The master has been stitched and is ready. */
  done: boolean;
  /** At least one leg failed (or the pipeline reported a terminal failure). */
  failed: boolean;
}

/** Map a single leg's server status to its visual state. */
export function legToStageState(status: FilmLegClientStatus | undefined, active: boolean): StageState {
  if (status === 'succeeded') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'skipped') return 'skipped';
  if (active) return 'active';
  return 'pending';
}

/** A resolved leg no longer counts as in-flight (done OR deliberately skipped). */
function isResolved(state: StageState): boolean {
  return state === 'done' || state === 'skipped';
}

/**
 * Partial credit a single in-flight (active) leg contributes to the whole-
 * pipeline percent. Half a unit keeps the bar visibly advancing the moment a
 * leg starts rendering, without ever claiming a leg is finished before it is.
 */
const ACTIVE_LEG_WEIGHT = 0.5;

/**
 * Build the ordered list of pipeline stages from the live progress matrix.
 * Behaviour is identical to the studio's former inline `deriveStages`, kept as a
 * pure function so the workflow is testable in isolation.
 *
 * `opts.terminal` is a frontend safety net: when the production has come to a
 * dead stop (halted / canceled / failed) but the last emitted matrix still
 * carries `queued` clip statuses, those legs would otherwise render as spinning
 * "active" loaders FOREVER under a red header — the exact contradictory tracker
 * seen live. With `terminal:true` every non-resolved leg is forced down to a
 * calm `pending` dot so no scene can spin past the end of the run, even if a
 * terminal `emit('failed')` was somehow missed upstream.
 */
export function deriveFilmStages(
  progress: FilmStudioProgress | null,
  roleSceneLabel: string,
  opts?: { terminal?: boolean },
): PipelineStage[] {
  const m: FilmStudioMatrix | null = progress?.matrix ?? null;
  const phase: FilmStudioPhase = progress?.phase ?? 'idle';
  const terminal = opts?.terminal === true;
  // When the run has stopped, nothing is "rendering" anymore — clip/storyboard
  // legs must not be lit active off a stale matrix.
  const rendering = !terminal && (phase === 'rendering' || phase === 'dispatching');
  const total = m?.sceneCount || m?.clips.length || FILM_SCENE_COUNT;

  const stages: PipelineStage[] = [];

  stages.push({
    key: 'storyboard',
    label: 'Storyboard — scene breakdown',
    state: m ? legToStageState(m.storyboard, rendering) : phase === 'dispatching' ? 'active' : 'pending',
  });

  const clips = m ? [...m.clips].sort((a, b) => a.ordinal - b.ordinal) : [];
  for (let i = 0; i < total; i++) {
    const clip = clips[i];
    stages.push({
      key: `clip_${i + 1}`,
      label: `${roleSceneLabel} ${i + 1} / ${total}`,
      state: clip ? legToStageState(clip.status, rendering) : rendering ? 'active' : 'pending',
      previewUrl: clip?.url ?? null,
    });
  }

  stages.push({
    key: 'stitch',
    label: 'Editor — stitching the final cut',
    state:
      phase === 'assembled'
        ? 'done'
        : phase === 'stitching'
          ? 'active'
          : m
            ? legToStageState(m.stitch, false)
            : 'pending',
  });

  // Score leg is driven by its OWN status (active=false), like the stitch leg —
  // never by the blanket `rendering` flag. Otherwise a still-QUEUED score spins a
  // misleading "active" loader while the scenes are the ones actually rendering
  // ("score queued" in the status line, yet a spinner in the list). Honest:
  // queued/pending → a calm pending dot, succeeded → done, failed → failed.
  // The film's score is GUARANTEED at the stitch step: if the Udio leg never
  // resolves (or errors), the assembler composes a cohesive cinematic score on the
  // funded MusicGen module and muxes it across the whole timeline. So a non-success
  // Udio leg must NEVER render as a red "failed" — that wrongly told users the
  // delivered film was silent (the live "audio failed / no music" misread). While
  // the run is in flight a failed/queued audio leg shows a CALM pending dot; once
  // the master is assembled it reads 'done', because the delivered film always
  // carries audio. Honest at the film level, never alarmist.
  stages.push({
    key: 'score',
    label: 'Audio & Foley — soundtrack',
    state:
      phase === 'assembled'
        ? 'done'
        : m
          ? (m.audio === 'failed' ? 'pending' : legToStageState(m.audio, false))
          : 'pending',
  });

  // Terminal safety net: a stopped run can have NO spinning legs. Force any leg
  // still computed as 'active' (e.g. the stitch leg mid-phase) down to 'pending'
  // so the tracker can never contradict a red "halted"/"failed" header.
  if (terminal) {
    for (const stage of stages) {
      if (stage.state === 'active') stage.state = 'pending';
    }
  }

  return stages;
}

/**
 * Full pipeline summary: the ordered stages PLUS aggregate metrics (scene count,
 * scenes rendered, a coarse whole-pipeline percent, and terminal done/failed
 * flags) the UI uses to drive the progress bar and headline counters.
 */
export function summarizeFilmPipeline(
  progress: FilmStudioProgress | null,
  roleSceneLabel: string,
  opts?: { terminal?: boolean },
): PipelineSummary {
  const phase: FilmStudioPhase = progress?.phase ?? 'idle';
  const stages = deriveFilmStages(progress, roleSceneLabel, opts);

  const clipStages = stages.filter((s) => s.key.startsWith('clip_'));
  const totalScenes = clipStages.length;
  const scenesRendered = clipStages.filter((s) => s.state === 'done').length;
  const scenesRendering = clipStages.filter((s) => s.state === 'active').length;
  const scenesFailed = clipStages.filter((s) => s.state === 'failed').length;

  const failed = phase === 'failed' || stages.some((s) => s.state === 'failed');

  // Assembled = 100. Otherwise a WEIGHTED progress so the bar reflects real
  // motion instead of stalling at the storyboard's lone unit while N scenes
  // visibly render. Each leg is one equal unit of work; a terminal leg
  // (done / skipped / failed) earns a full unit, an in-flight ACTIVE leg earns
  // partial credit, and a pending leg earns nothing. Capped below 100 until the
  // master is actually stitched (phase 'assembled').
  const progressUnits = stages.reduce((sum, s) => {
    if (isResolved(s.state) || s.state === 'failed') return sum + 1;
    if (s.state === 'active') return sum + ACTIVE_LEG_WEIGHT;
    return sum;
  }, 0);
  const percent =
    phase === 'assembled'
      ? 100
      : stages.length > 0
        ? Math.min(99, Math.max(0, Math.round((progressUnits / stages.length) * 100)))
        : 0;

  return {
    stages,
    totalScenes,
    scenesRendered,
    scenesRendering,
    scenesFailed,
    percent,
    done: phase === 'assembled',
    failed,
  };
}

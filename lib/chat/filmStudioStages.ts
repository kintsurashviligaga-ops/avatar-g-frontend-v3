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
 * Build the ordered list of pipeline stages from the live progress matrix.
 * Behaviour is identical to the studio's former inline `deriveStages`, kept as a
 * pure function so the workflow is testable in isolation.
 */
export function deriveFilmStages(
  progress: FilmStudioProgress | null,
  roleSceneLabel: string,
): PipelineStage[] {
  const m: FilmStudioMatrix | null = progress?.matrix ?? null;
  const phase: FilmStudioPhase = progress?.phase ?? 'idle';
  const rendering = phase === 'rendering' || phase === 'dispatching';
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

  stages.push({
    key: 'score',
    label: 'Audio & Foley — scoring the film',
    state: m ? legToStageState(m.audio, rendering) : 'pending',
  });

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
): PipelineSummary {
  const phase: FilmStudioPhase = progress?.phase ?? 'idle';
  const stages = deriveFilmStages(progress, roleSceneLabel);

  const clipStages = stages.filter((s) => s.key.startsWith('clip_'));
  const totalScenes = clipStages.length;
  const scenesRendered = clipStages.filter((s) => s.state === 'done').length;

  const resolved = stages.filter((s) => isResolved(s.state)).length;
  const failed = phase === 'failed' || stages.some((s) => s.state === 'failed');

  // Assembled = 100. Otherwise a coarse, weighted progress: every leg
  // (storyboard + each clip + stitch + score) is one equal unit of work.
  const percent =
    phase === 'assembled'
      ? 100
      : stages.length > 0
        ? Math.min(99, Math.max(0, Math.round((resolved / stages.length) * 100)))
        : 0;

  return {
    stages,
    totalScenes,
    scenesRendered,
    percent,
    done: phase === 'assembled',
    failed,
  };
}

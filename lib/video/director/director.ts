/**
 * lib/video/director/director.ts — the VideoDirector (V2): the "Director's Executor", not a director.
 *
 *   planStoryboard   the LLM (an injected planner) writes a DRAFT — approvedByUser false, createdBy agent_planner,
 *                    whatever the planner itself returned. It never approves anything.
 *   freeze           the user's approval locks a deep-frozen copy (./storyboard.ts).
 *   executeStoryboard runs a FROZEN storyboard and nothing else: shots strictly by `order`, one at a time, each with
 *                    its own prompt / reference / seed / duration / aspect / quality (via GoogleVeoProvider).
 *
 * ⚠️ THE FIRST ShotError STOPS THE RUN (V5). No skip, no auto-fix, no retry, no "adaptive" next step (V6): the run
 * returns state `waiting_for_shot_decision` with the exact error, and the shots after it are never submitted. The user
 * decides — retryFailedShot (the same frozen shot again, then the rest in order), cancelRun, or editStoryboard (a new
 * draft to approve and freeze; the frozen storyboard itself is never changed).
 *
 * ⚠️ ONLY GoogleVeoProvider (V1). The director checks the provider's class, not just its `providerName` claim, so no
 * other implementation — or an object that merely says "google_veo" — can be handed in.
 *
 * Cancellation is checked before every shot; the provider also stops waiting on an in-flight clip (Veo has no cancel
 * call, so a clip Google already accepted may still bill). A cancelled run keeps the clips it finished.
 */
import { GoogleVeoProvider, ShotCancelledError } from './googleVeoProvider';
import {
  copyStoryboard,
  draftFromFrozen,
  freeze,
  isFrozen,
  shotsInOrder,
  StoryboardNotFrozenError,
  StoryboardValidationError,
  validateStoryboard,
} from './storyboard';
import type {
  CancellationToken,
  Clip,
  FrozenStoryboard,
  ShotDecision,
  ShotError,
  ShotGenerationResult,
  ShotProgressEvent,
  Storyboard,
  StoryboardPlanInput,
  StoryboardPlanner,
  StoryboardRun,
  StoryboardRunState,
  VideoDirector,
  VideoParams,
  VideoPipelineInput,
} from './types';

export type ProgressListener = (event: ShotProgressEvent) => void;

export const SHOT_DECISIONS: readonly ShotDecision[] = Object.freeze(['retry', 'edit', 'cancel'] as const);

/** Per-shot progress for each stage (ShotProgressEvent.progress); `failed` keeps the shot's last value. */
const STAGE_PROGRESS = { queued: 0, generating: 0.1, finalizing: 0.9, done: 1 } as const;

/** veoRawResponse length for an unexpected provider throw — the same bound the provider uses. */
const RAW_MAX_CHARS = 300;

export class ProviderNotAllowedError extends Error {
  constructor() {
    super('V1: the only video provider is GoogleVeoProvider ("google_veo") — no other provider or fallback is accepted');
    this.name = 'ProviderNotAllowedError';
  }
}

/** A user decision that does not apply to the run it was given (e.g. retrying a run that finished). */
export class RunDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunDecisionError';
  }
}

export interface VideoDirectorDeps {
  provider: GoogleVeoProvider;
  planner: StoryboardPlanner;
  clock?: () => Date;
}

export interface GoogleVideoDirector extends VideoDirector {
  readonly provider: GoogleVeoProvider;
  executeStoryboard(
    storyboard: FrozenStoryboard,
    onProgress: ProgressListener,
    cancellation?: CancellationToken,
    params?: VideoParams,
  ): Promise<StoryboardRun>;
  /** executeStoryboard for the master's VideoPipelineInput envelope. */
  runPipeline(input: VideoPipelineInput, onProgress: ProgressListener): Promise<StoryboardRun>;
  /** "retry": the failed shot again — the same frozen shot — then the rest in order. Earlier clips are kept. */
  retryFailedShot(run: StoryboardRun, onProgress: ProgressListener, cancellation?: CancellationToken, params?: VideoParams): Promise<StoryboardRun>;
  /** "cancel": ends a run that is waiting for a decision. No provider call. */
  cancelRun(run: StoryboardRun): StoryboardRun;
  /** "edit": a new, unapproved draft of the run's storyboard. Approve and freeze it, then execute it. */
  editStoryboard(run: StoryboardRun): Storyboard;
}

function assertExecutable(storyboard: unknown): asserts storyboard is FrozenStoryboard {
  if (!isFrozen(storyboard)) throw new StoryboardNotFrozenError();
  // Only freeze() makes a frozen storyboard and it validates first, so this is a guard against a bypass, not a check
  // that is expected to fail.
  const validation = validateStoryboard(storyboard);
  if (!validation.ok) throw new StoryboardValidationError(validation.problems, 'refusing to execute the storyboard');
}

function assertWaiting(run: StoryboardRun | null | undefined, decision: ShotDecision): asserts run is StoryboardRun & { pendingDecision: NonNullable<StoryboardRun['pendingDecision']> } {
  if (!run || run.state !== 'waiting_for_shot_decision' || !run.pendingDecision) {
    throw new RunDecisionError(`"${decision}" applies only to a run waiting for a shot decision (got ${run ? run.state : 'no run'})`);
  }
}

export function createVideoDirector(deps: VideoDirectorDeps): GoogleVideoDirector {
  const { provider, planner } = deps;
  if (!(provider instanceof GoogleVeoProvider) || provider.providerName !== 'google_veo') throw new ProviderNotAllowedError();
  if (typeof planner !== 'function') throw new TypeError('createVideoDirector needs a planner function');
  const clock = deps.clock ?? (() => new Date());
  const now = (): string => clock().toISOString();

  /** A listener is UI code: its fault must not stop (or half-stop) a paid run. */
  const emit = (listener: ProgressListener, event: ShotProgressEvent): void => {
    try {
      listener(event);
    } catch {
      /* ignored on purpose — see above */
    }
  };

  /**
   * Execute shots[startIndex…] of a frozen storyboard, in order, one at a time. `prior` carries a resumed run's
   * finished clips (exactly the shots before startIndex) and its error history.
   */
  async function runFrom(
    storyboard: FrozenStoryboard,
    startIndex: number,
    prior: { clips: readonly Clip[]; errors: readonly ShotError[] },
    onProgress: ProgressListener,
    cancellation: CancellationToken | undefined,
    params: VideoParams | undefined,
  ): Promise<StoryboardRun> {
    const shots = shotsInOrder(storyboard);
    const totalShots = shots.length;
    const clips: Clip[] = [...prior.clips];
    // Every ShotError this storyboard hit, in order — a run that completed after a retry still lists the one it overcame.
    const errors: ShotError[] = [...prior.errors];
    const finish = (state: StoryboardRunState, pendingDecision?: StoryboardRun['pendingDecision']): StoryboardRun => ({
      storyboardId: storyboard.id,
      clips,
      errors,
      completedAt: now(),
      state,
      storyboard,
      ...(pendingDecision ? { pendingDecision } : {}),
    });

    for (let i = startIndex; i < totalShots; i++) {
      const shot = shots[i];
      if (shot) emit(onProgress, { storyboardId: storyboard.id, shotId: shot.id, shotIndex: i, totalShots, stage: 'queued', progress: STAGE_PROGRESS.queued });
    }

    for (let i = startIndex; i < totalShots; i++) {
      const shot = shots[i];
      if (!shot) break;
      if (cancellation?.aborted) return finish('cancelled');

      let progress: number = STAGE_PROGRESS.queued;
      const stage = (name: ShotProgressEvent['stage'], value: number, error?: ShotError): void => {
        progress = value;
        emit(onProgress, { storyboardId: storyboard.id, shotId: shot.id, shotIndex: i, totalShots, stage: name, progress: value, ...(error ? { error } : {}) });
      };

      let result: ShotGenerationResult;
      try {
        result = await provider.generateShot(
          {
            storyboardId: storyboard.id,
            shot,
            consistencyLock: storyboard.consistencyLock,
            ...(params ? { params } : {}),
            onStage: (name) => stage(name, STAGE_PROGRESS[name]),
          },
          cancellation,
        );
      } catch (err) {
        if (err instanceof ShotCancelledError) return finish('cancelled');
        // The provider never throws for a shot failure; if it does anyway, that is still this shot's failure.
        const raw = err instanceof Error ? err.message : String(err);
        result = {
          ok: false,
          error: { shotId: shot.id, reason: 'unknown', message: 'The video provider failed unexpectedly on this shot.', retryable: false, ...(raw ? { veoRawResponse: raw.slice(0, RAW_MAX_CHARS) } : {}) },
        };
      }

      if (!result.ok) {
        const error: ShotError = { ...result.error, shotId: shot.id };
        errors.push(error);
        stage('failed', progress, error);
        return finish('waiting_for_shot_decision', { shotId: shot.id, shotIndex: i, error, options: SHOT_DECISIONS });
      }
      clips.push({ shotId: shot.id, order: shot.order, url: result.clipUrl, durationSeconds: shot.durationSeconds, metadata: result.metadata });
      stage('done', STAGE_PROGRESS.done);
    }
    return finish('completed');
  }

  const director: GoogleVideoDirector = {
    provider,

    async planStoryboard(input: StoryboardPlanInput): Promise<Storyboard> {
      const draft = await planner(input);
      if (!draft || typeof draft !== 'object' || !Array.isArray(draft.shots) || !draft.consistencyLock) {
        throw new Error('the storyboard planner returned no storyboard');
      }
      // V2: the LLM drafts; only the user approves — whatever the planner put in these two fields.
      return { ...copyStoryboard(draft), createdBy: 'agent_planner', approvedByUser: false };
    },

    freeze(storyboard: Storyboard): FrozenStoryboard {
      return freeze(storyboard, clock);
    },

    async executeStoryboard(storyboard, onProgress, cancellation, params) {
      assertExecutable(storyboard);
      return runFrom(storyboard, 0, { clips: [], errors: [] }, onProgress, cancellation, params);
    },

    async runPipeline(input, onProgress) {
      return director.executeStoryboard(input.storyboard, onProgress, input.cancellation, input.params);
    },

    async retryFailedShot(run, onProgress, cancellation, params) {
      assertWaiting(run, 'retry');
      assertExecutable(run.storyboard);
      const shots = shotsInOrder(run.storyboard);
      const { shotIndex, shotId } = run.pendingDecision;
      if (shots[shotIndex]?.id !== shotId) throw new RunDecisionError(`shot "${shotId}" is not at position ${shotIndex} of this storyboard`);
      // A resumed run must hold exactly the clips of the shots before the failed one, in order — never a gap.
      if (run.clips.length !== shotIndex || run.clips.some((clip, i) => clip.shotId !== shots[i]?.id)) {
        throw new RunDecisionError('the run\'s clips do not match the shots before the failed one');
      }
      return runFrom(run.storyboard, shotIndex, { clips: run.clips, errors: run.errors }, onProgress, cancellation, params);
    },

    cancelRun(run) {
      assertWaiting(run, 'cancel');
      return {
        storyboardId: run.storyboardId,
        clips: [...run.clips],
        errors: [...run.errors],
        completedAt: now(),
        state: 'cancelled',
        storyboard: run.storyboard,
      };
    },

    editStoryboard(run) {
      assertWaiting(run, 'edit');
      return draftFromFrozen(run.storyboard);
    },
  };
  return director;
}

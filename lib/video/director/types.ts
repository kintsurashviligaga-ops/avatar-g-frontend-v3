/**
 * lib/video/director/types.ts — the Video Pipeline V1–V6 contracts (PROJECT_MASTER.md Section B, §6.5 TaskState and
 * §9 "Video Pipeline contracts").
 *
 * The names and literal unions below are PROJECT_MASTER's, as written. The master leaves a few types it references
 * undefined (ShotMetadata, Clip, VideoParams, CancellationToken, the planner's input) and leaves several method
 * parameters untyped; those are defined here with the smallest shape the director and the Google Veo provider need,
 * and each says so. Everything that only ADDS to a master type (the run result, the decision point) is a separate
 * type that extends it, so the master's own shapes stay byte-identical.
 *
 * Type-only on purpose: the studio UI can import these without pulling the Veo engine, the budget guard or an LLM
 * client into a browser bundle.
 */

// ── §6.5 TaskState ───────────────────────────────────────────────────────────────────────────────────────────────

export type TaskState =
  | 'queued'
  | 'planning'
  | 'running'
  | 'waiting_for_approval'
  | 'paused'
  | 'repairing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_for_shot_decision';

// ── §9 Video Pipeline contracts ──────────────────────────────────────────────────────────────────────────────────

export type Shot = {
  id: string;
  /** The director's order (V2). Execution follows this field, never the array position. */
  order: number;
  description: string;
  /** Sent to Veo byte-for-byte (V3): never trimmed, translated, rephrased, prefixed or suffixed. */
  prompt: string;
  negativePrompt?: string;
  /** Overrides ConsistencyLock.characterReference for this shot (Objective A, V4). https:// or data:image URL. */
  referenceImage?: string;
  /** Overrides ConsistencyLock.seed for this shot (Objective A, V4). uint32. */
  seed?: number;
  /** 4, 6 or 8 — the only lengths Veo renders. */
  durationSeconds: number;
  /** 16:9 or 9:16 — the only frames Veo renders — and always the lock's aspect ratio (V4). */
  aspectRatio: string;
  /** The Veo tier: 'standard' | 'fast' | 'lite' (the repo's VideoQuality, lib/credits/videoPricing). */
  quality: string;
  /**
   * Descriptive only: the camera move belongs in `prompt`, which is what Veo reads. It is not sent as a separate
   * field — Vertex's cameraControl is opt-in, requires a first frame, and would be a second camera instruction the
   * user never saw in the prompt they approved.
   */
  cameraMotion?: string;
  notes?: string;
};

export type ConsistencyLock = {
  /** Every shot's seed unless the shot sets its own (Objective A, V4). */
  seed?: number;
  /** Every shot's Veo asset reference unless the shot sets its own `referenceImage` (Objective A, V4). */
  characterReference?: string;
  /**
   * Planner input only. Veo 3.1 documents `asset` references alone (no style reference), so style consistency is
   * written into every shot's prompt by planStoryboard (Objective A, V4) — the prompt the user approves.
   */
  styleReference?: string;
  aspectRatio: string;
  /** must be true */
  enforceAcrossShots: boolean;
};

export type Storyboard = {
  id: string;
  title: string;
  totalDurationSeconds: number;
  shots: Shot[];
  consistencyLock: ConsistencyLock;
  createdAt: string;
  createdBy: 'user' | 'agent_planner' | 'imported';
  approvedByUser: boolean;
};

export type FrozenStoryboard = Storyboard & {
  readonly __frozen: true;
  readonly frozenAt: string;
};

export type ShotError = {
  shotId: string;
  reason:
    | 'prompt_safety'
    | 'invalid_dimension'
    | 'invalid_duration'
    | 'rate_limit'
    | 'reference_image_issue'
    | 'seed_conflict'
    | 'veo_internal'
    | 'unknown';
  message: string;
  retryable: boolean;
  veoRawResponse?: string;
};

export type ShotErrorReason = ShotError['reason'];

export type ShotProgressEvent = {
  storyboardId: string;
  shotId: string;
  /** 0-based position in execution (`order`) order. */
  shotIndex: number;
  totalShots: number;
  stage: 'queued' | 'generating' | 'finalizing' | 'done' | 'failed';
  /** This shot's progress, 0…1 (queued 0, generating 0.1, finalizing 0.9, done 1; failed keeps the last value). */
  progress: number;
  error?: ShotError;
};

export interface VideoDirector {
  planStoryboard(input: StoryboardPlanInput): Promise<Storyboard>;
  freeze(storyboard: Storyboard): FrozenStoryboard;
  executeStoryboard(
    storyboard: FrozenStoryboard,
    onProgress: (event: ShotProgressEvent) => void,
    cancellation?: CancellationToken,
  ): Promise<VideoPipelineOutput>;
}

export interface VideoGenProvider {
  readonly providerName: 'google_veo';
  generateShot(input: ShotGenerationInput, cancellation?: CancellationToken): Promise<ShotGenerationResult>;
}

export type ShotGenerationResult =
  | { ok: true; clipUrl: string; metadata: ShotMetadata }
  | { ok: false; error: ShotError };

export type VideoPipelineInput = {
  storyboard: FrozenStoryboard;
  params: VideoParams;
  cancellation?: CancellationToken;
};

export type VideoPipelineOutput = {
  storyboardId: string;
  clips: Clip[];
  finalVideoUrl?: string;
  errors: ShotError[];
  completedAt: string;
};

// ── Types the master references but does not define ──────────────────────────────────────────────────────────────

/**
 * Anything with `aborted` — an AbortController's signal works as-is. Checked before each shot, before a submit and
 * between polls: Veo has no cancel call, so a clip already submitted may still bill.
 */
export type CancellationToken = { readonly aborted: boolean };

/** Run context, not creative parameters: nothing here can change what a shot renders. */
export type VideoParams = {
  /** Groups the run's Veo inputs/outputs (the Vertex GCS prefix). Default: derived from the storyboard id. */
  sessionId?: string;
  /** Who the Google spend is booked against in the platform budget guard. */
  userId?: string | null;
};

/** What one shot was rendered with, so a finished clip can be audited against its frozen shot (V6). */
export type ShotMetadata = {
  providerName: 'google_veo';
  model: string;
  transport: 'vertex' | 'gemini';
  operationName: string;
  durationSeconds: number;
  aspectRatio: string;
  quality: string;
  resolution: string;
  seed?: number;
  /** Where the seed came from (V4: the shot's own overrides the lock's). */
  seedSource?: 'shot' | 'consistency_lock';
  /** Where the reference image came from — the URL itself is not copied here (it may be a signed URL). */
  referenceImageSource?: 'shot' | 'consistency_lock';
};

export type Clip = {
  shotId: string;
  order: number;
  url: string;
  durationSeconds: number;
  metadata: ShotMetadata;
};

/** What the director hands the provider for one shot. Both objects are the frozen storyboard's own. */
export type ShotGenerationInput = {
  storyboardId: string;
  shot: Shot;
  consistencyLock: ConsistencyLock;
  params?: VideoParams;
  /** Lets the director turn the provider's stages into ShotProgressEvents. */
  onStage?: (stage: 'generating' | 'finalizing') => void;
};

/** planStoryboard's input. Everything except the brief and the frame is optional and lands in the draft as given. */
export type StoryboardPlanInput = {
  /** The user's idea, in any language. */
  brief: string;
  title?: string;
  /** 1–12; default 3. */
  shotCount?: number;
  /** Locked for every shot: 16:9 or 9:16. */
  aspectRatio: string;
  /** Per shot; default 8 (the only length Veo renders with a reference image). */
  durationSeconds?: number;
  /** Veo tier; default the studio's priced default ('fast'). */
  quality?: string;
  seed?: number;
  characterReference?: string;
  styleReference?: string;
  /** BCP-47 of the brief; shot descriptions are written in it, prompts in English (Veo's evaluated language). */
  language?: string;
};

/** The injected LLM step behind planStoryboard. It drafts; it never approves. */
export type StoryboardPlanner = (input: StoryboardPlanInput) => Promise<Storyboard>;

// ── The run result (extends VideoPipelineOutput) ─────────────────────────────────────────────────────────────────

/** The user's choices when a shot fails (V2, V5). There is no "skip". */
export type ShotDecision = 'retry' | 'edit' | 'cancel';

export type StoryboardRunState = Extract<TaskState, 'completed' | 'cancelled' | 'waiting_for_shot_decision'>;

export type StoryboardRun = VideoPipelineOutput & {
  state: StoryboardRunState;
  /** The frozen storyboard this run executes — what a retry resumes. */
  storyboard: FrozenStoryboard;
  /** Set only while state is waiting_for_shot_decision. */
  pendingDecision?: {
    shotId: string;
    shotIndex: number;
    error: ShotError;
    options: readonly ShotDecision[];
  };
};

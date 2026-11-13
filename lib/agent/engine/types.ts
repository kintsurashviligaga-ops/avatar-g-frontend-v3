/**
 * lib/agent/engine — the Agent G execution engine, v5.1 Phase 3 foundation (M-4 VALIDATE, M-8 parallel DAG; design:
 * docs/v5.1-phase1/06-execution-lifecycle.md, docs/v5.1-phase3/00-engine-architecture.md).
 *
 * PURE. Nothing in this folder touches a database, Google, a sandbox or the ledger: the planner model, the executors,
 * the clock and the store are passed in. That is what lets the whole lifecycle be tested with mocked data now, and
 * wired to lib/agent/run (media runs) and lib/agent/taskGraph (work-mode tasks) later, behind a flag, with GG's OK.
 *
 * The run status reuses lib/agent/contracts RunStatus and moves only along RUN_TRANSITIONS, so a run the engine drives
 * reads the same to every card, route and audit row that already knows runs. Pause is a flag on a running or queued run
 * (the contract has no `paused` status yet; adding one is a contract change for the wiring step).
 */
import type { RunStatus } from '../contracts';

/** What a step does. Each maps to a tool the platform already runs as a user-confirmed action. */
export const ENGINE_TOOLS = [
  'research',   // browser task: read pages, keep text + screenshot (lib/agent/browser)
  'code',       // workspace program in the Vercel Sandbox (lib/agent/sandbox)
  'pdf',        // Georgian PDF from a JSON spec (lib/documents)
  'image',      // a picture (gemini-3.1-flash-image)
  'video',      // a clip (Veo / Omni)
  'music',      // a song (Lyria)
  'speech',     // read-aloud (gemini-3.8-flash-tts)
  'write',      // text by the chat model (summary, script, caption)
  'export',     // file a workspace file in the Library
] as const;
export type EngineTool = (typeof ENGINE_TOOLS)[number];

/** Tools that run in the Vercel Sandbox: at most one per user at a time (cost and the $20 cap, 06 §3). */
export const SANDBOX_TOOLS: ReadonlySet<EngineTool> = new Set(['code']);

export const MAX_STEPS = 12;
export const MAX_DEPENDS = 6;
/** Independent steps one run keeps going at once (06 §3). */
export const MAX_WORKERS = 3;
/** Sandbox steps one USER keeps going at once, across every run (06 §3). */
export const MAX_SANDBOX_PER_USER = 1;
/** One retry per step on a retryable error; two replans per run; a run deadline (06 §3). */
export const MAX_STEP_RETRIES = 1;
export const MAX_REPLANS = 2;
export const DEFAULT_RUN_DEADLINE_MS = 10 * 60_000;

export interface PlanStep {
  id: string;
  tool: EngineTool;
  title: string;
  /** Earlier steps whose outputs this one reads. */
  dependsOn: string[];
  /** The tool's own parameters, as the planner wrote them (each executor checks its own). */
  params: Record<string, unknown>;
  /** The planner's guess, in credits; the real price is the step's QUOTE. */
  estimateCredits: number;
}

export interface Plan {
  title: string;
  steps: PlanStep[];
}

export type StepStatus =
  | 'pending'    // waiting for its inputs
  | 'running'    // an executor has it (a result is VERIFIED in the tick it arrives, before it counts as done)
  | 'done'
  | 'failed'
  | 'skipped'    // an input failed or was stopped: it can never run
  | 'cancelled'; // stopped by the owner, the deadline or a replan

export const TERMINAL_STEP: ReadonlySet<StepStatus> = new Set(['done', 'failed', 'skipped', 'cancelled']);

export interface StepState {
  id: string;
  status: StepStatus;
  attempts: number;
  /** The executor's handle for the attempt in flight (a job id), so a late answer from an old attempt is ignored. */
  attemptId?: string;
  startedAt?: number;
  endedAt?: number;
  /** Checkpoint: what the outputs were made from, and where they are. Resume reuses a step with the same hash. */
  inputsHash?: string;
  outputs?: string[];
  credits?: number;
  error?: string;
  /** Delivered by an earlier run and reused, never paid again. */
  reused?: boolean;
}

/** What a done step was made from and where its outputs are: enough to reuse it in a later run. */
export interface Checkpoint {
  inputsHash: string;
  outputs: string[];
}

export interface EngineRun {
  v: 1;
  id: string;
  status: RunStatus;
  plan: Plan;
  steps: StepState[];
  paused: boolean;
  cancelRequested: boolean;
  replans: number;
  createdAt: number;
  deadlineAt: number;
  error?: string;
  seq: number;
  /** Checkpoints of an earlier run this one carries on from: a step with the same inputs hash is reused, not re-run. */
  reuse?: Record<string, Checkpoint>;
}

/** The timeline vocabulary of 06 §4; the spinner / ✓ / fold card (#272, #275) renders these. */
export type TimelineType =
  | 'run.planned' | 'step.queued' | 'step.started' | 'step.progress' | 'step.checkpoint' | 'step.needs_approval'
  | 'step.done' | 'step.failed' | 'step.skipped' | 'step.cancelled' | 'step.retry'
  | 'run.paused' | 'run.resumed' | 'run.replanned' | 'run.cost' | 'run.status' | 'run.delivered';

export interface TimelineEvent {
  seq: number;
  runId: string;
  stepId?: string;
  at: number;
  type: TimelineType;
  data?: Record<string, unknown>;
}

/** What the caller must do after a tick. The engine never does it itself. */
export type EngineEffect =
  | { type: 'start'; stepId: string; attemptId: string; tool: EngineTool; inputs: string[] }
  | { type: 'stop'; stepId: string; attemptId: string };

/** An executor's answer about one attempt. */
export type StepResult =
  | { stepId: string; attemptId: string; ok: true; outputs: string[]; credits: number; inputsHash?: string }
  | { stepId: string; attemptId: string; ok: false; error: string; retryable: boolean; credits?: number };

export type EngineCommand = 'pause' | 'resume' | 'cancel';

export interface TickInput {
  now: number;
  results?: StepResult[];
  commands?: EngineCommand[];
  /** Sandbox steps this user has running in OTHER runs right now (the 1-per-user limit spans runs). */
  sandboxBusyElsewhere?: number;
}

/** A step's result is checked before it counts (06 VERIFY). Pure: reads the result, never fetches. */
export type Verifier = (step: PlanStep, outputs: string[]) => { ok: true } | { ok: false; error: string; retryable: boolean };

export interface TickOutput {
  run: EngineRun;
  effects: EngineEffect[];
  events: TimelineEvent[];
}

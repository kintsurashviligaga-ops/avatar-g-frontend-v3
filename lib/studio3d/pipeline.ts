/**
 * lib/studio3d/pipeline.ts — the 3D Studio job as a pure state machine. No I/O: the routes (PR B) load a job row, call
 * `advance(job, event)`, persist the result and perform the returned `effects` (charge, refund, start the worker, …).
 *
 *   check ─► reference ─► awaiting_approval ─► queued ─► starting ─► shape ─► texture ─► export ─► done
 *     │          │               │               │           │          │          │         │
 *     └──────────┴───────────────┴───────────────┴───────────┴──────────┴──────────┴─────────┴──► failed
 *
 * Image mode skips `reference` and `awaiting_approval` (the user's photo IS the reference).
 *
 * BILLING (live billing/BOG untouched; this only describes ledger effects for the existing wallet helpers):
 *   - the reference picture is charged when it is DELIVERED (same as the Art Director image), ref `studio3d:<id>:ref`;
 *   - the model price is HELD when the job is queued and CHARGED only when the GLB is delivered, ref `studio3d:<id>`;
 *   - any failure after the hold releases it with ref `studio3d:<id>:refund`. Refs are idempotent, so a retried event
 *     never charges or refunds twice.
 */
import type { Studio3dMode } from './spec';

export type Studio3dStep =
  | 'check'
  | 'reference'
  | 'awaiting_approval'
  | 'queued'
  | 'starting'
  | 'shape'
  | 'texture'
  | 'export'
  | 'done'
  | 'failed';

export const STEP_ORDER: Studio3dStep[] = ['check', 'reference', 'awaiting_approval', 'queued', 'starting', 'shape', 'texture', 'export', 'done'];

export interface Studio3dJob {
  id: string;
  mode: Studio3dMode;
  step: Studio3dStep;
  /** Credits of the model step (held → charged). */
  modelCredits: number;
  /** Credits of the reference picture (0 in image mode). */
  referenceCredits: number;
  held: boolean;
  charged: boolean;
  refunded: boolean;
  referenceCharged: boolean;
  error?: string;
  /** Cloud Run execution name once started. */
  execution?: string;
  outputs?: Studio3dOutputs;
}

export interface Studio3dOutputs {
  glb: string;
  turntable?: string;
  preview?: string;
  faces?: number;
  gpuSeconds?: number;
}

export type Studio3dEvent =
  | { type: 'safety'; verdict: 'allow' | 'block' }
  | { type: 'reference_ready' }
  | { type: 'approve' }
  | { type: 'admitted' }
  | { type: 'started'; execution: string }
  | { type: 'progress'; step: 'shape' | 'texture' | 'export' }
  | { type: 'delivered'; outputs: Studio3dOutputs }
  | { type: 'fail'; error: string }
  | { type: 'cancel' };

export type Effect =
  | { kind: 'charge'; ref: string; credits: number }
  | { kind: 'hold'; ref: string; credits: number }
  | { kind: 'release'; ref: string; credits: number }
  | { kind: 'make_reference' }
  | { kind: 'start_worker' }
  | { kind: 'notify'; step: Studio3dStep };

export const chargeRef = (id: string) => `studio3d:${id}`;
export const refundRef = (id: string) => `studio3d:${id}:refund`;
export const referenceRef = (id: string) => `studio3d:${id}:ref`;

export function newJob(id: string, mode: Studio3dMode, modelCredits: number, referenceCredits: number): Studio3dJob {
  return {
    id,
    mode,
    step: 'check',
    modelCredits,
    referenceCredits: mode === 'image' ? 0 : referenceCredits,
    held: false,
    charged: false,
    refunded: false,
    referenceCharged: false,
  };
}

export interface Advance {
  job: Studio3dJob;
  effects: Effect[];
  /** false when the event does not fit the current step (ignored, job unchanged). */
  applied: boolean;
}

const TERMINAL: Studio3dStep[] = ['done', 'failed'];

function fail(job: Studio3dJob, error: string): Advance {
  const effects: Effect[] = [];
  let next = { ...job, step: 'failed' as const, error };
  if (job.held && !job.charged && !job.refunded) {
    effects.push({ kind: 'release', ref: refundRef(job.id), credits: job.modelCredits });
    next = { ...next, held: false, refunded: true };
  }
  effects.push({ kind: 'notify', step: 'failed' });
  return { job: next, effects, applied: true };
}

const ignore = (job: Studio3dJob): Advance => ({ job, effects: [], applied: false });

export function advance(job: Studio3dJob, ev: Studio3dEvent): Advance {
  if (TERMINAL.includes(job.step)) return ignore(job);
  if (ev.type === 'fail') return fail(job, ev.error.slice(0, 300));
  if (ev.type === 'cancel') {
    // Once the GPU is running the work is paid for; cancel is only allowed before the worker starts.
    if (['starting', 'shape', 'texture', 'export'].includes(job.step)) return ignore(job);
    return fail(job, 'cancelled');
  }

  switch (job.step) {
    case 'check':
      if (ev.type !== 'safety') return ignore(job);
      if (ev.verdict === 'block') return fail(job, 'blocked');
      if (job.mode === 'image') return toQueued(job);
      return { job: { ...job, step: 'reference' }, effects: [{ kind: 'make_reference' }, { kind: 'notify', step: 'reference' }], applied: true };

    case 'reference': {
      if (ev.type !== 'reference_ready') return ignore(job);
      const effects: Effect[] = [];
      let next: Studio3dJob = { ...job, step: 'awaiting_approval' };
      if (!job.referenceCharged && job.referenceCredits > 0) {
        effects.push({ kind: 'charge', ref: referenceRef(job.id), credits: job.referenceCredits });
        next = { ...next, referenceCharged: true };
      }
      effects.push({ kind: 'notify', step: 'awaiting_approval' });
      return { job: next, effects, applied: true };
    }

    case 'awaiting_approval':
      return ev.type === 'approve' ? toQueued(job) : ignore(job);

    case 'queued':
      if (ev.type !== 'admitted') return ignore(job);
      return { job: { ...job, step: 'starting' }, effects: [{ kind: 'start_worker' }, { kind: 'notify', step: 'starting' }], applied: true };

    case 'starting':
      if (ev.type === 'started') return { job: { ...job, execution: ev.execution, step: 'shape' }, effects: [{ kind: 'notify', step: 'shape' }], applied: true };
      return workerEvent(job, ev);

    case 'shape':
    case 'texture':
    case 'export':
      return workerEvent(job, ev);
  }
  return ignore(job);
}

function toQueued(job: Studio3dJob): Advance {
  const effects: Effect[] = [];
  let next: Studio3dJob = { ...job, step: 'queued' };
  if (!job.held) {
    effects.push({ kind: 'hold', ref: chargeRef(job.id), credits: job.modelCredits });
    next = { ...next, held: true };
  }
  effects.push({ kind: 'notify', step: 'queued' });
  return { job: next, effects, applied: true };
}

function workerEvent(job: Studio3dJob, ev: Studio3dEvent): Advance {
  if (ev.type === 'progress') {
    // Steps only move forward.
    if (STEP_ORDER.indexOf(ev.step) <= STEP_ORDER.indexOf(job.step)) return ignore(job);
    return { job: { ...job, step: ev.step }, effects: [{ kind: 'notify', step: ev.step }], applied: true };
  }
  if (ev.type === 'delivered') {
    if (!ev.outputs?.glb) return fail(job, 'worker returned no model');
    const effects: Effect[] = [];
    let next: Studio3dJob = { ...job, step: 'done', outputs: ev.outputs };
    if (!job.charged) {
      effects.push({ kind: 'charge', ref: chargeRef(job.id), credits: job.modelCredits });
      next = { ...next, charged: true };
    }
    effects.push({ kind: 'notify', step: 'done' });
    return { job: next, effects, applied: true };
  }
  return ignore(job);
}

/* ------------------------------------------------------------------ admission ------------------------------------------------------------------ */

export const MAX_PARALLEL = 3; // Cloud Run GPU quota in europe-west4
export const DEFAULT_DAILY_CAP = 200;

export type Admission = { ok: true; position: 0 } | { ok: true; position: number } | { ok: false; reason: 'daily_cap' | 'user_busy' };

/**
 * Decide what to do with a new job: run now (position 0), wait in the queue (position n), or refuse.
 * One running/queued job per user keeps a single person from filling the 3 GPUs.
 */
export function admit(args: { running: number; queued: number; todayTotal: number; userActive: number; dailyCap?: number }): Admission {
  const cap = args.dailyCap ?? DEFAULT_DAILY_CAP;
  if (args.todayTotal >= cap) return { ok: false, reason: 'daily_cap' };
  if (args.userActive > 0) return { ok: false, reason: 'user_busy' };
  if (args.running < MAX_PARALLEL && args.queued === 0) return { ok: true, position: 0 };
  return { ok: true, position: args.queued + 1 };
}

/** Rough wait shown on the card: the shape is ~2 min, every job ahead adds one run divided by the 3 GPUs. */
export function etaSeconds(position: number, perRun = 130): number {
  return perRun + Math.ceil(Math.max(0, position) / MAX_PARALLEL) * perRun;
}

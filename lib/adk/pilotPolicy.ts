/**
 * lib/adk/pilotPolicy.ts — the bounds of one Google ADK pilot run (MASTER TASK v3.1 §2.4, Phase 5).
 *
 * The pilot is a READ-ONLY agent over the existing registry and task infrastructure. Two permissions are kept apart:
 *   · TOOLS: read-only, always. The four pilot tools (./pilotTools) read the caller's own capabilities, tasks and library
 *     metadata, or PROPOSE a plan. None of them can start a job, quote with a signed token, move credits, write a row,
 *     run SQL, a shell or a browser, delete an asset, or approve anything. That is not a setting; there is no such tool.
 *   · PAID MODEL CALLS: off. `maxSpendUsd` is 0, so any model that says a call costs money is stopped before the call
 *     (`budget_exhausted`). Only the fake models of the tests cost nothing. A live pilot needs the owner's billing
 *     authorization and a reserved budget first (v3.1: "any live pilot remains subject to billing authorization").
 *
 * Every run is bounded: model calls, tool calls, a deadline, the size of what a model is sent and of each tool result,
 * and the spend. A stop is a typed outcome, never a hang and never an exception the caller has to guess at.
 * The caller's cancellation (an AbortSignal) is checked before every model and tool call and is passed into every read.
 * Pure: no I/O, no env; the ADK binding (pilots/adk) and the tests drive it.
 */

export interface PilotLimits {
  /** Model calls in one run (each turn of the model, including the one after a tool result). */
  maxModelCalls: number;
  /** Tool calls in one run, refused ones included. */
  maxToolCalls: number;
  /** The whole run, from start to the last event. */
  deadlineMs: number;
  /** One tool result, as JSON characters, wrapper included (./untrusted). */
  maxToolOutputChars: number;
  /** One model request: the conversation plus tool results, as characters. */
  maxContextChars: number;
  /** Money one run may spend on model calls. 0 = no paid call at all. */
  maxSpendUsd: number;
}

export const PILOT_LIMITS: Readonly<PilotLimits> = Object.freeze({
  maxModelCalls: 6,
  maxToolCalls: 8,
  deadlineMs: 20_000,
  maxToolOutputChars: 6_000,
  maxContextChars: 24_000,
  maxSpendUsd: 0,
});

/** Why a run stopped before the model finished on its own. */
export type PilotStop = 'cancelled' | 'deadline' | 'model_call_limit' | 'context_too_large' | 'budget_exhausted';

/** One run's state. Owned by the harness; tools and the model only ever see what the harness hands them. */
export interface PilotRunContext {
  /** The signed-in caller, from the session. Never read from a model's arguments. */
  readonly userId: string;
  /** Carried into every read and every outcome, so a run can be followed end to end. */
  readonly traceId: string;
  /** The files the user attached to THIS message (storage paths or our signed links): the only files a plan may name. */
  readonly attachments: readonly string[];
  readonly limits: Readonly<PilotLimits>;
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly now: () => number;
  readonly newId: () => string;
  modelCalls: number;
  toolCalls: number;
  spentUsd: number;
  /** The first stop reached; later checks report the same one. */
  stop: PilotStop | null;
}

export function createRunContext(input: {
  userId: string;
  traceId: string;
  attachments?: readonly string[];
  signal: AbortSignal;
  limits?: Partial<PilotLimits>;
  now?: () => number;
  newId?: () => string;
}): PilotRunContext {
  if (!input.userId || typeof input.userId !== 'string') throw new Error('A pilot run needs the signed-in user.');
  if (!input.traceId) throw new Error('A pilot run needs a trace id.');
  const now = input.now ?? Date.now;
  const limits = Object.freeze({ ...PILOT_LIMITS, ...(input.limits ?? {}) });
  return {
    userId: input.userId,
    traceId: input.traceId,
    attachments: Object.freeze([...(input.attachments ?? [])]),
    limits,
    signal: input.signal,
    startedAt: now(),
    now,
    newId: input.newId ?? (() => globalThis.crypto.randomUUID()),
    modelCalls: 0,
    toolCalls: 0,
    spentUsd: 0,
    stop: null,
  };
}

/** Milliseconds left before the run's deadline (never below 0). */
export const msLeft = (ctx: PilotRunContext): number => Math.max(0, ctx.startedAt + ctx.limits.deadlineMs - ctx.now());

/** The stop that applies to ANY next step: the caller's cancellation, then the deadline. */
export function runStop(ctx: PilotRunContext): PilotStop | null {
  if (ctx.stop) return ctx.stop;
  if (ctx.signal.aborted) return (ctx.stop = 'cancelled');
  if (msLeft(ctx) <= 0) return (ctx.stop = 'deadline');
  return null;
}

/**
 * May the next model call go out? `chars` is the size of the request, `estUsd` what the model says it will cost
 * (0 for a fake model). Counts the call only when it is admitted.
 */
export function admitModelCall(ctx: PilotRunContext, req: { chars: number; estUsd: number }): { ok: true } | { ok: false; stop: PilotStop } {
  const stop = runStop(ctx);
  if (stop) return { ok: false, stop };
  if (ctx.modelCalls >= ctx.limits.maxModelCalls) return { ok: false, stop: (ctx.stop = 'model_call_limit') };
  if (!Number.isFinite(req.chars) || req.chars > ctx.limits.maxContextChars) return { ok: false, stop: (ctx.stop = 'context_too_large') };
  const est = Number.isFinite(req.estUsd) && req.estUsd > 0 ? req.estUsd : req.estUsd === 0 ? 0 : Number.POSITIVE_INFINITY;
  if (ctx.spentUsd + est > ctx.limits.maxSpendUsd) return { ok: false, stop: (ctx.stop = 'budget_exhausted') };
  ctx.modelCalls += 1;
  ctx.spentUsd += est;
  return { ok: true };
}

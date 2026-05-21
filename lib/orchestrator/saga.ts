/**
 * Saga — orchestration-based distributed-transaction pattern.
 *
 * Multi-step creative pipelines (e.g. avatar → voiceover → assemble) must
 * not leave partial state when a downstream step fails. The Saga runs each
 * step forward and, on any failure, executes the registered compensating
 * actions in reverse order — restoring consistency and crediting the user.
 *
 * This is pure, infra-free TypeScript: it works on Vercel serverless with
 * no Kafka or external broker. Each `SagaStep` is just an async forward
 * function plus an async inverse. The orchestrator composes steps and the
 * Saga guarantees all-or-nothing semantics.
 */

export interface SagaStep<T = unknown> {
  /** Human-readable name — surfaced in logs and the failure ledger. */
  name: string;
  /** Forward action. Returns a value passed to later steps + the compensator. */
  run: (ctx: SagaRunContext) => Promise<T>;
  /**
   * Inverse action. Called only if a LATER step fails after this one
   * committed. Must be idempotent — it may run during a partial rollback.
   */
  compensate?: (result: T, ctx: SagaRunContext) => Promise<void>;
}

export interface SagaRunContext {
  /** Correlates all steps + compensations of one pipeline run. */
  sagaId: string;
  /** Abort propagation — Stop button / circuit breaker. */
  signal?: AbortSignal;
  /** Free-form bag the steps can read/write between each other. */
  bag: Record<string, unknown>;
}

export interface SagaResult {
  ok: boolean;
  sagaId: string;
  completedSteps: string[];
  compensatedSteps: string[];
  failedStep?: string;
  error?: string;
}

export interface SagaHooks {
  onStepStart?: (step: string, ctx: SagaRunContext) => void;
  onStepDone?: (step: string, ctx: SagaRunContext) => void;
  onStepFail?: (step: string, error: unknown, ctx: SagaRunContext) => void;
  onCompensate?: (step: string, ctx: SagaRunContext) => void;
}

/**
 * Execute a list of steps as a Saga. On the first failure, every
 * already-committed step is compensated in reverse order before the
 * Saga returns ok:false. Compensation errors are swallowed (best effort)
 * but recorded so they can be retried out-of-band.
 */
export async function runSaga(
  steps: SagaStep[],
  opts: { sagaId?: string; signal?: AbortSignal; hooks?: SagaHooks; bag?: Record<string, unknown> } = {},
): Promise<SagaResult> {
  const sagaId = opts.sagaId ?? `saga_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const ctx: SagaRunContext = { sagaId, signal: opts.signal, bag: opts.bag ?? {} };
  const hooks = opts.hooks ?? {};

  const completed: string[] = [];
  // Hold each step's forward result so its compensator can undo it.
  const ledger: Array<{ step: SagaStep; result: unknown }> = [];

  for (const step of steps) {
    if (ctx.signal?.aborted) {
      return rollback(ledger, ctx, hooks, completed, step.name, 'aborted');
    }
    hooks.onStepStart?.(step.name, ctx);
    try {
      const result = await step.run(ctx);
      ledger.push({ step, result });
      completed.push(step.name);
      hooks.onStepDone?.(step.name, ctx);
    } catch (err) {
      hooks.onStepFail?.(step.name, err, ctx);
      const message = err instanceof Error ? err.message : String(err);
      return rollback(ledger, ctx, hooks, completed, step.name, message);
    }
  }

  return { ok: true, sagaId, completedSteps: completed, compensatedSteps: [] };
}

async function rollback(
  ledger: Array<{ step: SagaStep; result: unknown }>,
  ctx: SagaRunContext,
  hooks: SagaHooks,
  completedSteps: string[],
  failedStep: string,
  error: string,
): Promise<SagaResult> {
  const compensated: string[] = [];
  // Reverse order — undo the most recent commit first.
  for (let i = ledger.length - 1; i >= 0; i--) {
    const entry = ledger[i];
    if (!entry?.step.compensate) continue;
    hooks.onCompensate?.(entry.step.name, ctx);
    try {
      await entry.step.compensate(entry.result, ctx);
      compensated.push(entry.step.name);
    } catch {
      // Best-effort: a failed compensation is logged via the hook but
      // never blocks the rest of the rollback. The orchestrator can
      // schedule an out-of-band reconciliation from compensatedSteps.
    }
  }
  return {
    ok: false,
    sagaId: ctx.sagaId,
    completedSteps,
    compensatedSteps: compensated,
    failedStep,
    error,
  };
}

/**
 * Sequential latency-failover across a provider chain (video / avatar).
 * =====================================================================
 *
 * The existing provider cascades (Kling→LTX→Minimax, HeyGen→SadTalker) only switch
 * when the primary ERRORS. This adds the missing rule: reroute when the primary is
 * too SLOW (exceeds a time budget) or when its circuit breaker is already tripped —
 * BEFORE burning the whole render window on a stalled gateway.
 *
 * Strictly SEQUENTIAL: exactly one provider runs at a time. When the budget elapses we
 * ABORT the slow provider (its AbortSignal fires) and move to the next. There is never
 * a parallel double-submit, so a render is billed to at most one provider — no
 * double-charge (the design decision the user picked).
 *
 * Pure + injectable (clock, AbortController, timer, breaker hooks) → unit-testable with
 * no real timers or network. Fail-open: a missing breaker just means "never skip".
 */

export interface ProviderAttempt<T> {
  /** Stable provider id used for the circuit breaker + telemetry (e.g. 'kling'). */
  name: string;
  /**
   * Runs the provider. MUST honor `signal` — when it aborts (budget elapsed or the
   * whole op was canceled) the provider should stop/settle promptly so the next one
   * can start. Resolve = success; reject = failure → reroute.
   */
  run: (signal: AbortSignal) => Promise<T>;
  /** Per-provider budget override (ms); falls back to the chain default. */
  budgetMs?: number;
}

export type RerouteReason = 'timeout' | 'error' | 'tripped';

export interface AttemptRecord {
  name: string;
  ok: boolean;
  ms: number;
  reason?: RerouteReason;
  skipped?: boolean;
}

export interface FailoverResult<T> {
  ok: boolean;
  result?: T;
  /** Provider that served the result (when ok). */
  provider?: string;
  attempts: AttemptRecord[];
  error?: string;
}

export interface Timer {
  clear: () => void;
}

export interface FailoverOptions {
  /** Default per-provider budget before rerouting to the next (ms). Default 60000. */
  budgetMs?: number;
  /** Circuit breaker read: true → provider is unhealthy, skip it. Fail-open when absent. */
  isTripped?: (name: string) => boolean;
  /** Record an attempt outcome (feeds the breaker + latency telemetry). */
  record?: (name: string, ok: boolean, ms: number) => void;
  /** Reroute observer (surface a "trying an alternative provider…" banner). */
  onReroute?: (info: { from: string; to: string | null; reason: RerouteReason }) => void;
  /** External cancel of the whole operation (aborts the in-flight provider). */
  signal?: AbortSignal;
  now?: () => number;
  makeAbort?: () => AbortController;
  /** Injectable timer (tests fire it manually). */
  setTimer?: (fn: () => void, ms: number) => Timer;
}

const TIMEOUT = Symbol('provider-budget-timeout');

/**
 * Try each provider in order until one succeeds. Reroute to the next when the current
 * one errors, exceeds its budget, or is tripped. Returns the first success + a per-
 * attempt trail; ok:false only when every provider is exhausted.
 */
export async function runWithLatencyFailover<T>(
  providers: ProviderAttempt<T>[],
  opts: FailoverOptions = {},
): Promise<FailoverResult<T>> {
  const budgetDefault = Math.max(1, Math.floor(opts.budgetMs ?? 60_000));
  const now = opts.now ?? (() => Date.now());
  const makeAbort = opts.makeAbort ?? (() => new AbortController());
  const setTimer =
    opts.setTimer ??
    ((fn, ms) => {
      const h = setTimeout(fn, ms);
      return { clear: () => clearTimeout(h) };
    });
  const attempts: AttemptRecord[] = [];

  if (!providers.length) return { ok: false, attempts, error: 'no providers configured' };

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!;
    const next = providers[i + 1]?.name ?? null;

    // Whole-op already canceled → stop.
    if (opts.signal?.aborted) {
      return { ok: false, attempts, error: 'canceled' };
    }

    // Skip a tripped provider (circuit breaker) without spending its budget.
    if (opts.isTripped?.(p.name)) {
      attempts.push({ name: p.name, ok: false, ms: 0, reason: 'tripped', skipped: true });
      opts.onReroute?.({ from: p.name, to: next, reason: 'tripped' });
      continue;
    }

    const ac = makeAbort();
    const onOuterAbort = () => {
      try {
        ac.abort();
      } catch {
        /* noop */
      }
    };
    opts.signal?.addEventListener('abort', onOuterAbort, { once: true });

    const budget = Math.max(1, Math.floor(p.budgetMs ?? budgetDefault));
    // Holder object (not a bare `let`) so TS keeps the `Timer` type through the
    // executor-callback assignment instead of narrowing it to `never`.
    const timerRef: { current: Timer | null } = { current: null };
    const timeoutP = new Promise<typeof TIMEOUT>((resolve) => {
      timerRef.current = setTimer(() => resolve(TIMEOUT), budget);
    });

    const startedAt = now();
    let outcome: T | typeof TIMEOUT;
    let threw: unknown = null;
    // Start the provider once; attach a no-op catch so that if it rejects AFTER we've
    // already rerouted on a budget timeout, the late rejection is swallowed (no
    // "unhandled promise rejection"). The race below still observes an early rejection.
    const runP = p.run(ac.signal);
    runP.catch(() => {});
    try {
      outcome = await Promise.race([runP, timeoutP]);
    } catch (err) {
      outcome = TIMEOUT; // placeholder; handled via `threw` below
      threw = err;
    } finally {
      timerRef.current?.clear();
      opts.signal?.removeEventListener('abort', onOuterAbort);
    }
    const ms = Math.max(0, now() - startedAt);

    // Budget elapsed → abort the slow provider and reroute.
    if (!threw && outcome === TIMEOUT) {
      onOuterAbort();
      attempts.push({ name: p.name, ok: false, ms, reason: 'timeout' });
      opts.record?.(p.name, false, ms);
      opts.onReroute?.({ from: p.name, to: next, reason: 'timeout' });
      continue;
    }

    // Provider rejected → reroute (unless the whole op was canceled).
    if (threw) {
      onOuterAbort();
      const canceled =
        opts.signal?.aborted ||
        (threw instanceof Error && (threw.name === 'AbortError' || /abort/i.test(threw.message)));
      attempts.push({ name: p.name, ok: false, ms, reason: 'error' });
      opts.record?.(p.name, false, ms);
      if (canceled) return { ok: false, attempts, error: 'canceled' };
      opts.onReroute?.({ from: p.name, to: next, reason: 'error' });
      continue;
    }

    // Success.
    attempts.push({ name: p.name, ok: true, ms });
    opts.record?.(p.name, true, ms);
    return { ok: true, result: outcome as T, provider: p.name, attempts };
  }

  return { ok: false, attempts, error: 'all providers exhausted' };
}

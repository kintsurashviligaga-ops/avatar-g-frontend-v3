/**
 * lib/speech/deadline.ts — one deadline and one retry budget for a speech request (MASTER TASK v3.1 §5.3.4).
 *
 * Before this, a read-aloud chunk had three clocks that did not agree: the browser gave up after 25 s, the route
 * allowed 3 attempts of 25 s each, and the function itself is stopped at 30 s (maxDuration). A browser that gave up
 * left the route retrying, and spending, for a listener who was gone. Now:
 *
 *   · the route has ONE end-to-end deadline, SPEECH_DEADLINE_MS from the moment the request arrived, inside the 30 s
 *     function limit, and at most SPEECH_MAX_ATTEMPTS provider calls within it;
 *   · a second attempt starts only on a retryable failure and only with at least SPEECH_RETRY_MIN_MS left;
 *   · the browser closing the request (stop, another message, unmount) aborts the call in flight and no new one starts;
 *   · the browser waits SPEECH_CLIENT_DEADLINE_MS, a little longer than the route, so the route's own answer (a 504)
 *     arrives first; the browser never retries a chunk on its own.
 *
 * Pure (setTimeout and AbortController only), so the route, the browser and the tests share it. AbortSignal.any is not
 * used: Safari before 17.4 does not have it, and a missing API there would silence the read-aloud.
 */

/** The route's whole budget for one chunk, counted from when the request arrived. The function limit is 30 s. */
export const SPEECH_DEADLINE_MS = 25_000;
/** Provider calls per chunk, the first one included. */
export const SPEECH_MAX_ATTEMPTS = 2;
/** A second attempt is not started with less than this left: it would most likely be cut off half-way. */
export const SPEECH_RETRY_MIN_MS = 5_000;
/** How long the browser waits for one chunk: the route's deadline plus the trip, so the route's answer comes first. */
export const SPEECH_CLIENT_DEADLINE_MS = SPEECH_DEADLINE_MS + 3_000;

export type DeadlineCause = 'timeout' | 'cancelled';

export interface Deadline {
  /** Aborts at the deadline or when any linked signal aborts, whichever is first. */
  readonly signal: AbortSignal;
  /** Milliseconds left, 0 once past. */
  remaining(): number;
  /** Why it aborted, or null while it has not. */
  cause(): DeadlineCause | null;
  /** Clears the timer and unlinks the outer signals. Safe to call more than once. */
  dispose(): void;
}

/** A deadline `ms` from now, also aborted by any of `linked` (a request's or a caller's signal). */
export function speechDeadline(ms: number, ...linked: Array<AbortSignal | null | undefined>): Deadline {
  const ctrl = new AbortController();
  const endsAt = Date.now() + Math.max(0, ms);
  let why: DeadlineCause | null = null;
  const stop = (cause: DeadlineCause) => {
    if (ctrl.signal.aborted) return;
    why = cause;
    ctrl.abort(cause === 'timeout' ? new DOMException('speech deadline passed', 'TimeoutError') : new DOMException('speech request cancelled', 'AbortError'));
  };
  const onLinkedAbort = () => stop('cancelled');
  const outer = linked.filter((s): s is AbortSignal => !!s);
  for (const s of outer) {
    if (s.aborted) { stop('cancelled'); break; }
    s.addEventListener('abort', onLinkedAbort, { once: true });
  }
  const timer = ctrl.signal.aborted ? undefined : setTimeout(() => stop('timeout'), Math.max(0, ms));
  return {
    signal: ctrl.signal,
    remaining: () => Math.max(0, endsAt - Date.now()),
    cause: () => why,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const s of outer) s.removeEventListener('abort', onLinkedAbort);
    },
  };
}

/** Resolves after `ms`, or as soon as `signal` aborts (then false). For the pause between attempts. */
export function pauseUnlessAborted(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => { clearTimeout(timer); resolve(false); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(true); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Reliability telemetry (Iteration 6, WS4). Emits a single structured signal whenever a surface serves a
 * request through a vendor fallback or returns a degraded result, so provider failovers and degraded
 * states are instantly queryable in Vercel/Sentry logs (filter `event:"reliability"`).
 *
 * Shape: { surface, providerServed, fallbackDepth, degraded, ...extra }.
 *
 * STRICTLY NON-BLOCKING (WS4 task 3): every call is wrapped so a logging failure can NEVER propagate into
 * a live user transaction or billing flow. Degraded signals log at `warn` (so a Vercel/Sentry alert can
 * key on level:warn + event:reliability + degraded:true); healthy fallbacks log at `debug`.
 */
import { structuredLog } from '@/lib/logger';

export interface ReliabilitySignal {
  /** Where the fallback/degradation happened, e.g. 'llm.text', 'produce.film', 'render.drainer'. */
  surface: string;
  /** The provider/engine that ultimately served the request; null when every provider missed. */
  providerServed: string | null;
  /** How many providers were tried before one served (0 = the primary served; chain.length = all missed). */
  fallbackDepth: number;
  /** True when the surface returned a degraded/fallback result (or fully failed). */
  degraded: boolean;
  /** Optional extra context — keep it to scalars, never PII. */
  [key: string]: unknown;
}

export function reportReliability(signal: ReliabilitySignal): void {
  try {
    structuredLog(signal.degraded ? 'warn' : 'debug', 'reliability', { ...signal });
  } catch {
    /* observability must never crash the caller — swallow. */
  }
}

/**
 * A distinct, alertable marker for a background-job outcome (e.g. the render drainer, a failed generation
 * pass). Logs `event:"ops_marker"` at the given level. NON-BLOCKING. Use a stable `marker` so a log-based
 * alert / error-spike rule can count occurrences (e.g. marker:"render_drainer_failure").
 */
export function opsMarker(level: 'info' | 'warn' | 'error', marker: string, data?: Record<string, unknown>): void {
  try {
    structuredLog(level, 'ops_marker', { marker, ...(data ?? {}) });
  } catch {
    /* never crash the caller */
  }
}

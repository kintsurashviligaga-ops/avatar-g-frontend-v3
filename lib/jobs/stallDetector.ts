/**
 * Stall detector for async render poll loops (Kling clips, HeyGen talking-photo).
 * ==============================================================================
 *
 * A provider job can sit in the vendor's remote queue with NO forward progress for
 * minutes — the classic "heavy latency bottleneck". This tracks the last progress tick
 * and reports `stalled` once no FORWARD movement has happened for `stallMs` (default
 * 90s). The poll loop uses it to FLAG a slow provider (surface a banner / a safe retry
 * nudge) — it deliberately does NOT re-submit to a second provider in parallel, so a
 * stall never causes a double-render / double-charge (the chosen safe policy).
 *
 * Pure + injectable clock → deterministic unit tests, no timers.
 */

export interface StallState {
  /** No forward progress for at least `stallMs`. */
  stalled: boolean;
  /** Milliseconds since the last forward progress tick. */
  msSinceProgress: number;
  /** Highest progress pct observed so far. */
  lastPct: number;
}

export class StallDetector {
  private lastPct: number;
  private lastProgressAt: number;
  private readonly stallMs: number;
  private readonly now: () => number;
  private flagged = false;

  constructor(opts?: { stallMs?: number; now?: () => number; startPct?: number }) {
    this.stallMs = Math.max(1000, Math.floor(opts?.stallMs ?? 90_000));
    this.now = opts?.now ?? (() => Date.now());
    this.lastPct = Number.isFinite(opts?.startPct) ? (opts!.startPct as number) : 0;
    this.lastProgressAt = this.now();
  }

  /**
   * Record a progress observation. ANY forward movement resets the stall clock (and
   * clears a prior flag, so a provider that recovers then stalls again re-flags).
   * Backward/equal ticks are ignored — a poll that keeps returning the same % is
   * exactly the "hung in the queue" symptom we want to catch.
   */
  tick(pct: number): void {
    if (Number.isFinite(pct) && pct > this.lastPct) {
      this.lastPct = pct;
      this.lastProgressAt = this.now();
      this.flagged = false;
    }
  }

  /** Current stall assessment. */
  check(): StallState {
    const msSinceProgress = Math.max(0, this.now() - this.lastProgressAt);
    return { stalled: msSinceProgress >= this.stallMs, msSinceProgress, lastPct: this.lastPct };
  }

  /**
   * True the FIRST time a stall crosses the threshold, then false until progress resumes
   * and it stalls again — so the caller surfaces the "provider is slow" flag exactly once
   * per stall episode (no banner spam every poll).
   */
  shouldFlag(): boolean {
    if (this.flagged) return false;
    if (this.check().stalled) {
      this.flagged = true;
      return true;
    }
    return false;
  }
}

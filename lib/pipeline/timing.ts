/**
 * lib/pipeline/timing.ts — PipelineTimer (Pipeline Iteration, Phase 6A).
 *
 * A tiny step timer for observability: mark() each pipeline milestone and it logs
 * the delta since the previous mark + the cumulative elapsed, then summary() returns
 * a structured object you can persist (e.g. into generation_jobs.result.timing).
 * Logging is wrapped so it can never throw into a generation flow.
 */
export interface TimingSummary {
  label: string;
  totalMs: number;
  steps: Array<{ step: string; atMs: number; deltaMs: number }>;
}

export class PipelineTimer {
  private readonly start: number;
  private last: number;
  private readonly steps: Array<{ step: string; atMs: number; deltaMs: number }> = [];

  constructor(private readonly label = 'pipeline') {
    this.start = Date.now();
    this.last = this.start;
  }

  /** Record a milestone; logs `+<delta>ms (t=<elapsed>ms)` and stores it. */
  mark(step: string): void {
    const t = Date.now();
    const deltaMs = t - this.last;
    this.last = t;
    this.steps.push({ step, atMs: t - this.start, deltaMs });
    try {
      // eslint-disable-next-line no-console
      console.log(`[${this.label}] ${step}: +${deltaMs}ms (t=${t - this.start}ms)`);
    } catch { /* never throw from instrumentation */ }
  }

  /** Total elapsed since construction. */
  elapsedMs(): number {
    return Date.now() - this.start;
  }

  /** Structured summary for persistence / a final log line. */
  summary(): TimingSummary {
    return { label: this.label, totalMs: this.elapsedMs(), steps: [...this.steps] };
  }
}

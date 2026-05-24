/**
 * Multi-agent critique & reflection engine (the "Supreme QA Gatekeeper").
 *
 * A specialized sub-agent must never stream a raw, unverified first pass to the
 * user. This generic loop runs a producer, critiques its output, and — if the
 * critique finds errors / hallucinated properties / incompleteness — feeds the
 * critique back and re-runs (iterate-before-display), up to `maxIterations`.
 *
 * It is intentionally pure and dependency-free: callers inject `produce` (the
 * sub-agent) and `critique` (the gatekeeper's evaluation). This makes the engine
 * deterministically testable, while real callers can plug in heuristic or
 * LLM-backed critiques.
 */

export interface Critique {
  /** True when the output passes the gatekeeper and may be shown to the user. */
  ok: boolean;
  /** Human-readable problems to feed back to the sub-agent for refinement. */
  issues: string[];
}

export interface ReflectionStep {
  iteration: number;
  issues: string[];
  accepted: boolean;
}

export interface ReflectionResult<T> {
  /** The final (best) output. */
  output: T;
  /** Number of produce passes that ran (1 = accepted on first pass). */
  iterations: number;
  /** True when more than one pass was needed. */
  refined: boolean;
  /** True when the final output passed critique; false if maxIterations exhausted. */
  accepted: boolean;
  /** Per-iteration critique trail (for telemetry / the transparency UI). */
  log: ReflectionStep[];
}

export interface ReflectionOptions<T> {
  /**
   * Runs the sub-agent. `critiqueNote` is null on the first pass and contains the
   * accumulated critique on refinement passes. `iteration` is 1-based.
   */
  produce: (critiqueNote: string | null, iteration: number) => Promise<T> | T;
  /** The gatekeeper's evaluation of a produced output. */
  critique: (output: T, iteration: number) => Critique;
  /** Max produce passes. Default 3. Clamped to [1, 6]. */
  maxIterations?: number;
}

/** Format critique issues into a single feedback note for the sub-agent. */
export function formatCritique(issues: string[]): string {
  const cleaned = issues.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return 'Refine and improve completeness and accuracy.';
  return `Address the following before returning: ${cleaned.map((s, i) => `(${i + 1}) ${s}`).join('; ')}.`;
}

export async function runWithReflection<T>(opts: ReflectionOptions<T>): Promise<ReflectionResult<T>> {
  const max = Math.max(1, Math.min(6, Math.floor(opts.maxIterations ?? 3)));
  const log: ReflectionStep[] = [];
  let note: string | null = null;
  let output!: T;
  let accepted = false;
  let iteration = 0;

  for (iteration = 1; iteration <= max; iteration++) {
    output = await opts.produce(note, iteration);
    const c = opts.critique(output, iteration);
    log.push({ iteration, issues: c.issues, accepted: c.ok });
    if (c.ok) {
      accepted = true;
      break;
    }
    if (iteration >= max) break; // exhausted — return best effort, accepted=false
    note = formatCritique(c.issues);
  }

  const iterations = Math.min(iteration, max);
  return { output, iterations, refined: iterations > 1, accepted, log };
}

// ── Default heuristic critiques ──────────────────────────────────────────────

/**
 * Conservative gatekeeper for text/JSON tool output. Flags only confident
 * failure signals so successful first-pass results are returned immediately
 * (no needless, expensive re-runs of sub-agents).
 */
export function critiqueText(text: string, opts?: { minLength?: number }): Critique {
  const issues: string[] = [];
  const t = (text ?? '').trim();
  const minLength = opts?.minLength ?? 1;

  if (t.length < minLength) issues.push('empty or truncated response');
  if (/\b(unauthorized|forbidden|internal server error|stack trace)\b/i.test(t)) issues.push('contains an error/permission failure');
  if (/^(error|failed|exception)\b/i.test(t)) issues.push('response begins with an error marker');
  if (/\b(i (?:cannot|can't|don't know)|as an ai|i'm unable)\b/i.test(t)) issues.push('refusal/non-answer detected');

  // Unbalanced JSON braces → likely truncated/invalid structured output.
  const opens = (t.match(/[{[]/g) ?? []).length;
  const closes = (t.match(/[}\]]/g) ?? []).length;
  if (opens !== closes) issues.push('unbalanced JSON braces (incomplete structured output)');

  return { ok: issues.length === 0, issues };
}

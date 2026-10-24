/**
 * perf/stats.ts — the numbers every Phase 3 measurement reports (MASTER TASK v3.1 §4.1), and the file they go to.
 *
 * A result is one interaction in one environment: the commit, the environment, the payload, the network profile,
 * cold or warm, the sample count, p50 and p95 (nearest rank), and the server spans' medians when the run was traced.
 * A p95 from fewer than 30 samples is still written, with `samples` beside it, and the report marks it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Where perf runs write their results (git-ignored). */
export const RESULTS_DIR = path.join(__dirname, '..', 'perf-results');

/** §4.1: a stated p95 needs at least this many samples. */
export const MIN_P95_SAMPLES = 30;

/** Nearest-rank percentile of `values` (p in 0–100); NaN for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface PerfResult {
  /** What was measured, e.g. `library.tab.warm`. */
  interaction: string;
  /** `mock` (local, fake provider) — the only environment perf/ runs today. */
  environment: 'mock' | 'preview-warm' | 'live';
  commit: string;
  /** The fixture, e.g. `12 items/tab, API fixture 80 ms`. */
  payload: string;
  network: string;
  cache: 'cold' | 'warm';
  samples: number;
  unit: 'ms' | 'count';
  p50: number;
  p95: number;
  /** Medians of the server spans (lib/perf/serverTiming), when the run was traced. */
  spans?: Record<string, number>;
  /** Anything a reader must know to use the number. */
  note?: string;
}

/** The checked-out commit (short), or `unknown` outside a git tree. */
export function currentCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Builds a result from raw samples, and the medians of per-sample span maps. */
export function summarize(
  base: Omit<PerfResult, 'samples' | 'p50' | 'p95' | 'spans' | 'commit'> & { commit?: string },
  samples: readonly number[],
  spanSamples: ReadonlyArray<Record<string, number>> = [],
): PerfResult {
  const names = [...new Set(spanSamples.flatMap((s) => Object.keys(s)))];
  const spans = names.length
    ? Object.fromEntries(names.map((n) => [n, round1(percentile(spanSamples.map((s) => s[n]).filter((v): v is number => v !== undefined), 50))]))
    : undefined;
  return {
    ...base,
    commit: base.commit ?? currentCommit(),
    samples: samples.length,
    p50: round1(percentile(samples, 50)),
    p95: round1(percentile(samples, 95)),
    ...(spans ? { spans } : {}),
  };
}

/** Writes `results` to perf-results/<file>.json. */
export function writeResults(file: string, results: readonly PerfResult[]): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(path.join(RESULTS_DIR, `${file}.json`), `${JSON.stringify(results, null, 2)}\n`);
}

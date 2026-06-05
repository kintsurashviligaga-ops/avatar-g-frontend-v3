/**
 * Supervisor QA — automated quality gate for the assembled 30-second master.
 *
 * The user's standing demand is "deliver only a perfect film." Before a master
 * is handed to the preview, the Supervisor inspects it against the defects this
 * pipeline has actually shipped in the past and grades it:
 *
 *   • empty_master   — a 0-byte / truncated stub (render silently produced nothing)
 *   • silent_master  — a soundtrack was mixed in but the master has NO audio stream
 *                      (the "video plays silent" regression)
 *   • duration_drift — the master is materially shorter/longer than the compiled
 *                      timeline (a dropped clip, or a mis-stitched xfade chain)
 *   • bitrate_bloat  — the encode ballooned (the film-grain 5× / ~27 Mbps bug)
 *   • sub_1080p      — the master fell below the 1920×1080 delivery target
 *
 * This file is PURE (no IO, no ffmpeg) so it is trivially unit-testable and
 * client-safe; the caller gathers the facts (size on disk + a best-effort
 * `ffmpeg -i` probe) and feeds them in.
 */

export interface MasterFacts {
  /** Size of the encoded master on disk, in bytes. */
  sizeBytes: number;
  /** The compiled timeline length the master SHOULD be (seconds). */
  expectedDurSec: number;
  /** Probed master duration in seconds, or null when the probe was unavailable. */
  actualDurSec: number | null;
  /** True when the film mixed in voice/music/sfx (i.e. it must not be silent). */
  audioExpected: boolean;
  /** Whether the probe found an audio stream, or null when the probe failed. */
  audioPresent: boolean | null;
  /** Probed pixel dimensions, or null when the probe was unavailable. */
  width: number | null;
  height: number | null;
}

export type QaSeverity = 'critical' | 'warn';

export interface QaIssue {
  code:
    | 'empty_master'
    | 'silent_master'
    | 'duration_drift'
    | 'bitrate_bloat'
    | 'sub_1080p';
  severity: QaSeverity;
  detail: string;
}

export interface QaReport {
  /** No critical defects → safe to deliver. */
  pass: boolean;
  /** 0–100 quality score (100 = flawless). */
  score: number;
  grade: 'A' | 'B' | 'C' | 'F';
  issues: QaIssue[];
}

/**
 * The exact compiled length of the master: N clips of `clipSec`, each join
 * overlapped by `transitionSec` (mirrors buildFilterComplex's `totalDur`).
 * 5 clips · 6s − 4 · 1s = 26s.
 */
export function expectedMasterDuration(nClips: number, clipSec = 6, transitionSec = 1): number {
  const n = Math.max(1, Math.floor(nClips));
  const natural = n * clipSec - Math.max(0, n - 1) * transitionSec;
  // The full film (≥4 clips) is padded to the 30s brand target in assembly
  // (ffmpeg-filtergraph), so the QA must expect 30s — not the shorter xfade
  // length — or it would flag every film as duration-drift.
  return n >= 4 && natural < 30 ? 30 : natural;
}

export function validateMaster(f: MasterFacts): QaReport {
  const issues: QaIssue[] = [];

  // 1 — a real video, not a truncated/empty stub. A genuine 1080p film is always
  //     hundreds of KB minimum; anything under 50 KB is a failed render.
  if (f.sizeBytes < 50_000) {
    issues.push({
      code: 'empty_master',
      severity: 'critical',
      detail: `master is only ${f.sizeBytes}B — the render produced no usable video`,
    });
  }

  // 2 — a film that mixed audio must not arrive silent (the dreaded mute master).
  if (f.audioExpected && f.audioPresent === false) {
    issues.push({
      code: 'silent_master',
      severity: 'critical',
      detail: 'a soundtrack was composed but the master contains no audio stream',
    });
  }

  // 3 — duration tracks the compiled timeline within ±15% (a dropped clip or a
  //     broken xfade chain shows up here).
  if (f.actualDurSec !== null && f.expectedDurSec > 0) {
    const drift = Math.abs(f.actualDurSec - f.expectedDurSec) / f.expectedDurSec;
    if (drift > 0.15) {
      issues.push({
        code: 'duration_drift',
        severity: 'warn',
        detail: `master is ${f.actualDurSec.toFixed(1)}s vs the expected ${f.expectedDurSec.toFixed(1)}s (${Math.round(drift * 100)}% off)`,
      });
    }
  }

  // 4 — encode stayed inside budget. CRF-18 1080p film runs ≈4–10 Mbps; a 16 Mbps
  //     ceiling (2 MB/s) clears a healthy master yet flags the high-entropy-noise
  //     bloat regression (the film-grain bug shipped a ~27 Mbps master).
  const ceilingBytes = Math.max(1, f.expectedDurSec) * 2_000_000;
  if (f.sizeBytes > ceilingBytes) {
    issues.push({
      code: 'bitrate_bloat',
      severity: 'warn',
      detail: `master is ${(f.sizeBytes / 1e6).toFixed(1)}MB, over the ${Math.round(ceilingBytes / 1e6)}MB budget for ${f.expectedDurSec.toFixed(0)}s`,
    });
  }

  // 5 — 1080p delivery target. (Probe-gated: skipped when dimensions are unknown.)
  if (f.width !== null && f.height !== null && (f.width < 1920 || f.height < 1080)) {
    issues.push({
      code: 'sub_1080p',
      severity: 'warn',
      detail: `master is ${f.width}×${f.height}, below the 1920×1080 delivery target`,
    });
  }

  const critical = issues.filter((i) => i.severity === 'critical').length;
  const warn = issues.filter((i) => i.severity === 'warn').length;
  const score = Math.max(0, 100 - critical * 50 - warn * 12);
  const grade: QaReport['grade'] = critical > 0 ? 'F' : score >= 90 ? 'A' : score >= 75 ? 'B' : 'C';

  return { pass: critical === 0, score, grade, issues };
}

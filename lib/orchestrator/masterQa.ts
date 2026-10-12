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
 *   • frame_count_mismatch — a film with a contracted final length (Video Core v1.0 §4) does not hold exactly
 *                      framesFor(final) decoded frames (29.7 s at 30 fps = 891): the contract was not delivered
 *   • frame_count_unverified — the same contract, but the master's frames could NOT be counted: the frame-exact
 *                      check did not run, and a check that did not run is not a pass (round 3, P0)
 *
 * This file is PURE (no IO, no ffmpeg) so it is trivially unit-testable and
 * client-safe; the caller gathers the facts (size on disk + a best-effort
 * `ffmpeg -i` probe) and feeds them in.
 *
 * A CRITICAL issue is not a grade, it is a refusal: see MasterQaRejected / qcBlockingIssues at the end of this file — the
 * assembler withholds such a master, and /api/video/assemble records the attempt as failed and returns the charge.
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
  /**
   * Video Core v1.0 §4 — under a contracted final length: the frames the final must hold (framesFor(finalSec, fps)) and
   * the frames the master really decodes to (lib/video/frameCount). Both absent/null → no frame check (a legacy master).
   */
  expectedFrames?: number | null;
  actualFrames?: number | null;
}

export type QaSeverity = 'critical' | 'warn';

export interface QaIssue {
  code:
    | 'empty_master'
    | 'silent_master'
    | 'duration_drift'
    | 'bitrate_bloat'
    | 'sub_1080p'
    | 'frame_count_mismatch'
    | 'frame_count_unverified';
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

  // 2b — Video Core v1.0 §4: a contracted final is FRAME-exact. The duration drift below tolerates ±15 %; a film
  //      the user asked at 29.7 s is 891 frames at 30 fps, not "about 29.7 s". A count that could not be read is a
  //      refusal too (round 3, P0): the mandatory check did not run, so the master is NOT frame-accurate as far as
  //      anyone can tell — it used to ride out as a warning on a delivered film, which sold an unverified master as
  //      a verified one.
  if (typeof f.expectedFrames === 'number' && f.expectedFrames > 0) {
    if (typeof f.actualFrames !== 'number') {
      issues.push({ code: 'frame_count_unverified', severity: 'critical', detail: `the master's frames could not be counted (${f.expectedFrames} expected): the frame-exact check did not run, so the contract is unverified` });
    } else if (f.actualFrames !== f.expectedFrames) {
      issues.push({
        code: 'frame_count_mismatch',
        severity: 'critical',
        detail: `master holds ${f.actualFrames} frames, the contracted final is ${f.expectedFrames} (${f.actualFrames - f.expectedFrames > 0 ? '+' : ''}${f.actualFrames - f.expectedFrames})`,
      });
    }
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

  // 5 — 1080p delivery target, ORIENTATION-AGNOSTIC. The target is a 1080-line master in EITHER
  // orientation: 1920×1080 landscape AND 1080×1920 vertical are both on-target. The old check
  // (width<1920 || height<1080) flagged every correct 1080×1920 vertical (width 1080 < 1920) as
  // sub-1080p — a false alarm on every music-video/reel master. Gate on the SHORT side instead:
  // a genuine sub-HD master (e.g. 1280×720) has a short side < 1080; a 1080×1920 vertical does not.
  // (Probe-gated: skipped when dimensions are unknown.)
  if (f.width !== null && f.height !== null && Math.min(f.width, f.height) < 1080) {
    issues.push({
      code: 'sub_1080p',
      severity: 'warn',
      detail: `master is ${f.width}×${f.height}, short side below the 1080-line delivery target`,
    });
  }

  const critical = issues.filter((i) => i.severity === 'critical').length;
  const warn = issues.filter((i) => i.severity === 'warn').length;
  const score = Math.max(0, 100 - critical * 50 - warn * 12);
  const grade: QaReport['grade'] = critical > 0 ? 'F' : score >= 90 ? 'A' : score >= 75 ? 'B' : 'C';

  return { pass: critical === 0, score, grade, issues };
}

// ── The gate (Video Core v1.0 §7 / §8) ───────────────────────────────────────────────────────────────────────────────
// `pass: false` used to be a label on a delivered film: the route stamped the master, settled the charge and handed the
// grade F back beside the URL. A critical issue is the film NOT being what was paid for (no frames of it, no sound it
// was mixed with, not the length that was contracted), so it now WITHHOLDS the master: the assembler throws
// MasterQaRejected before hosting anything, the route's saga fails on its dispatch step and compensates (the one refund
// per attempt, the free slot or the billing waiver handed back), and the attempt is recorded as failed — never as a
// delivered film. Warnings still ride along on a delivered master.

/** The issues that withhold a master: every critical one (pure; the policy in one place). */
export function qcBlockingIssues(qa: QaReport | null | undefined): QaIssue[] {
  return qa ? qa.issues.filter((i) => i.severity === 'critical') : [];
}

/** One line a user can read: which checks failed and how (the first critical issue's own words). */
export function describeQcRejection(qa: QaReport): string {
  const blocking = qcBlockingIssues(qa);
  if (!blocking.length) return 'the master passed every critical check';
  return blocking.map((i) => `${i.code}: ${i.detail}`).join('; ');
}

/** Thrown by the assembler in place of a master that failed a critical check; carries the report for the route. */
export class MasterQaRejected extends Error {
  readonly code = 'qc_rejected' as const;
  readonly qa: QaReport;
  readonly issueCodes: QaIssue['code'][];
  constructor(qa: QaReport) {
    super(`master rejected by QC (grade ${qa.grade}, score ${qa.score}) — ${describeQcRejection(qa)}`);
    this.name = 'MasterQaRejected';
    this.qa = qa;
    this.issueCodes = qcBlockingIssues(qa).map((i) => i.code);
  }
}

/** `err` is the assembler's QC rejection (instanceof-safe across module copies: the code and the report are checked). */
export function isMasterQaRejected(err: unknown): err is MasterQaRejected {
  return err instanceof MasterQaRejected
    || (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'qc_rejected' && typeof (err as { qa?: unknown }).qa === 'object');
}

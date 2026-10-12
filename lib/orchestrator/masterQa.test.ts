import { validateMaster, expectedMasterDuration, type MasterFacts } from './masterQa';

const HEALTHY: MasterFacts = {
  sizeBytes: 6_000_000, // ~6 MB graded 26s master
  expectedDurSec: 26,
  actualDurSec: 26.0,
  audioExpected: true,
  audioPresent: true,
  width: 1920,
  height: 1080,
};

describe('expectedMasterDuration', () => {
  test('the full 5-clip film is padded to the 30s brand target', () => {
    expect(expectedMasterDuration(5)).toBe(30);
  });
  test('single clip → 6s (no transitions)', () => {
    expect(expectedMasterDuration(1)).toBe(6);
  });
});

describe('validateMaster', () => {
  test('a flawless master grades A and passes', () => {
    const qa = validateMaster(HEALTHY);
    expect(qa.pass).toBe(true);
    expect(qa.grade).toBe('A');
    expect(qa.score).toBe(100);
    expect(qa.issues).toHaveLength(0);
  });

  test('empty/truncated stub → critical, fails', () => {
    const qa = validateMaster({ ...HEALTHY, sizeBytes: 1_200 });
    expect(qa.pass).toBe(false);
    expect(qa.grade).toBe('F');
    expect(qa.issues.map((i) => i.code)).toContain('empty_master');
  });

  test('soundtrack expected but master is silent → critical, fails', () => {
    const qa = validateMaster({ ...HEALTHY, audioExpected: true, audioPresent: false });
    expect(qa.pass).toBe(false);
    expect(qa.issues.find((i) => i.code === 'silent_master')?.severity).toBe('critical');
  });

  test('a film with no audio by design is not flagged silent', () => {
    const qa = validateMaster({ ...HEALTHY, audioExpected: false, audioPresent: false });
    expect(qa.pass).toBe(true);
    expect(qa.issues.map((i) => i.code)).not.toContain('silent_master');
  });

  test('duration drift beyond ±15% → warn (a dropped clip)', () => {
    const qa = validateMaster({ ...HEALTHY, actualDurSec: 20 }); // 23% short
    expect(qa.pass).toBe(true); // a warn, not a hard fail
    expect(qa.issues.map((i) => i.code)).toContain('duration_drift');
    expect(qa.grade).not.toBe('A');
  });

  test('within ±15% duration is accepted', () => {
    const qa = validateMaster({ ...HEALTHY, actualDurSec: 24 }); // ~8% off
    expect(qa.issues.map((i) => i.code)).not.toContain('duration_drift');
  });

  test('bitrate bloat (film-grain regression) → warn', () => {
    const qa = validateMaster({ ...HEALTHY, sizeBytes: 90_000_000 }); // ~27 Mbps
    expect(qa.issues.map((i) => i.code)).toContain('bitrate_bloat');
  });

  test('sub-1080p resolution → warn', () => {
    const qa = validateMaster({ ...HEALTHY, width: 1280, height: 720 });
    expect(qa.issues.map((i) => i.code)).toContain('sub_1080p');
  });

  test('a 1080×1920 VERTICAL master is on-target, NOT flagged sub-1080p (Phase 22 false-alarm fix)', () => {
    const qa = validateMaster({ ...HEALTHY, width: 1080, height: 1920 });
    expect(qa.issues.map((i) => i.code)).not.toContain('sub_1080p');
  });

  test('probe unavailable (nulls) → grades on size alone, no false positives', () => {
    const qa = validateMaster({
      ...HEALTHY,
      actualDurSec: null,
      audioPresent: null,
      width: null,
      height: null,
    });
    expect(qa.pass).toBe(true);
    expect(qa.issues).toHaveLength(0);
  });

  test('Video Core v1.0 §4 — a contracted final: exactly its frames, or a critical frame_count_mismatch', () => {
    const exact = validateMaster({ ...HEALTHY, expectedDurSec: 29.7, actualDurSec: 29.7, expectedFrames: 891, actualFrames: 891 });
    expect(exact.pass).toBe(true);
    expect(exact.issues.map((i) => i.code)).not.toContain('frame_count_mismatch');
    // 29.67 s is inside the ±15 % drift; one frame short is still a failed contract.
    const short = validateMaster({ ...HEALTHY, expectedDurSec: 29.7, actualDurSec: 29.67, expectedFrames: 891, actualFrames: 890 });
    expect(short.pass).toBe(false);
    expect(short.issues).toContainEqual({ code: 'frame_count_mismatch', severity: 'critical', detail: 'master holds 890 frames, the contracted final is 891 (-1)' });
    expect(validateMaster({ ...HEALTHY, expectedFrames: 720, actualFrames: 721 }).issues[0]).toMatchObject({ code: 'frame_count_mismatch', detail: expect.stringContaining('(+1)') });
    // The count could not be read: said as a warning (unverified), not passed over.
    const unread = validateMaster({ ...HEALTHY, expectedFrames: 891, actualFrames: null });
    expect(unread.issues).toContainEqual({ code: 'frame_count_mismatch', severity: 'warn', detail: "the master's frames could not be counted (891 expected)" });
    // No contract (legacy master): no frame check at all.
    expect(validateMaster(HEALTHY).issues.map((i) => i.code)).not.toContain('frame_count_mismatch');
  });

  test('multiple criticals still clamp score at 0, never negative', () => {
    const qa = validateMaster({
      ...HEALTHY,
      sizeBytes: 100,
      audioExpected: true,
      audioPresent: false,
    });
    expect(qa.score).toBeGreaterThanOrEqual(0);
    expect(qa.pass).toBe(false);
  });
});

describe('the gate — a critical issue withholds the master (Video Core v1.0 §7/§8)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { qcBlockingIssues, describeQcRejection, MasterQaRejected, isMasterQaRejected } = require('./masterQa') as typeof import('./masterQa');

  test('a contracted 29.7 s film that decodes to 890 frames is a critical frame_count_mismatch, and blocking', () => {
    const qa = validateMaster({ ...HEALTHY, expectedDurSec: 29.7, actualDurSec: 29.7, expectedFrames: 891, actualFrames: 890 });
    expect(qa.pass).toBe(false);
    expect(qcBlockingIssues(qa).map((i) => i.code)).toEqual(['frame_count_mismatch']);
    expect(describeQcRejection(qa)).toMatch(/^frame_count_mismatch: master holds 890 frames, the contracted final is 891 \(-1\)$/);
  });

  test('exactly 891 frames → nothing blocks; an uncountable master is a warning, not a block', () => {
    expect(qcBlockingIssues(validateMaster({ ...HEALTHY, expectedFrames: 891, actualFrames: 891 }))).toEqual([]);
    const unread = validateMaster({ ...HEALTHY, expectedFrames: 891, actualFrames: null });
    expect(unread.pass).toBe(true);
    expect(qcBlockingIssues(unread)).toEqual([]);
    expect(unread.issues.map((i) => `${i.code}:${i.severity}`)).toEqual(['frame_count_mismatch:warn']);
  });

  test('silent_master and empty_master block too; warnings (drift, bloat, sub-1080p) never do', () => {
    expect(qcBlockingIssues(validateMaster({ ...HEALTHY, audioPresent: false })).map((i) => i.code)).toEqual(['silent_master']);
    expect(qcBlockingIssues(validateMaster({ ...HEALTHY, sizeBytes: 10 })).map((i) => i.code)).toEqual(['empty_master']);
    const warnsOnly = validateMaster({ ...HEALTHY, actualDurSec: 40, sizeBytes: 90_000_000, width: 1280, height: 720 });
    expect(warnsOnly.pass).toBe(true);
    expect(warnsOnly.issues.length).toBe(3);
    expect(qcBlockingIssues(warnsOnly)).toEqual([]);
    expect(qcBlockingIssues(null)).toEqual([]);
  });

  test('MasterQaRejected carries the report and the codes, and is recognised across module copies', () => {
    const qa = validateMaster({ ...HEALTHY, expectedFrames: 720, actualFrames: 722, audioPresent: false });
    const err = new MasterQaRejected(qa);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MasterQaRejected');
    expect(err.code).toBe('qc_rejected');
    expect(err.qa).toBe(qa);
    expect(err.issueCodes).toEqual(['silent_master', 'frame_count_mismatch']);
    expect(err.message).toMatch(/master rejected by QC \(grade F, score 0\) — silent_master: .*; frame_count_mismatch: master holds 722 frames, the contracted final is 720 \(\+2\)/);
    expect(isMasterQaRejected(err)).toBe(true);
    expect(isMasterQaRejected({ code: 'qc_rejected', qa })).toBe(true); // a copy from another module instance
    expect(isMasterQaRejected(new Error('dispatch stalled'))).toBe(false);
    expect(isMasterQaRejected(null)).toBe(false);
  });
});

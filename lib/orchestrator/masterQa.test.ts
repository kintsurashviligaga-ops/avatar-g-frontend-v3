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

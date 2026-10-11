/** @jest-environment node */
import {
  FIRST_INTERIM_MS,
  MAX_INTERIM_MS,
  MIN_INTERIM_GAP_MS,
  SPEECH_LEAD_MS,
  UNGATED_AFTER_MS,
  interimScheduleMs,
  nextInterimAtMs,
  shouldRunInterimAt,
} from './interimCadence';

describe('the quadratic cost is actually removed', () => {
  it('THE BUG, QUANTIFIED: ~60 s of speech ran 50 full-clip passes; now it is far fewer', () => {
    const passes = interimScheduleMs(60_000);
    expect(passes.length).toBeLessThan(15);
    // Total audio-seconds uploaded. The old scheme re-sent the whole clip every 1.2 s tick.
    const before = Array.from({ length: 50 }, (_, i) => (i + 1) * 1.2).reduce((a, b) => a + b, 0);
    const after = passes.reduce((a, ms) => a + ms / 1000, 0);
    expect(after).toBeLessThan(before / 3);
  });

  it('stays responsive at the START, which is where live text matters — and starts sooner than 1.2 s', () => {
    // The first passes are ~0.9 s apart (checked every 300 ms, so 4.05 s lands on the 4.2 s check).
    expect(interimScheduleMs(5_000).slice(0, 4)).toEqual([900, 1800, 2700, 4200]);
    expect(interimScheduleMs(5_000)[0]).toBeLessThan(1200);
  });

  it('the gap between passes grows rather than staying fixed', () => {
    const s = interimScheduleMs(48_000);
    const gaps = s.slice(1).map((c, i) => c - s[i]!);
    expect(gaps[gaps.length - 1]!).toBeGreaterThan(gaps[0]!);
  });

  it('the documented schedule (see the module header)', () => {
    expect(interimScheduleMs(120_000)).toEqual([900, 1800, 2700, 4200, 6300, 9600, 14400, 21600, 32400, 48600]);
  });
});

describe('cost bound — each pass is one Gemini call', () => {
  it('a 2-minute dictation makes at most 11 calls (10 interim + the final), far under STT_USER 600/hour', () => {
    const calls = interimScheduleMs(120_000).length + 1;
    expect(calls).toBeLessThanOrEqual(11);
    expect(calls / 600).toBeLessThan(0.02); // < 2 % of the hourly per-user budget
  });

  it('no minute of one dictation sees more than 11 calls, and nothing after the first minute but the final', () => {
    const s = interimScheduleMs(120_000);
    expect(s.filter((ms) => ms <= 60_000).length + 1).toBeLessThanOrEqual(11);
    expect(s.filter((ms) => ms > 60_000)).toEqual([]);
  });

  it('a slower check interval can only reduce the number of passes', () => {
    expect(interimScheduleMs(120_000, 1_000).length).toBeLessThanOrEqual(interimScheduleMs(120_000, 300).length);
  });
});

describe('speech gating — the first pass carries speech, not the silence before it', () => {
  it('a metered capture with nothing heard yet runs no pass until speech (or the ungated fallback)', () => {
    expect(shouldRunInterimAt(1_200, 0, { metered: true, onsetMs: null })).toBe(false);
    expect(shouldRunInterimAt(UNGATED_AFTER_MS, 0, { metered: true, onsetMs: null })).toBe(true);
  });

  it('the first pass waits SPEECH_LEAD_MS after the onset (never earlier than FIRST_INTERIM_MS)', () => {
    expect(nextInterimAtMs(0, 1_500)).toBe(1_500 + SPEECH_LEAD_MS);
    expect(nextInterimAtMs(0, 100)).toBe(FIRST_INTERIM_MS);
    expect(shouldRunInterimAt(1_900, 0, { metered: true, onsetMs: 1_500 })).toBe(false);
    expect(shouldRunInterimAt(2_000, 0, { metered: true, onsetMs: 1_500 })).toBe(true);
  });

  it('no meter (MediaRecorder without an AudioContext) = ungated', () => {
    expect(shouldRunInterimAt(FIRST_INTERIM_MS, 0)).toBe(true);
    expect(shouldRunInterimAt(FIRST_INTERIM_MS, 0, { metered: false, onsetMs: null })).toBe(true);
  });
});

describe('it always makes progress — no spinning, no stalling', () => {
  it('the next due time is at least the minimum gap after the last', () => {
    for (let ms = 300; ms <= 60_000; ms += 300) expect(nextInterimAtMs(ms)).toBeGreaterThanOrEqual(ms + MIN_INTERIM_GAP_MS);
  });

  it('the first pass runs at FIRST_INTERIM_MS of audio, not before', () => {
    expect(shouldRunInterimAt(FIRST_INTERIM_MS - 1, 0)).toBe(false);
    expect(shouldRunInterimAt(FIRST_INTERIM_MS, 0)).toBe(true);
  });

  it('does not re-run at the same instant it just ran at', () => {
    expect(shouldRunInterimAt(4_000, 4_000)).toBe(false);
  });
});

describe('long dictations stop paying for interim passes', () => {
  it('past the ceiling nothing runs — a pass by then costs more than the interval between passes', () => {
    expect(shouldRunInterimAt(MAX_INTERIM_MS + 1, 1)).toBe(false);
    expect(shouldRunInterimAt(500_000, 1)).toBe(false);
  });

  it('the FINAL pass on Stop is unaffected — this only gates interim passes', () => {
    // interimScheduleMs never includes anything past the ceiling; the caller still runs one final pass.
    expect(interimScheduleMs(120_000).every((ms) => ms <= MAX_INTERIM_MS)).toBe(true);
  });
});

describe('bounds', () => {
  it.each([[0], [-3], [Number.NaN], [Number.POSITIVE_INFINITY]])('never runs for elapsedMs %p', (ms) => {
    expect(shouldRunInterimAt(ms as number, 0)).toBe(false);
  });

  it('a non-positive check interval yields no schedule instead of looping', () => {
    expect(interimScheduleMs(10_000, 0)).toEqual([]);
  });
});

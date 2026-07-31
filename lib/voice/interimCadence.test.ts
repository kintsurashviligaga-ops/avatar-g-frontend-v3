/** @jest-environment node */
import { shouldRunInterim, nextInterimAt, interimSchedule, MAX_INTERIM_CHUNKS } from './interimCadence';

describe('the quadratic cost is actually removed', () => {
  it('THE BUG, QUANTIFIED: 50 chunks (~60s of speech) ran 50 full-clip passes; now it is far fewer', () => {
    const passes = interimSchedule(50);
    expect(passes.length).toBeLessThan(15);
    // Total audio-seconds uploaded, at 1.2s per chunk. The old scheme re-sent the whole clip each tick.
    const before = Array.from({ length: 50 }, (_, i) => (i + 1) * 1.2).reduce((a, b) => a + b, 0);
    const after = passes.reduce((a, c) => a + c * 1.2, 0);
    expect(after).toBeLessThan(before / 3);
  });

  it('stays responsive at the START, which is where live text matters', () => {
    // The first few passes must still be roughly every chunk.
    expect(interimSchedule(5).slice(0, 4)).toEqual([1, 2, 3, 5]);
  });

  it('the gap between passes grows rather than staying fixed', () => {
    const s = interimSchedule(40);
    const gaps = s.slice(1).map((c, i) => c - s[i]!);
    expect(gaps[gaps.length - 1]!).toBeGreaterThan(gaps[0]!);
  });
});

describe('it always makes progress — no spinning, no stalling', () => {
  it('the next due index is strictly greater than the last', () => {
    for (let n = 1; n <= 60; n++) expect(nextInterimAt(n)).toBeGreaterThan(n);
  });

  it('the first pass always runs', () => {
    expect(shouldRunInterim(1, 0)).toBe(true);
  });

  it('does not re-run at the same chunk it just ran at', () => {
    expect(shouldRunInterim(4, 4)).toBe(false);
  });
});

describe('long dictations stop paying for interim passes', () => {
  it('past the ceiling nothing runs — a pass by then costs more than the interval between ticks', () => {
    expect(shouldRunInterim(MAX_INTERIM_CHUNKS + 1, 1)).toBe(false);
    expect(shouldRunInterim(500, 1)).toBe(false);
  });

  it('the FINAL pass on Stop is unaffected — this only gates interim passes', () => {
    // interimSchedule never includes anything past the ceiling; the caller still runs one final pass.
    expect(interimSchedule(120).every((c) => c <= MAX_INTERIM_CHUNKS)).toBe(true);
  });
});

describe('bounds', () => {
  it.each([[0], [-3], [Number.NaN]])('never runs for chunkCount %p', (c) => {
    expect(shouldRunInterim(c as number, 0)).toBe(false);
  });
});

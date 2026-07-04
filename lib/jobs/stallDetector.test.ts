import { StallDetector } from './stallDetector';

/** Deterministic clock the test advances by hand. */
function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('StallDetector — flags a hung provider without re-submitting', () => {
  it('is not stalled before the threshold elapses', () => {
    const c = clock();
    const d = new StallDetector({ stallMs: 90_000, now: c.now });
    c.advance(60_000);
    expect(d.check().stalled).toBe(false);
  });

  it('reports stalled once no forward progress for stallMs', () => {
    const c = clock();
    const d = new StallDetector({ stallMs: 90_000, now: c.now });
    c.advance(90_000);
    const s = d.check();
    expect(s.stalled).toBe(true);
    expect(s.msSinceProgress).toBe(90_000);
  });

  it('a FORWARD progress tick resets the stall clock', () => {
    const c = clock();
    const d = new StallDetector({ stallMs: 90_000, now: c.now });
    c.advance(80_000);
    d.tick(30); // real movement
    c.advance(80_000); // 80s since the tick — still under threshold
    expect(d.check().stalled).toBe(false);
    expect(d.check().lastPct).toBe(30);
  });

  it('ignores equal/backward ticks (a poll stuck returning the same % IS the stall)', () => {
    const c = clock();
    const d = new StallDetector({ stallMs: 90_000, now: c.now, startPct: 12 });
    c.advance(50_000);
    d.tick(12); // no forward movement — does NOT reset
    d.tick(5); // backward — ignored
    c.advance(45_000); // total 95s since start with no forward progress
    expect(d.check().stalled).toBe(true);
  });

  it('shouldFlag fires exactly once per stall episode', () => {
    const c = clock();
    const d = new StallDetector({ stallMs: 90_000, now: c.now });
    c.advance(90_000);
    expect(d.shouldFlag()).toBe(true); // first crossing
    c.advance(10_000);
    expect(d.shouldFlag()).toBe(false); // already flagged — no spam
  });

  it('re-flags after the provider recovers then stalls again', () => {
    const c = clock();
    const d = new StallDetector({ stallMs: 90_000, now: c.now });
    c.advance(90_000);
    expect(d.shouldFlag()).toBe(true);
    d.tick(50); // recovery — clears the flag + resets clock
    expect(d.shouldFlag()).toBe(false);
    c.advance(90_000); // stalls again at the new level
    expect(d.shouldFlag()).toBe(true);
  });

  it('clamps a sub-second stallMs up to a 1s floor', () => {
    const c = clock();
    const d = new StallDetector({ stallMs: 10, now: c.now });
    c.advance(999);
    expect(d.check().stalled).toBe(false);
    c.advance(1);
    expect(d.check().stalled).toBe(true);
  });
});

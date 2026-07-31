/** @jest-environment node */
import { musicTierFor, settleMusicCharge, MUSIC_TIER_SEC } from './musicSettlement';
import { creditCostFor } from './pricing';

describe('tier mapping mirrors creditCostFor', () => {
  it('agrees with the pricing table at every boundary', () => {
    for (const s of [1, 29, 30, 31, 59, 60, 61, 89, 90, 300]) {
      expect(creditCostFor('music', { seconds: musicTierFor(s) })).toBe(creditCostFor('music', { seconds: s }));
    }
  });

  it('never bills below the 30s floor', () => {
    expect(musicTierFor(3)).toBe(MUSIC_TIER_SEC[0]);
    expect(musicTierFor(0)).toBe(30);
    expect(musicTierFor(-5)).toBe(30);
    expect(musicTierFor(NaN)).toBe(30);
  });
});

describe('settlement — the Lyria overcharge', () => {
  it('THE BUG: 90s paid, ~30s delivered → settles down to the 30s tier', () => {
    const s = settleMusicCharge(90, 31);
    expect(s).toEqual({ settledSec: 30, overcharged: true });
    // 12 credits charged, 5 owed.
    expect(creditCostFor('music', { seconds: 90 }) - creditCostFor('music', { seconds: s.settledSec })).toBe(
      creditCostFor('music', { seconds: 90 }) - creditCostFor('music', { seconds: 30 }),
    );
  });

  it('60s paid, ~30s delivered → one tier down', () => {
    expect(settleMusicCharge(60, 32)).toEqual({ settledSec: 30, overcharged: true });
  });

  it('90s paid, 62s delivered → the middle tier, not the floor', () => {
    expect(settleMusicCharge(90, 62)).toEqual({ settledSec: 60, overcharged: true });
  });

  it('does not settle when the track is the length that was paid for', () => {
    expect(settleMusicCharge(90, 92)).toEqual({ settledSec: 90, overcharged: false });
    expect(settleMusicCharge(30, 31)).toEqual({ settledSec: 30, overcharged: false });
  });

  it('tolerates encoder rounding rather than demoting a whole tier over 0.4s', () => {
    expect(settleMusicCharge(90, 89.6)).toEqual({ settledSec: 90, overcharged: false });
    expect(settleMusicCharge(60, 59.2)).toEqual({ settledSec: 60, overcharged: false });
  });

  it('a LONGER track than paid for is never charged more — settling only ever refunds', () => {
    expect(settleMusicCharge(30, 120).settledSec).toBe(30);
    expect(settleMusicCharge(30, 120).overcharged).toBe(false);
  });

  it('an UNMEASURED track keeps its original charge — a failed probe must not hand out credits', () => {
    expect(settleMusicCharge(90, 0)).toEqual({ settledSec: 90, overcharged: false });
    expect(settleMusicCharge(90, NaN)).toEqual({ settledSec: 90, overcharged: false });
    expect(settleMusicCharge(90, -1)).toEqual({ settledSec: 90, overcharged: false });
  });
});

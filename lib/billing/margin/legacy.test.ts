/** @jest-environment node */
/** Phase 8.1: existing balances keep the old prices for 30 days after launch (GG 2026-11-14), then v8 for everything. */
import { LEGACY_DAYS, chargeFor, legacyEndsAt, legacyWindowOpen } from './legacy';
import { priceOf } from './catalog';

const LAUNCH = '2026-12-01T00:00:00Z';
const day = (n: number) => new Date(Date.parse(LAUNCH) + n * 86_400_000);
const video = priceOf('video.omni.720p.8s'); // v8 66, today 38

describe('30-day legacy pricing', () => {
  test('inside the window, an action paid from the pre-launch balance costs today’s price', () => {
    const c = chargeFor(video.credits, video.current, { legacyPool: 500, launchAt: LAUNCH }, day(3));
    expect(c).toEqual({ credits: 38, basis: 'legacy', fromLegacyPool: 38, legacyPoolAfter: 462 });
  });

  test('when the pool cannot cover the whole action, it is a v8 charge (no half-legacy charges) and the pool is kept', () => {
    const c = chargeFor(video.credits, video.current, { legacyPool: 20, launchAt: LAUNCH }, day(3));
    expect(c).toEqual({ credits: 66, basis: 'v8', fromLegacyPool: 0, legacyPoolAfter: 20 });
  });

  test(`after ${LEGACY_DAYS} days everything is v8 and the pool is gone`, () => {
    expect(legacyWindowOpen(LAUNCH, day(LEGACY_DAYS - 0.001))).toBe(true);
    expect(legacyWindowOpen(LAUNCH, day(LEGACY_DAYS))).toBe(false);
    expect(chargeFor(video.credits, video.current, { legacyPool: 500, launchAt: LAUNCH }, day(31))).toMatchObject({ credits: 66, basis: 'v8', legacyPoolAfter: 0 });
    expect(legacyEndsAt(LAUNCH)).toBe('2026-12-31T00:00:00.000Z');
  });

  test('new users, actions with no old price, and a bad launch date all pay v8', () => {
    expect(chargeFor(video.credits, video.current, null, day(1)).basis).toBe('v8');
    expect(chargeFor(44, null, { legacyPool: 500, launchAt: LAUNCH }, day(1)).credits).toBe(44);
    expect(chargeFor(66, 38, { legacyPool: 500, launchAt: 'not a date' }, day(1)).basis).toBe('v8');
    expect(chargeFor(66, 38, { legacyPool: 500, launchAt: LAUNCH }, day(-1)).basis).toBe('v8'); // before launch: today's code path charges, not this
  });

  test('a legacy price is never used when it is not cheaper', () => {
    expect(chargeFor(10, 12, { legacyPool: 500, launchAt: LAUNCH }, day(1))).toMatchObject({ credits: 10, basis: 'v8' });
  });
});

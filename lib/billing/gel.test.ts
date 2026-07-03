/** @jest-environment node */
import { GEL_COST, REFILL_TIERS_GEL, MIN_REFILL_GEL, formatGEL, costOf, canAfford, insufficientBalanceMessage, type MeteredAction } from './gel';

describe('GEL cost matrix', () => {
  test('matches the fixed production matrix', () => {
    expect(GEL_COST.chat).toBe(0);
    expect(GEL_COST.voice_tts).toBe(0.2);
    expect(GEL_COST.geometry_3d).toBe(0.5);
    expect(GEL_COST.video_film).toBe(2);
  });
  test('costOf is safe for every action', () => {
    for (const a of ['chat', 'voice_tts', 'geometry_3d', 'video_film', 'avatar'] as MeteredAction[]) {
      expect(typeof costOf(a)).toBe('number');
      expect(costOf(a)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('formatGEL', () => {
  test('always 2 decimals + ₾', () => {
    expect(formatGEL(0)).toBe('0.00 ₾');
    expect(formatGEL(5)).toBe('5.00 ₾');
    expect(formatGEL(2.5)).toBe('2.50 ₾');
    expect(formatGEL(0.2)).toBe('0.20 ₾');
  });
  test('coerces NaN/Infinity to 0.00', () => {
    expect(formatGEL(NaN)).toBe('0.00 ₾');
    expect(formatGEL(Infinity)).toBe('0.00 ₾');
  });
});

describe('refill tiers', () => {
  test('legacy 5/10/20/50/500 + credit-pack tiers (9/29/89), 5 as the minimum', () => {
    // Source of truth is gel.ts (updated in d0f3f46 credits-modal-prices); this assertion had
    // gone stale. Legacy round tiers stay for back-compat; 9/29/89 are the credit-pack prices.
    expect([...REFILL_TIERS_GEL]).toEqual([5, 9, 10, 20, 29, 50, 89, 500]);
    expect(MIN_REFILL_GEL).toBe(5);
    expect(Math.min(...REFILL_TIERS_GEL)).toBe(MIN_REFILL_GEL);
    expect(Math.max(...REFILL_TIERS_GEL)).toBe(500);
    // legacy round tiers must remain valid (back-compat)
    for (const legacy of [5, 10, 20, 50, 500]) expect(REFILL_TIERS_GEL).toContain(legacy);
  });
});

describe('canAfford (pre-flight interceptor)', () => {
  test('free actions always pass even at 0 balance', () => {
    expect(canAfford(0, 'chat')).toBe(true);
  });
  test('blocks a 2.00 video render under 2.00', () => {
    expect(canAfford(1.99, 'video_film')).toBe(false);
    expect(canAfford(2.0, 'video_film')).toBe(true);
  });
  test('handles bad balances as 0', () => {
    expect(canAfford(NaN, 'voice_tts')).toBe(false);
  });
});

describe('insufficientBalanceMessage', () => {
  test('localized + embeds the required amount', () => {
    expect(insufficientBalanceMessage(2, 'ka')).toContain('2.00 ₾');
    expect(insufficientBalanceMessage(2, 'en')).toContain('2.00 ₾');
    expect(insufficientBalanceMessage(2, 'ru')).toContain('2.00 ₾');
  });
});

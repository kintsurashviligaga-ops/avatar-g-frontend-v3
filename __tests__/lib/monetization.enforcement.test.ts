/** @jest-environment node */

import { NextRequest } from 'next/server';
import { MonetizationError, enforceRateLimits } from '@/lib/monetization/enforcement';
import { getPlanDefinition, normalizePlanId } from '@/lib/monetization/plans';

describe('Monetization enforcement', () => {
  test('normalizes legacy plans to canonical plans', () => {
    expect(normalizePlanId('FREE')).toBe('FREE');
    expect(normalizePlanId('PRO')).toBe('BASIC');
    expect(normalizePlanId('ENTERPRISE')).toBe('AGENT_G_FULL');
  });

  test('has canonical BASIC and AGENT_G_FULL pricing', () => {
    expect(getPlanDefinition('BASIC').price_usd).toBe(39);
    expect(getPlanDefinition('AGENT_G_FULL').price_usd).toBe(500);
  });

  test('enforces plan rate limits', async () => {
    const req = new NextRequest('http://localhost/api/test');
    const userId = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, '0')}`;

    let lastError: unknown = null;
    for (let index = 0; index < 7; index += 1) {
      try {
        await enforceRateLimits({
          request: req,
          userId,
          orgId: null,
          plan: 'FREE',
          operation: 'expensive',
        });
      } catch (error) {
        lastError = error;
        break;
      }
    }

    expect(lastError).toBeInstanceOf(MonetizationError);
    expect((lastError as MonetizationError).payload.error_code).toBe('RATE_LIMIT_EXCEEDED');
  });
});

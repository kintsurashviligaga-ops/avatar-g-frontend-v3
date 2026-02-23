/** @jest-environment node */

import { getRangeStart, usageRowsToCsv } from '@/lib/monetization/metering';

describe('Metering aggregation utilities', () => {
  test('produces CSV with expected headers', () => {
    const csv = usageRowsToCsv([
      {
        created_at: '2026-02-23T00:00:00.000Z',
        user_id: 'u1',
        org_id: 'o1',
        service_id: 'text-intelligence',
        route: '/api/agent-g/router/execute',
        event_type: 'api_call',
        units: 3,
        metadata: { foo: 'bar' },
      },
    ]);

    expect(csv).toContain('created_at,user_id,org_id,service_id,route,event_type,units,metadata');
    expect(csv).toContain('text-intelligence');
  });

  test('returns valid ISO start time for month range', () => {
    const from = getRangeStart('month');
    expect(new Date(from).toISOString()).toBe(from);
  });
});

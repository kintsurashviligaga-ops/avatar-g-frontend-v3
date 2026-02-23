/** @jest-environment node */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/agent-g/router/execute/route';
import { createServerClient } from '@/lib/supabase/server';
import { resolveTenantContext } from '@/lib/tenant/context';
import { enforceRateLimits } from '@/lib/monetization/enforcement';
import { routeAI } from '@/lib/ai/router';
import { recordMeteringEvent } from '@/lib/monetization/metering';

jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

jest.mock('@/lib/tenant/context', () => ({
  resolveTenantContext: jest.fn(),
}));

jest.mock('@/lib/monetization/enforcement', () => ({
  enforceRateLimits: jest.fn(),
  MonetizationError: class MonetizationError extends Error {
    statusCode = 429;
    payload = { error_code: 'X', message: 'X', upgrade_url: '/pricing', current_plan: 'FREE' };
  },
  toPlanIdFromUnknown: (value: string) => (value === 'PREMIUM' ? 'PREMIUM' : 'FREE'),
}));

jest.mock('@/lib/ai/router', () => ({
  routeAI: jest.fn(),
}));

jest.mock('@/lib/monetization/metering', () => ({
  recordMeteringEvent: jest.fn(),
}));

jest.mock('@/lib/platform/cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

describe('/api/agent-g/router/execute', () => {
  test('routes request and returns selected execution plan', async () => {
    (createServerClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: '00000000-0000-0000-0000-000000000333' } } }) },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { plan: 'PREMIUM' } }) }),
        }),
      }),
    });

    (resolveTenantContext as jest.Mock).mockResolvedValue({ orgId: null, orgSlug: null, role: null, source: 'none' });
    (enforceRateLimits as jest.Mock).mockResolvedValue(undefined);
    (routeAI as jest.Mock).mockResolvedValue({
      selected_service_id: 'text-intelligence',
      selected_model: 'gpt-4.1',
      selected_provider: 'openai',
      execution_strategy: 'sync',
      estimated_cost_units: 12,
      safety_checks_passed: true,
      fallback_chain: [],
    });
    (recordMeteringEvent as jest.Mock).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost:3000/api/agent-g/router/execute', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Write a product strategy',
        service_registry: [
          {
            service_id: 'text-intelligence',
            capabilities: ['text_generation'],
            providers: [
              {
                provider: 'openai',
                model: 'gpt-4.1',
                estimated_cost_units: 12,
                expected_latency_ms: 900,
                reliability_score: 0.99,
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.routing.selected_service_id).toBe('text-intelligence');
    expect(payload.routing.selected_provider).toBe('openai');
  });
});

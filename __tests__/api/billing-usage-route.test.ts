/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/billing/usage/route';
import { createServerClient } from '@/lib/supabase/server';
import { resolveTenantContext } from '@/lib/tenant/context';
import { getAggregatedUsage } from '@/lib/monetization/metering';

jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

jest.mock('@/lib/tenant/context', () => ({
  resolveTenantContext: jest.fn(),
}));

jest.mock('@/lib/monetization/metering', () => ({
  getAggregatedUsage: jest.fn(),
}));

describe('/api/billing/usage', () => {
  test('returns usage payload for authenticated user', async () => {
    (createServerClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: '00000000-0000-0000-0000-000000000111' } } }) },
    });

    (resolveTenantContext as jest.Mock).mockResolvedValue({
      orgId: '00000000-0000-0000-0000-000000000222',
      orgSlug: 'acme',
      role: 'owner',
      source: 'header',
    });

    (getAggregatedUsage as jest.Mock).mockResolvedValue({
      range: 'week',
      from: '2026-02-16T00:00:00.000Z',
      total_events: 3,
      totals_by_type: { api_call: 3 },
      totals_by_service: { 'text-intelligence': 3 },
      totals_by_route: { '/api/agent-g/router/execute': 3 },
      rows: [],
    });

    const req = new NextRequest('http://localhost:3000/api/billing/usage?range=week');
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.usage.total_events).toBe(3);
    expect(payload.tenant.org_id).toBe('00000000-0000-0000-0000-000000000222');
  });
});

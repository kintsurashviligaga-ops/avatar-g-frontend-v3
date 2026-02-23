/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/org/branding/route';
import { createServerClient } from '@/lib/supabase/server';
import { resolveTenantContext } from '@/lib/tenant/context';

jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
  createServiceRoleClient: jest.fn(),
}));

jest.mock('@/lib/tenant/context', () => ({
  resolveTenantContext: jest.fn(),
}));

jest.mock('@/lib/platform/cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

describe('/api/org/branding', () => {
  test('returns default branding when user has no tenant context', async () => {
    (createServerClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: '00000000-0000-0000-0000-000000000444' } },
        }),
      },
    });

    (resolveTenantContext as jest.Mock).mockResolvedValue({
      orgId: null,
      orgSlug: null,
      role: null,
      source: 'none',
    });

    const req = new NextRequest('http://localhost:3000/api/org/branding');
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.branding.app_name).toBe('Avatar G');
    expect(payload.branding.org_id).toBeNull();
  });
});

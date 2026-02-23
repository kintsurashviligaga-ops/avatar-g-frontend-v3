/** @jest-environment node */

import { assertTenantAccess } from '@/lib/tenant/context';

describe('Tenant isolation', () => {
  test('allows matching tenant org', () => {
    expect(() =>
      assertTenantAccess(
        { orgId: 'org-1', orgSlug: 'acme', role: 'owner', source: 'header' },
        'org-1'
      )
    ).not.toThrow();
  });

  test('blocks cross-tenant access', () => {
    expect(() =>
      assertTenantAccess(
        { orgId: 'org-1', orgSlug: 'acme', role: 'owner', source: 'header' },
        'org-2'
      )
    ).toThrow('TENANT_ACCESS_DENIED');
  });
});

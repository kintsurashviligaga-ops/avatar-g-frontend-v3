import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type TenantRole = 'owner' | 'admin' | 'member';

export type TenantContext = {
  orgId: string | null;
  orgSlug: string | null;
  role: TenantRole | null;
  source: 'header' | 'subdomain' | 'none';
};

function parseSubdomainOrgSlug(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(':')[0] || '';
  const parts = host.split('.');
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (!sub || sub === 'www' || sub === 'app') return null;
  return sub;
}

export async function resolveTenantContext(request: NextRequest, userId: string): Promise<TenantContext> {
  const supabase = createServiceRoleClient();
  const headerOrgId = request.headers.get('x-org-id');
  const subdomainSlug = parseSubdomainOrgSlug(request.headers.get('host'));

  if (headerOrgId) {
    const { data } = await supabase
      .from('org_members')
      .select('org_id, role, orgs!inner(id, slug)')
      .eq('org_id', headerOrgId)
      .eq('user_id', userId)
      .single();

    if (data) {
      const org = Array.isArray(data.orgs) ? data.orgs[0] : data.orgs;
      return {
        orgId: data.org_id,
        orgSlug: org?.slug ?? null,
        role: (data.role ?? null) as TenantRole | null,
        source: 'header',
      };
    }
  }

  if (subdomainSlug) {
    const { data } = await supabase
      .from('org_members')
      .select('org_id, role, orgs!inner(id, slug)')
      .eq('user_id', userId)
      .eq('orgs.slug', subdomainSlug)
      .single();

    if (data) {
      const org = Array.isArray(data.orgs) ? data.orgs[0] : data.orgs;
      return {
        orgId: data.org_id,
        orgSlug: org?.slug ?? null,
        role: (data.role ?? null) as TenantRole | null,
        source: 'subdomain',
      };
    }
  }

  return {
    orgId: null,
    orgSlug: null,
    role: null,
    source: 'none',
  };
}

export function assertTenantAccess(context: TenantContext, requiredOrgId: string | null): void {
  if (!requiredOrgId) return;
  if (context.orgId !== requiredOrgId) {
    throw new Error('TENANT_ACCESS_DENIED');
  }
}

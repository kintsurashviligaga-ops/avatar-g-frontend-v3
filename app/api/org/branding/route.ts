import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveTenantContext } from '@/lib/tenant/context';
import { cacheGet, cacheSet } from '@/lib/platform/cache';

export const dynamic = 'force-dynamic';

type BrandingResponse = {
  org_id: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  app_name: string | null;
  support_email: string | null;
};

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenant = await resolveTenantContext(request, user.id);
  if (!tenant.orgId) {
    return NextResponse.json({
      branding: {
        org_id: null,
        logo_url: null,
        primary_color: null,
        accent_color: null,
        app_name: 'Avatar G',
        support_email: null,
      } satisfies BrandingResponse,
    });
  }

  const cacheKey = `org-branding:${tenant.orgId}`;
  const cached = await cacheGet<BrandingResponse>(cacheKey);
  if (cached) {
    return NextResponse.json({ branding: cached, cached: true });
  }

  const adminSupabase = createServiceRoleClient();
  const { data } = await adminSupabase
    .from('org_branding')
    .select('org_id,logo_url,primary_color,accent_color,app_name,support_email')
    .eq('org_id', tenant.orgId)
    .maybeSingle();

  const branding: BrandingResponse = {
    org_id: tenant.orgId,
    logo_url: data?.logo_url ?? null,
    primary_color: data?.primary_color ?? null,
    accent_color: data?.accent_color ?? null,
    app_name: data?.app_name ?? 'Avatar G',
    support_email: data?.support_email ?? null,
  };

  await cacheSet(cacheKey, branding, 120);
  return NextResponse.json({ branding, cached: false });
}

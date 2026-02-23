import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { resolveTenantContext } from '@/lib/tenant/context';
import { getAggregatedUsage } from '@/lib/monetization/metering';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  range: z.enum(['day', 'week', 'month']).default('day'),
});

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse({
    range: request.nextUrl.searchParams.get('range') ?? 'day',
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid range parameter' }, { status: 400 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenant = await resolveTenantContext(request, user.id);
  const usage = await getAggregatedUsage({
    userId: user.id,
    orgId: tenant.orgId,
    range: parsed.data.range,
  });

  return NextResponse.json({
    usage,
    tenant: {
      org_id: tenant.orgId,
      org_slug: tenant.orgSlug,
      source: tenant.source,
    },
  });
}

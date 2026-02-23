import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { PLAN_CATALOG } from '@/lib/monetization/plans';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = assertAdminAccess(request, user);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.reason }, { status: 403 });
  }

  return NextResponse.json({ plans: Object.values(PLAN_CATALOG) });
}

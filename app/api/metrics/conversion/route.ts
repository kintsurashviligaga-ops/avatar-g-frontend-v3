import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userSupabase = createServerClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  const admin = assertAdminAccess(request, user);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.reason }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data: rows } = await supabase.from('subscriptions').select('user_id,plan,status,updated_at');

  const freeUsers = new Set<string>();
  const paidUsers = new Set<string>();

  for (const row of rows ?? []) {
    if (row.plan === 'FREE') freeUsers.add(row.user_id);
    if (row.plan !== 'FREE' && ['active', 'trialing'].includes(String(row.status))) paidUsers.add(row.user_id);
  }

  const total = freeUsers.size + paidUsers.size;
  const conversion = total > 0 ? Number((paidUsers.size / total).toFixed(4)) : 0;

  return NextResponse.json({
    totals: {
      free_users: freeUsers.size,
      paid_users: paidUsers.size,
      conversion_rate: conversion,
    },
  });
}

/**
 * GET /api/admin/users/:id — one customer for the admin drawer: balance, package (and where it comes from), the last
 * 100 ledger rows with which spends can still be refunded, and payments (BOG orders + other wallet top-ups).
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminContext, isUuid } from '@/lib/admin/routeContext';
import { getUserDetail } from '@/lib/admin/userDetail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  const gate = await adminContext();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const detail = await getUserDetail(gate.svc, id);
  if (!detail) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  return NextResponse.json(detail);
}

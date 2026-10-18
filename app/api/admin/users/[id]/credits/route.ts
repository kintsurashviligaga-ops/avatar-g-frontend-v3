/**
 * POST /api/admin/users/:id/credits — { delta, note? }: add (delta > 0) or take (delta < 0) credits. A take never
 * drives the balance below zero (deduct_credits locks the row). Refused on an unisolated Preview.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminContext, isUuid, writeStatus } from '@/lib/admin/routeContext';
import { adjustUserCredits } from '@/lib/admin/userDetail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  const gate = await adminContext();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { delta?: unknown; note?: unknown };
  const result = await adjustUserCredits(gate.svc, id, Number(body.delta), gate.actorId, typeof body.note === 'string' ? body.note : undefined);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'adjust_failed', balance: result.newBalance }, { status: writeStatus(result.error) });
  return NextResponse.json({ ok: true, newBalance: result.newBalance });
}

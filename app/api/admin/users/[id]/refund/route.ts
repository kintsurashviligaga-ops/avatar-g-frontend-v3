/**
 * POST /api/admin/users/:id/refund — { ledgerId }: give back the credits of one spend, once. Credits only: money back
 * to a card is a BOG refund the owner decides, never this route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminContext, isUuid, writeStatus } from '@/lib/admin/routeContext';
import { refundLedgerEntry } from '@/lib/admin/userDetail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  const gate = await adminContext();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { ledgerId?: unknown };
  const ledgerId = typeof body.ledgerId === 'string' || typeof body.ledgerId === 'number' ? String(body.ledgerId) : '';
  const result = await refundLedgerEntry(gate.svc, id, ledgerId, gate.actorId);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'refund_failed', balance: result.newBalance }, { status: writeStatus(result.error) });
  return NextResponse.json({ ok: true, newBalance: result.newBalance });
}

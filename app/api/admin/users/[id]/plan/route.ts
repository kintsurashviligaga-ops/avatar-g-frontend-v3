/**
 * POST /api/admin/users/:id/plan — { tier, grantAllowance }: put a customer on a package by hand (profiles.tier comp),
 * optionally booking that package's monthly credits once. Nothing is charged and nothing renews.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminContext, isUuid, writeStatus } from '@/lib/admin/routeContext';
import { assignUserPlan } from '@/lib/admin/userDetail';
import { isTierId } from '@/lib/billing/tiers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  const gate = await adminContext();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { tier?: unknown; grantAllowance?: unknown };
  if (!isTierId(body.tier)) return NextResponse.json({ error: 'invalid_tier' }, { status: 400 });
  const result = await assignUserPlan(gate.svc, id, body.tier, { grantAllowance: body.grantAllowance === true, actorId: gate.actorId });
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'assign_failed', balance: result.newBalance }, { status: writeStatus(result.error) });
  return NextResponse.json({ ok: true, newBalance: result.newBalance, granted: result.granted ?? 0 });
}

/**
 * POST /api/agent/proposals/[id]/reject — STEP 5 admin rejection.
 * Marks a pending proposal rejected. Changes NO live config. Admin-gated.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { rejectProposal } from '@/lib/agent/optimizer/approveProposal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let reviewerId = '';
  try {
    const { user } = await requireAdmin();
    reviewerId = (user as { id?: string })?.id ?? '';
    if (!reviewerId) return NextResponse.json({ error: 'no reviewer identity' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const result = await rejectProposal(id, reviewerId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

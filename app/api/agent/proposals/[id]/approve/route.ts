/**
 * POST /api/agent/proposals/[id]/approve — STEP 5 admin approval.
 *
 * The ONLY path that promotes an optimizer proposal into a live config. Admin-gated. Promotes a
 * NEW active agent_configs version (prior kept for rollback) and marks the proposal approved.
 * Optional body { target } overrides the promotion target (defaults to the proposal's model).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { approveProposal } from '@/lib/agent/optimizer/approveProposal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let reviewerId = '';
  try {
    const { user } = await requireAdmin();
    reviewerId = (user as { id?: string })?.id ?? '';
    if (!reviewerId) return NextResponse.json({ error: 'no reviewer identity' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: { target?: string } = {};
  try { body = (await req.json()) as { target?: string }; } catch { /* body optional */ }

  const result = await approveProposal(id, reviewerId, body.target ? { target: body.target } : undefined);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

/**
 * GET /api/cron/optimize-agents — STEP 5 daily self-improvement pass (PROPOSE-ONLY).
 *
 * Runs the agent optimizer over recent feedback and writes review proposals. It NEVER applies a
 * change — an admin reviews prompt_optimization_proposals and decides. Authorized by the Vercel
 * cron secret (Bearer CRON_SECRET) or an admin session. Wired as a daily cron in vercel.json.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { runAgentOptimizer } from '@/lib/agent/optimizer/runOptimizer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`;
  const viaAdmin = viaCron ? false : await isAdmin();
  if (!viaCron && !viaAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await runAgentOptimizer({ sinceDays: 30 });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

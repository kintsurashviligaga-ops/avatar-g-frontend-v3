/**
 * POST /api/video/director-workflow/approve — "Create film ✦N": checks that this exact board can be rendered and that the
 * balance covers the WHOLE film before the first scene starts (GG 2026-11-14 10:38Z decision 3). Nothing is charged here:
 * each scene is charged when it starts (…/scene) and a failed one is refunded by the status route, so the user pays only
 * for delivered scenes. A true ledger reservation would be a billing change and is not part of this PR.
 *
 * Body: { project, expectedCredits }. Answer: { version, quote } — the version and price the run is for.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { genjutsuChargeReady } from '@/lib/genjutsu/chargeToken';
import { hasSufficientBalance } from '@/lib/orchestrator/ledger';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { readJson } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { quoteProject } from '@/lib/video/directorsWorkflow';
import { checkProject, directorsWorkflowOpenTo } from '@/lib/video/directorsWorkflow/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVE_RATE = { maxRequests: 10, windowMs: 60_000, keyPrefix: 'rl:dw-approve' };
const bad = (status: number, error: string, extra: Record<string, unknown> = {}): NextResponse =>
  NextResponse.json({ success: false, error, ...extra }, { status });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!directorsWorkflowOpenTo(user)) return bad(404, 'not_found');
  const serviceOff = await serviceOffResponse('video');
  if (serviceOff) return serviceOff;
  const limited = await checkRateLimitByKey(user!.id, APPROVE_RATE);
  if (limited) return limited;

  const body = (await readJson(req, 512_000)) as Record<string, unknown> | null;
  const checked = checkProject(body?.project);
  if (!checked) return bad(400, 'invalid_project');
  if (checked.problems.length > 0) return bad(422, 'board_has_problems', { problems: checked.problems });
  const quote = quoteProject(checked.project);
  if (typeof body?.expectedCredits === 'number' && body.expectedCredits !== quote.totalCredits) {
    return bad(409, 'price_changed', { quote });
  }
  if (!genjutsuChargeReady()) return bad(503, 'billing_unavailable');
  if (!(await hasSufficientBalance(user!.id, quote.totalCredits))) return bad(402, 'insufficient_credits', { needed: quote.totalCredits });
  return NextResponse.json({ success: true, version: checked.project.version, quote }, { headers: { 'Cache-Control': 'private, no-store' } });
}

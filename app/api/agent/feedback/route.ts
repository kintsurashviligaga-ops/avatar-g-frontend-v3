/**
 * POST /api/agent/feedback — STEP 3.5 telemetry sink.
 *
 * Records ONE interaction signal (download/edit/share/remix/discard) for the current user. The
 * userId is taken from the session — NEVER trusted from the body — so a client can only file its
 * own feedback. Fail-soft: telemetry never blocks the UI, so we return 200 {recorded:false} even
 * when the table isn't applied yet or validation trims a field. Feeds the STEP 5 optimizer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { recordAgentFeedback, type AgentFeedback } from '@/lib/agent/feedback';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: Partial<AgentFeedback>;
  try {
    body = (await req.json()) as Partial<AgentFeedback>;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const recorded = await recordAgentFeedback({
    userId: user.id, // authoritative — never from the client
    agentType: body.agentType as AgentFeedback['agentType'],
    action: body.action as AgentFeedback['action'],
    ...(body.assetId ? { assetId: body.assetId } : {}),
    ...(body.model ? { model: body.model } : {}),
    ...(body.promptSnapshot ? { promptSnapshot: body.promptSnapshot } : {}),
    ...(typeof body.success === 'boolean' ? { success: body.success } : {}),
  });

  return NextResponse.json({ recorded });
}

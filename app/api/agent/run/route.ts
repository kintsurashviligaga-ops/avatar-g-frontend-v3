/**
 * POST /api/agent/run — STEP 3 autonomous agent entry point.
 *
 * Runs the bounded ReAct loop (lib/agent/react) against a user goal with live tools
 * (web_search, scrape_webpage, prepare_instagram_post ⛔, orchestrate_media). Returns the full
 * step trace so the Agent Terminal can render Thought/Action/Observation. The loop is always
 * terminal (final | max_steps | llm_error) — the request can never hang.
 *
 * Auth required (the userId scopes orchestrate_media's render jobs). Publishing to social is
 * prepare-only by construction — this route can never post on the user's behalf.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { runLiveAgent } from '@/lib/agent/react/bindLiveAgent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_GOAL_CHARS = 2000;
const MAX_STEPS_CAP = 8;

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { goal?: unknown; maxSteps?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  if (!goal) return NextResponse.json({ error: 'goal is required' }, { status: 400 });
  if (goal.length > MAX_GOAL_CHARS) return NextResponse.json({ error: `goal too long (max ${MAX_GOAL_CHARS})` }, { status: 413 });

  const maxSteps =
    typeof body.maxSteps === 'number' && Number.isFinite(body.maxSteps)
      ? Math.min(Math.max(1, Math.floor(body.maxSteps)), MAX_STEPS_CAP)
      : undefined;

  const result = await runLiveAgent(goal, { userId: user.id }, { maxSteps });
  const status = result.stopReason === 'llm_error' ? 502 : 200;
  return NextResponse.json(result, { status });
}

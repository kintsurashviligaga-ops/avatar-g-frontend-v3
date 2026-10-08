/**
 * POST /api/agent/run — STEP 3 autonomous agent entry point.
 *
 * Runs the bounded ReAct loop (lib/agent/react) against a user goal with live tools
 * (web_search, scrape_webpage, prepare_instagram_post ⛔). Returns the full step trace so the
 * Agent Terminal can render Thought/Action/Observation. The loop is always terminal
 * (final | max_steps | llm_error) — the request can never hang.
 *
 * Google-only by default (AI_GOOGLE_ONLY, lib/ai/google/policy.ts): the brain is Gemini alone and
 * web_search is Gemini + Google Search grounding — both decided in lib/agent/react/bindLiveAgent.ts.
 * There is no render tool: the old `orchestrate_media` queued generation_jobs rows nothing ever
 * processed, unbilled (see bindLiveAgent.ts).
 *
 * Auth required (the userId attributes the booked LLM/search spend and scopes the per-user rate
 * limit). Publishing to social is prepare-only by construction — this route can never post on the
 * user's behalf.
 *
 * Optional `budgetMs` sets the loop's wall-clock deadline, clamped to [15 s, 100 s] (default 100 s): a
 * Live voice call's ask_agent_g (components/voice/live/liveActions.ts) asks ~45 s and ~4 steps so the
 * call never waits two minutes. Optional `source: 'live'` only labels the run's error report.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { runLiveAgent } from '@/lib/agent/react/bindLiveAgent';
import { checkProduceRate, rateLimitedResponse } from '@/lib/orchestrator/rate-limit';
import { reportError } from '@/lib/observability/report-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_GOAL_CHARS = 2000;
const MAX_STEPS_CAP = 8;
/** The loop's wall-clock budget: the default, and the bounds a caller's `budgetMs` is clamped to. */
const DEFAULT_BUDGET_MS = 100_000;
const MIN_BUDGET_MS = 15_000;
const MAX_BUDGET_MS = 100_000;

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Per-user throttle under the dedicated 'agent' namespace (mirrors agents/execute). The route was
  // auth-gated but unbounded per-minute, so a multi-tab burst amplified render-job inserts. Fail-open
  // (ok) when Upstash is unconfigured, and the separate namespace can never 429 the produce/revenue path.
  const rate = await checkProduceRate(user.id, Date.now(), 'agent');
  if (!rate.ok) return rateLimitedResponse(rate);

  let body: { goal?: unknown; maxSteps?: unknown; budgetMs?: unknown; source?: unknown };
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

  // Deadline (audit MED): stop the loop with a partial trace ~20s before the 120s maxDuration so a
  // slow LLM/tool step returns a graceful 'max_steps' result instead of a hard 504 with nothing. A
  // caller may ask for less (a voice call cannot wait that long), never for more.
  const budgetMs =
    typeof body.budgetMs === 'number' && Number.isFinite(body.budgetMs)
      ? Math.min(Math.max(MIN_BUDGET_MS, Math.floor(body.budgetMs)), MAX_BUDGET_MS)
      : DEFAULT_BUDGET_MS;
  const deadlineMs = Date.now() + budgetMs;
  const result = await runLiveAgent(goal, { userId: user.id }, { maxSteps, deadlineMs });
  if (result.stopReason === 'llm_error') {
    // `source` labels the report only (a voice call's failures are told apart); it changes nothing about the run.
    const source = body.source === 'live' ? { source: 'live', budgetMs } : {};
    reportError(new Error('agent run ended in llm_error'), { route: 'agent.run', userId: user.id, ...source });
  }
  const status = result.stopReason === 'llm_error' ? 502 : 200;
  return NextResponse.json(result, { status });
}

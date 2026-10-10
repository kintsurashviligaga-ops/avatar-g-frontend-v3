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
 * The only media tool QUOTES: optional `files` (the user's own uploads, at most 13) give the agent
 * quote_montage_to_music when AGENT_G_MEDIA_EXEC is open to this user. It renders nothing; the signed
 * quote comes back as `mediaQuote` for the client's confirm card, and the edit runs only on that
 * confirm (/api/agent/media/montage `run`). Without files, or with the flag closed, there is no montage
 * tool and the agent writes a brief for the Studio instead (see bindLiveAgent.ts). With the flag open the
 * agent also has quote_audio_from_link ("take the MP3 out of this link"): it checks the link and its rights
 * and plans, nothing more; its signed plan comes back as `audioQuote` and the extraction runs only on the
 * user's Start (/api/agent/media/audio `run`). With files and the flag open it also has quote_media_edit (trim,
 * reframe, colour, sound, caption, a still of one attached video): plan only, back as `editQuote`, run on Start
 * (/api/agent/media/edit `run`).
 *
 * Auth required (the userId attributes the booked LLM/search spend and scopes the per-user rate
 * limit). Publishing to social is prepare-only by construction — this route can never post on the
 * user's behalf.
 *
 * The user's memory (lib/memory/context: their profile facts and newest saved facts, capped) is added to the system
 * prompt, as in every chat surface.
 *
 * Optional `budgetMs` sets the loop's wall-clock deadline, clamped to [15 s, 100 s] (default 100 s): a
 * Live voice call's ask_agent_g (components/voice/live/liveActions.ts) asks ~45 s and ~4 steps so the
 * call never waits two minutes. Optional `source: 'live'` only labels the run's error report.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { runLiveAgent, type AgentContext } from '@/lib/agent/react/bindLiveAgent';
import { agentMediaOpenTo } from '@/lib/agent/media/access';
import { MAX_FILES } from '@/lib/agent/media/montageAsk';
import { checkProduceRate, rateLimitedResponse } from '@/lib/orchestrator/rate-limit';
import { reportError } from '@/lib/observability/report-error';
import { memoryContextOf } from '@/lib/memory/context';

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

  let body: { goal?: unknown; maxSteps?: unknown; budgetMs?: unknown; source?: unknown; files?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  if (!goal) return NextResponse.json({ error: 'goal is required' }, { status: 400 });
  if (goal.length > MAX_GOAL_CHARS) return NextResponse.json({ error: `goal too long (max ${MAX_GOAL_CHARS})` }, { status: 413 });

  // The user's own files for the media tool: strings only, at most MAX_FILES (montageExec checks each is theirs).
  let files: string[] | undefined;
  if (body.files !== undefined) {
    const ok = Array.isArray(body.files) && body.files.length <= MAX_FILES
      && body.files.every((f) => typeof f === 'string' && f.trim() && f.length <= 2048);
    if (!ok) return NextResponse.json({ error: `files must be at most ${MAX_FILES} file references` }, { status: 400 });
    files = (body.files as string[]).map((f) => f.trim());
  }

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
  let mediaQuote: Parameters<NonNullable<AgentContext['onMediaQuote']>>[0] | undefined;
  let audioQuote: Parameters<NonNullable<AgentContext['onAudioQuote']>>[0] | undefined;
  let editQuote: Parameters<NonNullable<AgentContext['onEditQuote']>>[0] | undefined;
  const ctx: AgentContext = {
    userId: user.id,
    media: agentMediaOpenTo(user),
    onAudioQuote: (q) => { audioQuote = q; },
    ...(files?.length ? {
      files,
      onMediaQuote: (q: NonNullable<typeof mediaQuote>) => { mediaQuote = q; },
      onEditQuote: (q: NonNullable<typeof editQuote>) => { editQuote = q; },
    } : {}),
  };
  // What the user told Agent G before (lib/memory/context): capped, their data, never instructions. Fail-open.
  const memory = await memoryContextOf(user.id);
  const result = await runLiveAgent(goal, ctx, { maxSteps, deadlineMs, ...(memory ? { systemExtra: memory } : {}) });
  if (result.stopReason === 'llm_error') {
    // `source` labels the report only (a voice call's failures are told apart); it changes nothing about the run.
    const source = body.source === 'live' ? { source: 'live', budgetMs } : {};
    reportError(new Error('agent run ended in llm_error'), { route: 'agent.run', userId: user.id, ...source });
  }
  const status = result.stopReason === 'llm_error' ? 502 : 200;
  // The last plan of each kind the agent made, signed, for the confirm card: nothing has run and nothing is charged yet.
  return NextResponse.json({
    ...result, ...(mediaQuote ? { mediaQuote } : {}), ...(audioQuote ? { audioQuote } : {}), ...(editQuote ? { editQuote } : {}),
  }, { status });
}

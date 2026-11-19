/**
 * /api/agent/site/step — Agent G's next action on myavatar.ge itself (GG 2026-11-07 09:36Z: „move the cursor on the site
 * and do everything"). The page (components/agent/SiteAgentHost) sends the goal, what it did so far and a snapshot of
 * what the user sees; this answers ONE action, checked by lib/agent/site/actions before the page does anything.
 *
 *   GET  → { enabled } for THIS user (the same admins-first gate as the cloud browser and code runs).
 *   POST { goal, history[], snapshot, lang } → { ok, action } | { ok:false, error }
 *
 * Nothing runs here but one Gemini flash call (Vertex, booked like every chat call). The page acts in the user's own
 * session with the user's own rights: this route can neither click nor see anything the snapshot did not carry.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentSandboxAccess, agentSandboxOpenTo } from '@/lib/agent/media/access';
import { llmText } from '@/lib/ai/llmText';
import { cleanSnapshot, parseSiteAction, siteSystemPrompt, siteUserPrompt } from '@/lib/agent/site/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function GET(req: NextRequest): Promise<NextResponse> {
  let enabled = false;
  if (agentSandboxAccess() !== 'off') {
    const { user } = await authedClientFromRequest(req);
    enabled = agentSandboxOpenTo(user);
  }
  return NextResponse.json({ enabled }, { headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (agentSandboxAccess() === 'off') return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!agentSandboxOpenTo(user)) return notFound();
  const burst = await checkRateLimitByKey(user.id, RATE_LIMITS.SITE_STEP_BURST);
  if (burst) return burst;
  const day = await checkRateLimitByKey(user.id, RATE_LIMITS.SITE_STEP_USER);
  if (day) return day;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const goal = s(body?.goal, 2000).trim();
  const snap = cleanSnapshot(body?.snapshot);
  if (!goal || !snap) return NextResponse.json({ ok: false, error: 'bad_input' }, { status: 400, headers: NO_STORE });
  const history = Array.isArray(body?.history) ? body!.history.slice(-30).map((h) => s(h, 300)).filter(Boolean) : [];
  const lang = body?.lang === 'en' || body?.lang === 'ru' ? body.lang : 'ka';

  const text = await llmText({
    system: siteSystemPrompt(lang), user: siteUserPrompt(goal, history, snap),
    json: true, temperature: 0.2, maxTokens: 600, timeoutMs: 25_000, signal: req.signal,
  });
  if (!text) return NextResponse.json({ ok: false, error: 'no_answer' }, { status: 502, headers: NO_STORE });
  const action = parseSiteAction(text, snap);
  // An action this agent may not take goes back as null with the raw words, so the page can say so and ask again.
  return NextResponse.json({ ok: true, action, ...(action ? {} : { raw: text.slice(0, 300) }) }, { headers: NO_STORE });
}

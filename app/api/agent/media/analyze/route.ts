/**
 * /api/agent/media/analyze — Agent G reads one whole file with Gemini and says what is in it (lib/agent/media/analyzeExec).
 *
 *   GET                                               { enabled } for THIS user; never 404, so a client asks first.
 *   POST { source: { kind: 'file', ref } | { kind: 'youtube', url }, focus?, question?, lang? }
 *        one of the caller's own files (an upload, a Library item, a result of ours), or a public YouTube video for
 *        analysis only → { ok, analysis: { summary, language, scenes, moments, transcript, speakers, objects, answer },
 *        source: { kind, type, durationSec }, model }. Nothing is charged, queued or stored.
 *
 * ⚠️ CLOSED UNLESS AGENT_G_FILE_ANALYSIS OPENS IT (lib/agent/media/access agentAnalyzeAccess): every analysis is a paid
 * Gemini call, so it is off everywhere, a Preview included, until the owner sets it. A closed POST answers 404 before
 * the session is read. The file goes to Gemini by reference on the transport GEMINI_TRANSPORT selects; a refusal of the
 * reference is answered as such (422 reference_refused), never retried another way.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentAnalyzeAccess, agentAnalyzeOpenTo } from '@/lib/agent/media/access';
import { analyzeMedia, type AnalyzeErrorCode, type AnalyzeSource } from '@/lib/agent/media/analyzeExec';
import { liveAnalyzeDeps } from '@/lib/agent/media/analyzeLive';
import type { AnalyzeFocus } from '@/lib/agent/media/analyzeSpec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// ffprobe of the file (up to 90 s on a slow link) and one model call (under 2 minutes).
export const maxDuration = 300;

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

const STATUS: Record<AnalyzeErrorCode, number> = {
  bad_input: 400,
  unsupported_type: 422,
  media_not_yours: 403,
  unreadable: 422,
  too_long: 422,
  not_youtube: 422,
  not_configured: 503,
  budget: 503,
  reference_refused: 422,
  rate_limited: 429,
  model_failed: 502,
  bad_answer: 502,
};

function sourceOf(v: unknown): AnalyzeSource | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (s.kind === 'file' && typeof s.ref === 'string') return { kind: 'file', ref: s.ref };
  if (s.kind === 'youtube' && typeof s.url === 'string') return { kind: 'youtube', url: s.url };
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let enabled = false;
  if (agentAnalyzeAccess() !== 'off') {
    const { user } = await authedClientFromRequest(req);
    enabled = agentAnalyzeOpenTo(user);
  }
  return NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (agentAnalyzeAccess() === 'off') return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!agentAnalyzeOpenTo(user)) return notFound();
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const source = sourceOf(body?.source);
  if (!source) return NextResponse.json({ ok: false, error: 'bad_input', message: 'Name one file or one YouTube link.' }, { status: 400 });
  // A read bills the AI budget, not the user's credits (gap C3): the per-account daily ceiling bounds one person's share.
  const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.ANALYZE_USER);
  if (capped) return capped;
  const r = await analyzeMedia(liveAnalyzeDeps(), {
    userId: user.id,
    source,
    ...(typeof body?.focus === 'string' ? { focus: body.focus as AnalyzeFocus } : {}),
    ...(typeof body?.question === 'string' ? { question: body.question } : {}),
    ...(typeof body?.lang === 'string' ? { lang: body.lang } : {}),
  });
  return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.error], headers: { 'Cache-Control': 'private, no-store' } });
}

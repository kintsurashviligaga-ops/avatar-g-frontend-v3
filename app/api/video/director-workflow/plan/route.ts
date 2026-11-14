/**
 * POST /api/video/director-workflow/plan — an idea → a draft storyboard of 1–10 scene cards. FREE (GG 2026-11-14 10:38Z:
 * one Gemini text call, ≈ $0.002; the user may re-plan as often as they like before anything is charged).
 *
 * Body: { idea, scenes: 1–10 | null, aspect: '9:16' | '16:9', resolution: '720p' | '1080p', locale: 'ka' | 'en' | 'ru' }.
 * Answer: { project, problems, quote } — the board, what the user must still fix on it, and its price scene by scene.
 *
 * Order: flag (404 while off for this user) → sign-in → rate limit → parse → one Gemini call on Vertex (llmText) → the
 * strict reader (lib/video/directorsWorkflow/planner). Nothing is charged, stored or rendered here.
 */
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { llmText } from '@/lib/ai/llmText';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { readJson } from '@/lib/studio/http';
import { DW_MAX_SCENES, parsePlannerAnswer, plannerInstruction, quoteProject } from '@/lib/video/directorsWorkflow';
import { directorsWorkflowOpenTo } from '@/lib/video/directorsWorkflow/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Free, so bounded by rate: a few boards a minute per account. */
const PLAN_RATE = { maxRequests: 8, windowMs: 60_000, keyPrefix: 'rl:dw-plan' };
const IDEA_MAX = 4_000;

const bad = (status: number, error: string): NextResponse => NextResponse.json({ success: false, error }, { status });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!directorsWorkflowOpenTo(user)) return bad(404, 'not_found');
  const limited = await checkRateLimitByKey(user!.id, PLAN_RATE);
  if (limited) return limited;

  const body = (await readJson(req)) as Record<string, unknown> | null;
  const idea = typeof body?.idea === 'string' ? body.idea.trim() : '';
  if (!idea || idea.length > IDEA_MAX) return bad(400, 'invalid_idea');
  const scenes = body?.scenes === null || body?.scenes === undefined ? null : Number(body.scenes);
  if (scenes !== null && (!Number.isInteger(scenes) || scenes < 1 || scenes > DW_MAX_SCENES)) return bad(400, 'invalid_scenes');
  const aspect = body?.aspect === '16:9' ? '16:9' : '9:16';
  const resolution = body?.resolution === '1080p' ? '1080p' : '720p';
  const locale = body?.locale === 'en' || body?.locale === 'ru' ? body.locale : 'ka';

  const raw = await llmText({ user: plannerInstruction({ idea, scenes, aspect, locale }), json: true, maxTokens: 6_000, temperature: 0.7, timeoutMs: 45_000 });
  if (!raw) return bad(503, 'planner_unavailable');
  const id = `dw_${randomUUID()}`;
  const r = parsePlannerAnswer(raw, { id, aspect, resolution, sceneId: (i) => `${id.slice(3, 11)}_s${i}` });
  if (!r.ok) return bad(502, `planner_${r.reason}`);
  return NextResponse.json({ success: true, project: r.project, problems: r.problems, quote: quoteProject(r.project) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

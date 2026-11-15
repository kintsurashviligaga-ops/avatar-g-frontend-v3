/**
 * POST /api/avatar/studio/stitch { projectId, jobIds } — the scenes, in order, as one presentation (free). 404 unless
 * AVATAR_STUDIO_V2 allows this user. Every scene must be the caller's, ready, and from this project.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { StudioError } from '@/lib/avatar/studio/errors';
import { liveSceneDeps } from '@/lib/avatar/studio/live';
import { checkJobs, stitchPresentation } from '@/lib/avatar/studio/presentation.server';
import { MAX_SCENES } from '@/lib/avatar/studio/scriptScenes';
import { studioFail, studioOpenTo } from '@/lib/avatar/studio/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE, label: 'avatar.studio.stitch', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return studioFail('sign_in', 'Sign in to use the studio.', 401);
  if (!(await studioOpenTo(user))) return studioFail('feature_off', 'Not found.', 404);
  const body = (await req.json().catch(() => null)) as { projectId?: unknown; jobIds?: unknown } | null;
  const projectId = typeof body?.projectId === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(body.projectId) ? body.projectId : null;
  const ids = Array.isArray(body?.jobIds) && body!.jobIds.length >= 1 && body!.jobIds.length <= MAX_SCENES && body!.jobIds.every((x) => typeof x === 'string') ? (body!.jobIds as string[]) : null;
  if (!projectId || !ids) return studioFail('invalid_request', 'projectId and 1–10 jobIds are required.', 400);
  const deps = liveSceneDeps(user.id);
  try {
    const jobs = checkJobs(await Promise.all(ids.map((id) => deps.loadJob(user.id, id))), projectId);
    return NextResponse.json({ ok: true, ...(await stitchPresentation(deps, user.id, projectId, jobs)) });
  } catch (e) {
    if (e instanceof StudioError) return studioFail(e.code, e.message, e.status);
    return studioFail('stitch_failed', 'The presentation could not be joined.', 502);
  }
}

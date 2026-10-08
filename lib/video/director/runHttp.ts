/**
 * lib/video/director/runHttp.ts — what every /api/video/director/* route does before and after its one call: the
 * VIDEO_DIRECTOR_RUNS gate, the signed-in user, the rate limit, and one mapping from the director's errors to HTTP.
 *
 * ⚠️ A CLOSED GATE IS A 404, checked before anything else: with the flag off the routes do not exist as far as a caller
 * can tell (and with `admin`, for everyone who is not one).
 */
import 'server-only';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, type RateLimitConfig } from '@/lib/api/rate-limit';
import { DirectorRunDecisionError, DirectorRunNotFoundError } from './run';
import { directorRunsAccess, directorRunsConfigured, directorRunsOpenTo } from './runServer';
import { StoryboardNotFrozenError, StoryboardValidationError } from './storyboard';

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

/** 404 while VIDEO_DIRECTOR_RUNS is off — checked before the session, so a closed route says nothing more. */
export function directorRoutesClosed(): NextResponse | null {
  return directorRunsAccess() === 'off' ? notFound() : null;
}

/**
 * Whether the route may serve this caller: signed in (401), let in by the gate (404 for a non-admin under `admin`), the
 * runs table reachable (503), within the per-user rate limit. Null = go ahead. Each route reads the session itself
 * (authedClientFromRequest) so its own code carries the gate the API lockdown guard looks for.
 */
export async function refuseDirectorCaller(req: NextRequest, user: User | null, limit: RateLimitConfig): Promise<NextResponse | null> {
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!directorRunsOpenTo(user)) return notFound();
  if (!directorRunsConfigured()) {
    return NextResponse.json({ error: 'not_configured', message: 'Director runs need the Supabase service role.' }, { status: 503 });
  }
  return checkRateLimit(req, limit, user.id);
}

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRunId(value: unknown): value is string {
  return typeof value === 'string' && RUN_ID.test(value);
}

/** The director's errors as HTTP; anything else is a logged 500 that names nothing internal. */
export function directorErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof DirectorRunNotFoundError) return notFound();
  if (err instanceof DirectorRunDecisionError) return NextResponse.json({ error: 'decision_not_applicable', message: err.message }, { status: 409 });
  if (err instanceof StoryboardValidationError) {
    return NextResponse.json({ error: 'invalid_storyboard', message: err.message, problems: err.problems }, { status: 400 });
  }
  if (err instanceof StoryboardNotFrozenError) return NextResponse.json({ error: 'not_approved', message: err.message }, { status: 400 });
  // eslint-disable-next-line no-console
  console.error(`[video/director] ${where}:`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: 'director_failed' }, { status: 500 });
}

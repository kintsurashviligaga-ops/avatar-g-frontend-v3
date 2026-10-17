import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { MAX_SHOTS } from '@/lib/services/montage/montagePlan';
import { authedClientFromRequest } from '@/lib/supabase/server';

/**
 * POST /api/upload/resign — fresh playable URLs for the media a montage draft names when the editor comes back after a
 * reload (components/studio/montage/draft). Body `{ refs: string[] }`, at most one per shot plus the song.
 *
 * Each ref is decided by the rule every media route applies (lib/security/callerMedia resolveCallerMedia): a storage
 * path must be the caller's own upload; a URL of our storage must be one the caller may read (their Library). Anything
 * else — someone else's file, a URL on another host, an object that is gone — answers null, never the ref echoed back.
 *
 * Answers: 200 { urls: (string | null)[] } in the order of `refs` · 400 bad body · 401 signed out.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const MAX_REFS = MAX_SHOTS + 1;
/** Long enough for an editing session; the draft is signed again the next time it is opened. */
const TTL_SEC = 6 * 3600;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;

  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { refs?: unknown };
  const refs = Array.isArray(body.refs) ? body.refs : null;
  if (!refs || refs.length === 0 || refs.length > MAX_REFS || !refs.every((r) => typeof r === 'string')) {
    return NextResponse.json({ error: `refs: 1–${MAX_REFS} strings` }, { status: 400 });
  }

  const urls = await Promise.all((refs as string[]).map(async (ref) => {
    const got = await resolveCallerMedia(ref, user.id, TTL_SEC).catch(() => null);
    return got?.ok && got.own ? got.url : null;
  }));
  return NextResponse.json({ urls }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * /api/film/sweep — the per-minute keeper of chat films whose tab closed (lib/chat/filmFollowWorker): it gives up the
 * follow rows whose last attempt died, pays back what a film that could not be finished still has charged, and drives
 * every film its tab stopped polling: the next scene goes out, and once the scenes are in, ONE film per minute is stitched
 * through the same /api/video/assemble the tab uses, filed in the owner's Library with its notification.
 *
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET` (lib/api/cronAuth; no secret = refused). FILM_FOLLOW=off
 * stops it (films go back to being their tab's alone). It lives outside app/api/cron/** because that folder's functions
 * are capped at 60 s and a stitch is not.
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { sweepFilmFollows } from '@/lib/chat/filmFollowWorker';
import { liveFilmFollowDeps, newFollowWorkerId } from '@/lib/chat/filmFollowLive';
import { filmFollowEnabled, followKey } from '@/lib/chat/filmFollowFile';
import { reportError } from '@/lib/observability/report-error';
import { opsMarker } from '@/lib/observability/reliability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;
/** Every read live: a heartbeat must see the row as it is now (app/api/agent/media/sweep, lib/api/cronFetchCache.test.ts). */
export const fetchCache = 'force-no-store';

/** The sweep's own budget: the function's limit less a margin for the answer. */
const BUDGET_MS = (maxDuration - 20) * 1000;

export async function GET(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!filmFollowEnabled()) return NextResponse.json({ ok: true, skipped: 'FILM_FOLLOW is off' });
  if (!followKey()) return NextResponse.json({ ok: true, skipped: 'no signing key' });
  try {
    const report = await sweepFilmFollows(liveFilmFollowDeps(new URL(req.url).origin), {
      worker: newFollowWorkerId(), startedAt, budgetMs: BUDGET_MS,
    });
    if (report.gaveUp.length || report.stillOwed.length) opsMarker('warn', 'film_follow_recovery', { gaveUp: report.gaveUp.length, stillOwed: report.stillOwed.length });
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    reportError(e, { route: '/api/film/sweep' });
    opsMarker('error', 'film_follow_sweep_failure', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

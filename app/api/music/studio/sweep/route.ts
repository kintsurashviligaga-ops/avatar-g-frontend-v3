/**
 * GET /api/music/studio/sweep — the per-minute keeper of the Music Studio queue (Vercel Cron, Bearer CRON_SECRET):
 * fails jobs whose worker died twice or whose charge never finished (recording the refund in the same write), pays
 * every refund still owed (at most what was debited, once), then works the oldest waiting job.
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { sweepMusic } from '@/lib/music/studio/engine';
import { liveMusicDeps } from '@/lib/music/studio/live';
import { musicStudioEnabled } from '@/lib/music/studio/capabilities';
import { newWorkerId } from '@/lib/agent/media/montageLive';
import { reportError } from '@/lib/observability/report-error';
import { opsMarker } from '@/lib/observability/reliability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const fetchCache = 'force-no-store';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Settlement keeps running while the studio is switched off: a debt left by a job started before the switch is paid.
  try {
    const report = await sweepMusic(liveMusicDeps(), newWorkerId(), musicStudioEnabled());
    if (report.unsettled > 0) opsMarker('warn', 'music_studio_unsettled', { unsettled: report.unsettled });
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    reportError(e, { route: '/api/music/studio/sweep' });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

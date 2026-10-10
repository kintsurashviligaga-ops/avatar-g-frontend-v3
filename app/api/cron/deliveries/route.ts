/**
 * /api/cron/deliveries — every minute (vercel.json), the net under the delivery outbox (lib/notifications/outbox.ts):
 * every server-run job or Agent G run that ended and still owes its owner a notice gets it now, retried after a passing
 * failure, never sent twice. The request that ended a job kicks its own delivery first; this catches what that kick
 * missed (the function was killed, the job ended in a worker or the media sweep).
 *
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET` (lib/api/cronAuth; no secret = refused). Inert while
 * DELIVERY_OUTBOX is off: nothing is read or written then.
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { sweepDeliveries } from '@/lib/notifications/outbox';
import { deliveryOutboxOn, liveOutboxDeps } from '@/lib/notifications/outboxLive';
import { reportError } from '@/lib/observability/report-error';
import { opsMarker } from '@/lib/observability/reliability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!deliveryOutboxOn()) return NextResponse.json({ ok: true, skipped: 'the delivery outbox is off' });
  try {
    const report = await sweepDeliveries(liveOutboxDeps(), { limit: 50 });
    if ((report.outcomes.expired ?? 0) > 0 || (report.outcomes.raced ?? 0) > 0) opsMarker('warn', 'delivery_outbox', { ...report });
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    reportError(e, { route: '/api/cron/deliveries' });
    opsMarker('error', 'delivery_outbox_failure', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

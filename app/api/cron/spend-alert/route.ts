/**
 * /api/cron/spend-alert — every 10 minutes (vercel.json): today's booked platform spend (BillingGuard's ledger) against
 * SPEND_ALERT_USD, so the owner hears about spend that never went through a hard-cap reservation (a caller outside
 * guardedCall, a ledger-only day while Redis is down). Inert while SPEND_ALERT_USD is unset: nothing is read or sent.
 * When the ledger cannot be read, the owner is told that too (once a day): a guard that cannot count is news.
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { getDailyUsage, checkThresholds } from '@/lib/services/billing/BillingGuard';
import { alertCapReached, maybeAlertSpend, spendAlertUsd } from '@/lib/billing/spendAlert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const fetchCache = 'force-no-store';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (spendAlertUsd() === null) return NextResponse.json({ ok: true, skipped: 'SPEND_ALERT_USD is not set' });
  const day = new Date().toISOString().slice(0, 10);
  const alerts = await checkThresholds();
  if (alerts.some((a) => a.code === 'ledger_unavailable')) {
    await alertCapReached('ledger_unavailable', day, 'The spend ledger cannot be read: every paid call is refused until it can (BillingGuard fails closed).');
    return NextResponse.json({ ok: true, ledger: 'unavailable' });
  }
  const usage = await getDailyUsage();
  const sent = await maybeAlertSpend(usage.used, day);
  return NextResponse.json({ ok: true, usedUsd: usage.used, sent });
}

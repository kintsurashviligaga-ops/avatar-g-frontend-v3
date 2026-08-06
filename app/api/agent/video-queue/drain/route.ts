import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { drainOnce } from '@/lib/agent/videoQueue';
import { reportError } from '@/lib/observability/report-error';

/**
 * POST /api/agent/video-queue/drain — advance this user's queue by ONE step.
 *
 * ⚠️ ONE STEP PER CALL, ON PURPOSE. Vercel functions are short-lived and this project has no daemon, so
 * a loop over 25 clips cannot survive the request. The caller (Agent G, or a cron) polls this until it
 * answers `idle`. Each call either submits the next prompt or polls the one in flight — both are short.
 *
 * ⚠️ AND EXACTLY ONE ITEM IS IN FLIGHT PER USER. drainOnce polls before it submits, so a batch renders
 * sequentially rather than firing 25 Veo jobs at once — which is what the owner asked for ("რიგ-რიგობით")
 * and also what keeps a failing provider from burning 25 charges before anyone notices.
 *
 * Returns the action taken so the caller knows whether to keep going:
 *   submitted · pending · done · failed · insufficient · idle
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }

  // EXPENSIVE: each call can start a paid render. Keyed to the user so one caller cannot drain another's
  // budget by hammering this.
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  try {
    const result = await drainOnce(createServiceRoleClient(), user.id);
    return NextResponse.json({
      action: result.action,
      // `idle` is the caller's stop signal — everything else means there is more to do.
      more: result.action !== 'idle',
      ...(result.item ? { ordinal: result.item.ordinal, status: result.item.status } : {}),
    });
  } catch (e) {
    reportError(e, { route: 'agent.video-queue.drain' });
    return NextResponse.json({ error: 'drain_failed' }, { status: 503 });
  }
}

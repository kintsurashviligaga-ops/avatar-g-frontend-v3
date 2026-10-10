/**
 * POST /api/analytics/track (PHASE 4 Task 1) — store a first-party analytics event.
 * Body: { event: string, props?: object }. Attaches the current user (if any).
 * Fail-open: always returns 200 {ok} so the client tracker never sees an error,
 * and silently no-ops if the analytics_events table isn't migrated yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

/** The largest `props` object stored per event (serialized). A real event carries a few fields. */
const MAX_PROPS_BYTES = 4096;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // ⚠️ Anonymous by design, but every accepted event is a SERVICE-ROLE insert: with no limit and an unbounded `props`
  // object, one script could fill analytics_events (and the database's storage) at will. Per-IP bucket (its own,
  // inside PUBLIC, so page trackers never touch other budgets) and a props size cap.
  const limited = await checkRateLimit(req, RATE_LIMITS.PUBLIC, 'analytics-track');
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => ({}))) as { event?: unknown; props?: unknown };
    const event = typeof body.event === 'string' ? body.event.trim().slice(0, 80) : '';
    if (!event) return NextResponse.json({ ok: false }, { status: 400 });
    // `audit.*` rows are the server's own record of what Agent G executed (lib/agent/media/montageLive); a client
    // writing one could forge that record.
    if (/^audit\./i.test(event)) return NextResponse.json({ ok: false }, { status: 400 });
    let props: unknown = body.props && typeof body.props === 'object' ? body.props : {};
    try {
      if (Buffer.byteLength(JSON.stringify(props), 'utf8') > MAX_PROPS_BYTES) props = { truncated: true };
    } catch {
      props = {};
    }

    // User is optional — anonymous events are allowed (user_id null).
    const { user } = await authedClientFromRequest(req);
    const svc = createServiceRoleClient();
    if (svc) {
      await svc.from('analytics_events').insert({
        user_id: user?.id ?? null,
        event_name: event,
        props,
      });
    }
  } catch { /* fail-open — analytics must never break a flow */ }
  return NextResponse.json({ ok: true });
}

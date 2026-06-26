/**
 * POST /api/analytics/track (PHASE 4 Task 1) — store a first-party analytics event.
 * Body: { event: string, props?: object }. Attaches the current user (if any).
 * Fail-open: always returns 200 {ok} so the client tracker never sees an error,
 * and silently no-ops if the analytics_events table isn't migrated yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { event?: unknown; props?: unknown };
    const event = typeof body.event === 'string' ? body.event.trim().slice(0, 80) : '';
    if (!event) return NextResponse.json({ ok: false }, { status: 400 });
    const props = body.props && typeof body.props === 'object' ? body.props : {};

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

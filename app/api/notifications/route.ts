/**
 * /api/notifications (PHASE 3 Task 3)
 *   GET   → { items: last 5, unread: count }   (authed; anon → empty 200)
 *   POST  { type, message } → file a notification for the current user
 *   PATCH { id? } → mark one (id) or all unread notifications read
 *
 * Fail-open everywhere: if the notifications table isn't migrated yet, GET returns
 * an empty feed and writes no-op — the bell just shows nothing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { listNotifications, unreadCount, createNotification, markRead, type NotificationType } from '@/lib/notifications/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TYPES: NotificationType[] = ['video', 'music', 'image', 'credits_low', 'payment'];

export async function GET(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ items: [], unread: 0 });
  const [items, unread] = await Promise.all([
    listNotifications(supabase, user.id, 5),
    unreadCount(supabase, user.id),
  ]);
  return NextResponse.json({ items, unread });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { type?: string; message?: string };
  const type = TYPES.includes(body.type as NotificationType) ? (body.type as NotificationType) : null;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!type || !message) return NextResponse.json({ ok: false, error: 'type + message required' }, { status: 400 });
  const ok = await createNotification(supabase, user.id, type, message);
  return NextResponse.json({ ok });
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const ok = await markRead(supabase, user.id, typeof body.id === 'string' ? body.id : undefined);
  return NextResponse.json({ ok });
}

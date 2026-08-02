import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getOrCreateOpenChat, markReadForUser } from '@/lib/support/server';

/**
 * Clear MY unread badge. Takes no body at all — the chat is derived from the session, so there is
 * nothing a caller could point at someone else's thread.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }

  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  try {
    const svc = createServiceRoleClient();
    const chat = await getOrCreateOpenChat(svc, user.id);
    await markReadForUser(svc, chat.id, user.id);
    return NextResponse.json({ ok: true });
  } catch {
    // Best-effort: a failed badge-clear must never surface as an error in the widget.
    return NextResponse.json({ ok: false });
  }
}

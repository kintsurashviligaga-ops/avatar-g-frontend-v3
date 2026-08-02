import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { listChatsForAdmin, totalUnreadForAdmin } from '@/lib/support/server';
import { reportError } from '@/lib/observability/report-error';

/**
 * The support inbox list, newest activity first.
 *
 * ⚠️ GATED BY THE EMAIL ALLOWLIST (lib/auth/adminGuard), never by user_metadata — that is self-grantable
 * and would hand any signed-up account every customer's support transcript.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;

  const statusParam = req.nextUrl.searchParams.get('status');
  const status =
    statusParam === 'open' || statusParam === 'pending' || statusParam === 'closed' || statusParam === 'all'
      ? statusParam
      : 'open';

  try {
    const svc = createServiceRoleClient();
    const [chats, unread] = await Promise.all([listChatsForAdmin(svc, { status }), totalUnreadForAdmin(svc)]);
    return NextResponse.json({ chats, unread });
  } catch (e) {
    reportError(e, { route: 'admin.support.chats' });
    // The table may not exist yet — the migration is applied by hand. An empty inbox is a better answer
    // than a 500 that makes the whole admin tab look broken.
    return NextResponse.json({ chats: [], unread: 0, degraded: true });
  }
}

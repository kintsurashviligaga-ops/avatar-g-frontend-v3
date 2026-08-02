import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { normalizeSupportBody } from '@/lib/support/sanitize';
import { appendMessage, getOrCreateOpenChat, listMessages, markReadForUser } from '@/lib/support/server';
import { reportError } from '@/lib/observability/report-error';

/**
 * The user half of the support chat.
 *   GET  → my open chat + its transcript (creates the chat lazily on first open)
 *   POST → append my message
 *
 * ⚠️ NO chatId, userId OR email IS ACCEPTED FROM THE CLIENT, ON EITHER VERB. The principal is resolved
 * from the session cookie by requireUser(), and "my chat" is derived from it — so there is no id to
 * tamper with and nothing to enumerate. This is the IDOR designed out rather than guarded against; the
 * project has shipped a body-supplied-userId IDOR before and this route must never reintroduce the shape.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }

  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;

  try {
    const svc = createServiceRoleClient();
    const chat = await getOrCreateOpenChat(svc, user.id);
    const messages = await listMessages(svc, chat.id);
    return NextResponse.json({ chat, messages });
  } catch (e) {
    reportError(e, { route: 'support.chat.GET' });
    return NextResponse.json({ error: 'support_unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }

  // Keyed on the user, not the IP: a shared IP (office, mobile carrier NAT) must not let one person's
  // typing lock out everyone else's.
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const raw = await req.json().catch(() => ({}));
  const body = normalizeSupportBody((raw as { body?: unknown })?.body);
  // null, not '' — an empty insert would bump the admin's unread counter for a blank row.
  if (!body) return NextResponse.json({ error: 'empty_message' }, { status: 400 });

  try {
    const svc = createServiceRoleClient();
    const chat = await getOrCreateOpenChat(svc, user.id);
    const message = await appendMessage(svc, chat.id, 'user', body, { id: user.id, email: user.email ?? null });
    // Sending is also reading: whatever the admin last said has now been seen.
    await markReadForUser(svc, chat.id, user.id);
    return NextResponse.json({ message });
  } catch (e) {
    reportError(e, { route: 'support.chat.POST' });
    return NextResponse.json({ error: 'support_unavailable' }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

/**
 * POST /api/presence/ping — "I am still here."
 *
 * ⚠️ DELIBERATELY UNAUTHENTICATED. The question the admin panel asks is "how many people are on the
 * site", and most of them are anonymous readers on the pricing or terms page. Requiring a session would
 * count only signed-in users and quietly answer a different question.
 *
 * ⚠️ WHICH MAKES IT THE CHEAPEST WRITE ENDPOINT IN THE PRODUCT, so it is bounded three ways:
 *   · IP rate limit — a heartbeat is one call per 45s, so the READ budget is already generous for it
 *   · the visitor id is length-checked and used as a PRIMARY KEY, so a flood overwrites its own row
 *     instead of appending; the table cannot grow past the number of distinct ids
 *   · nothing but an opaque token, an optional user id and a coarse section is ever stored
 *
 * ⚠️ NO IP, NO USER-AGENT, NO PATH. `section` is a coarse label the client derives, never a full URL —
 * a signed asset URL or a query string can carry a token, and this row is read by admins. A live
 * counter must not quietly become a browsing log for every anonymous reader.
 *
 * Fails silent: presence is a nice-to-have, and a visitor must never see an error because a counter
 * could not be written.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ID_OK = /^[A-Za-z0-9_-]{8,64}$/;
const SECTIONS = new Set(['chat', 'library', 'pricing', 'settings', 'support', 'legal', 'marketing', 'admin', 'other']);

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; section?: unknown };
  const id = String(body.id ?? '');
  if (!ID_OK.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const raw = String(body.section ?? 'other');
  const section = SECTIONS.has(raw) ? raw : 'other';

  // Signed-in visitors are attributed; anonymous ones are still counted.
  let userId: string | null = null;
  try {
    const { data: { user } } = await createSupabaseServerClient().auth.getUser();
    userId = user?.id ?? null;
  } catch { /* anonymous */ }

  try {
    await createServiceRoleClient()
      .from('active_visitors')
      .upsert({ id, user_id: userId, section, last_seen: new Date().toISOString() }, { onConflict: 'id' });
  } catch {
    // Table not migrated yet, or a transient blip. Never surfaced — see the header.
  }
  return NextResponse.json({ ok: true });
}

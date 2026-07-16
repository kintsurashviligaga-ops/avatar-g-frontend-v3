import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

/**
 * /api/chat/trash — VECTOR 8. The Trash-Bin backend for chat_sessions (soft delete + restore + 30-day purge).
 *
 *   GET                              → list the user's trashed chats (+ opportunistic purge of >30-day ones)
 *   POST { action:'delete', id }     → SOFT delete (is_deleted=true, deleted_at=now)
 *   POST { action:'restore', id }    → restore (is_deleted=false, deleted_at=null)
 *   POST { action:'purge' }          → permanently remove this user's chats trashed >30 days ago
 *
 * FAIL-OPEN: before migration 007 (columns absent) the soft-delete falls back to the existing HARD delete so
 * "delete" always works; the trash LIST returns [] on any error; typecheck stays green because the new columns
 * are reached through a loosely-typed client view. Every query is RLS-scoped to the signed-in user.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Minimal structural view of the Supabase builder — chainable + awaitable — so the not-yet-typed columns
// (is_deleted / deleted_at) never break typecheck. The real client is structurally compatible.
interface Flt extends PromiseLike<{ data: unknown; error: unknown }> {
  eq: (c: string, v: unknown) => Flt;
  in: (c: string, v: readonly unknown[]) => Flt;
  lt: (c: string, v: unknown) => Flt;
  order: (c: string, o?: { ascending?: boolean }) => Flt;
  limit: (n: number) => Flt;
  select: (c: string) => Flt;
}
interface Tbl { select: (c: string) => Flt; update: (v: Record<string, unknown>) => Flt; delete: () => Flt; }
interface Sb { from: (t: string) => Tbl; }

async function purgeExpired(sb: Sb, uid: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
    const { data } = await sb.from('chat_sessions').select('session_id').eq('user_id', uid).eq('is_deleted', true).lt('deleted_at', cutoff).limit(200);
    const ids = Array.isArray(data) ? (data as Array<{ session_id?: string }>).map((r) => r.session_id).filter((x): x is string => !!x) : [];
    if (ids.length) {
      await sb.from('chat_messages').delete().in('session_id', ids);
      await sb.from('chat_sessions').delete().in('session_id', ids);
    }
  } catch {
    // best-effort — purge failure never blocks the response
  }
}

export async function GET(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user?.id) return NextResponse.json({ items: [] });
  const { supabase } = await authedClientFromRequest(req);
  const sb = supabase as unknown as Sb;
  try {
    await purgeExpired(sb, user.id);
    const { data, error } = await sb
      .from('chat_sessions')
      .select('session_id, title, updated_at, deleted_at')
      .eq('user_id', user.id)
      .eq('is_deleted', true)
      .order('deleted_at', { ascending: false })
      .limit(100);
    if (error || !Array.isArray(data)) return NextResponse.json({ items: [] }); // absent column / error → empty trash
    return NextResponse.json({ items: data });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: string; id?: string } | null;
  const action = body?.action;
  const id = typeof body?.id === 'string' ? body.id : null;
  const sb = supabase as unknown as Sb;
  const uid = user.id;

  try {
    if (action === 'delete') {
      if (!id) return NextResponse.json({ ok: false, error: 'no_id' }, { status: 400 });
      const { error } = await sb.from('chat_sessions').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('session_id', id).eq('user_id', uid);
      if (error) {
        // Fall back to a HARD delete ONLY when the soft-delete COLUMNS genuinely don't exist yet (pre-migration
        // 007). For any OTHER error (transient / permission / lock) keep the row intact and surface a failure —
        // never destroy the chat + its messages on a blip. (undefined_column = 42703; PostgREST schema-cache miss.)
        const e = error as { code?: string; message?: string };
        const missingColumn = e.code === '42703' || /column .*does not exist|is_deleted|deleted_at|schema cache|PGRST\d/i.test(e.message || '');
        if (!missingColumn) {
          return NextResponse.json({ ok: false, error: 'delete_failed' }, { status: 500 });
        }
        await sb.from('chat_messages').delete().eq('session_id', id);
        await sb.from('chat_sessions').delete().eq('session_id', id).eq('user_id', uid);
        return NextResponse.json({ ok: true, soft: false });
      }
      return NextResponse.json({ ok: true, soft: true });
    }

    if (action === 'restore') {
      if (!id) return NextResponse.json({ ok: false, error: 'no_id' }, { status: 400 });
      const { error } = await sb.from('chat_sessions').update({ is_deleted: false, deleted_at: null }).eq('session_id', id).eq('user_id', uid);
      if (error) return NextResponse.json({ ok: false, error: 'restore_unavailable' }, { status: 409 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'purge') {
      await purgeExpired(sb, uid);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: 'trash_error' }, { status: 500 });
  }
}

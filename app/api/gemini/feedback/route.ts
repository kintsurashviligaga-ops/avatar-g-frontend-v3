/**
 * POST /api/gemini/feedback — a thumbs up / down on one assistant message.
 *
 * Body: { messageId: string, rating: 1 | -1 }. The rater is the SESSION user (authedClientFromRequest) —
 * a guest gets 401 and nothing is written.
 *
 * ⚠️ THIS ROUTE WRITES WITH THE SERVICE-ROLE KEY (RLS BYPASSED). It used to take `userId` from the request
 * body and upsert on `message_id` alone, so any anonymous caller could plant a rating under any account and
 * overwrite anyone's vote by naming its message id. Now the owner is the session, and a row that already
 * belongs to a different account (or to none) is left alone — the same rule /api/gemini/chat applies to
 * sessions.
 *
 * ⚠️ supabase-js RETURNS `{ error }` INSTEAD OF THROWING (e.g. when `gemini_message_feedback` does not exist —
 * no migration in this repo creates it). Both calls are checked, so a failed write answers 500 instead of the
 * old unconditional `{ ok: true }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

const TABLE = 'gemini_message_feedback';
/** Client message ids are UUIDs or short slugs; anything else is not an id we ever issued. */
const MESSAGE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;

  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Sign in to rate replies.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { messageId?: unknown; rating?: unknown } | null;
  const messageId = typeof body?.messageId === 'string' ? body.messageId.trim() : '';
  const rating = body?.rating;
  if (!MESSAGE_ID_RE.test(messageId) || (rating !== 1 && rating !== -1)) {
    return NextResponse.json({ error: 'Invalid request: messageId and rating (-1|1) required' }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { data: existing, error: readError } = await supabase
      .from(TABLE)
      .select('user_id')
      .eq('message_id', messageId)
      .maybeSingle();
    if (readError) throw new Error(`read: ${readError.message}`);
    if (existing && (existing as { user_id?: string | null }).user_id !== userId) {
      return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    }
    const { error: writeError } = await supabase
      .from(TABLE)
      .upsert({ message_id: messageId, rating, user_id: userId }, { onConflict: 'message_id' });
    if (writeError) throw new Error(`write: ${writeError.message}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn('[gemini/feedback] not recorded:', (err instanceof Error ? err.message : String(err)).slice(0, 160));
    // Never echo the database error to the caller.
    return NextResponse.json({ ok: false, error: 'not_recorded' }, { status: 500 });
  }
}

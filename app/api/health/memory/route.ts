/**
 * GET /api/health/memory — launch diagnostic for the cross-chat memory + trash schema and the
 * launch-critical env wiring. Confirms migration 007 actually landed BEFORE you start live testing.
 *
 * Returns BOOLEANS ONLY — no rows, no PII, no secret VALUES (just "is this key set?"). Auth-required
 * (a signed-in user), so it isn't an open probe of your infrastructure. Uses the service-role client for
 * the schema reachability check so RLS never masks a "table missing" as an empty result.
 *
 * ok === true  ⇒ user_profile_metadata is reachable ⇒ companion memory will persist. If ok is false, the
 * migration hasn't run on this environment yet (or the service-role key is absent).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ProbeResult { reachable: boolean; error?: string }

/** Head-only count probe: no rows transfer; a missing table/column surfaces as an error, not empty data. */
async function probe(table: string, column: string): Promise<ProbeResult> {
  let sb: ReturnType<typeof createServiceRoleClient>;
  try {
    sb = createServiceRoleClient();
  } catch {
    return { reachable: false, error: 'service-role client unavailable' };
  }
  try {
    const { error } = await sb.from(table).select(column, { count: 'exact', head: true });
    if (error) return { reachable: false, error: String((error as { message?: string }).message ?? error).slice(0, 140) };
    return { reachable: true };
  } catch (e) {
    return { reachable: false, error: e instanceof Error ? e.message.slice(0, 140) : 'probe failed' };
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuthenticatedUser(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Migration 007: the memory table + the chat_sessions soft-delete column (probed via is_deleted).
  const [memory, trash] = await Promise.all([
    probe('user_profile_metadata', 'user_id'),
    probe('chat_sessions', 'is_deleted'),
  ]);

  // Launch env presence — booleans only (never the values). Answers "are the keys active on Vercel?".
  const env = {
    stripeSecret: !!process.env.STRIPE_SECRET_KEY,
    stripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
    resend: !!process.env.RESEND_API_KEY,
    replicate: !!process.env.REPLICATE_API_TOKEN,
    inpaintModel: !!process.env.REPLICATE_INPAINT_MODEL,
  };

  return NextResponse.json({
    ok: memory.reachable,
    checks: {
      user_profile_metadata: memory, // cross-chat companion memory (migration 007 §3)
      chat_sessions_soft_delete: trash, // trash bin (migration 007 §8)
    },
    env,
    note: memory.reachable
      ? 'Memory schema is live — companion memory will persist across sessions.'
      : 'Memory schema NOT reachable — run migration 007 (or set the service-role key) before live testing.',
  });
}

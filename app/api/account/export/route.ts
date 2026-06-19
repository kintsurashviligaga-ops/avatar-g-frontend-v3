import { NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/account/export — GDPR "download my data".
 *
 * Returns a single JSON document with the authenticated user's profile + every row
 * they own across the same tables the deletion endpoint purges (so export and erasure
 * stay in sync). Best-effort per table: a missing table can never break the export.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// Mirror of /api/account/delete USER_TABLES — the user's personal data lives here.
const USER_TABLES: { table: string; col: string }[] = [
  { table: 'avatars', col: 'user_id' },
  { table: 'credits', col: 'user_id' },
  { table: 'credits_ledger', col: 'user_id' },
  { table: 'jobs', col: 'user_id' },
  { table: 'chat_sessions', col: 'user_id' },
  { table: 'chat_messages', col: 'user_id' },
  { table: 'business_profiles', col: 'user_id' },
  { table: 'agent_g_memory', col: 'user_id' },
  { table: 'profiles', col: 'id' },
];

export async function GET(req: Request) {
  const { user } = await authedClientFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const meta = (user.user_metadata ?? {}) as { name?: string };
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      name: meta.name ?? null,
      createdAt: user.created_at ?? null,
      metadata: user.user_metadata ?? {},
    },
  };

  for (const { table, col } of USER_TABLES) {
    try {
      const { data: rows } = await admin.from(table).select('*').eq(col, user.id);
      out[table] = rows ?? [];
    } catch {
      out[table] = [];
    }
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="myavatar-data-${user.id.slice(0, 8)}.json"`,
    },
  });
}

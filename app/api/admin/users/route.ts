/**
 * GET /api/admin/users?q=&page= — admin-only paginated user list/search.
 * Gated by isAdmin() = the EMAIL ALLOWLIST only (founder ∪ ADMIN_EMAILS) — user_metadata is never
 * trusted for authz. Returns PII (emails) → admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { listUsers } from '@/lib/admin/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });
  }
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  // Clamp page to [0, 100000] — a lower AND upper bound so a huge offset can't be requested.
  const page = Math.min(100_000, Math.max(0, Number(url.searchParams.get('page') ?? '0') || 0));
  const result = await listUsers(svc, { q, page });
  return NextResponse.json(result);
}

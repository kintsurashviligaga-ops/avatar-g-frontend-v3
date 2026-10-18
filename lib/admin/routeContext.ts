/**
 * lib/admin/routeContext.ts — the opening every admin write route shares: the admin gate (isAdmin, the one rule the
 * page uses too), the service-role client, and who pressed the button (stamped on the ledger row / ops log).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createRouteHandlerClient, createServiceRoleClient } from '@/lib/supabase/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type AdminContext = { ok: true; svc: Client; actorId: string } | { ok: false; response: NextResponse };

export async function adminContext(): Promise<AdminContext> {
  if (!(await isAdmin())) return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  let svc: Client;
  try {
    svc = createServiceRoleClient() as Client;
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'server_misconfigured' }, { status: 503 }) };
  }
  let actorId = 'admin';
  try {
    const { data: { user } } = await createRouteHandlerClient().auth.getUser();
    if (user?.id) actorId = user.id;
  } catch {
    /* keep the default label */
  }
  return { ok: true, svc, actorId };
}

/** HTTP status for a write's error code. */
export function writeStatus(error: string | undefined): number {
  switch (error) {
    case 'invalid_amount': case 'invalid_request': case 'invalid_tier': case 'not_refundable': return 400;
    case 'user_not_found': case 'not_found': return 404;
    case 'insufficient_balance': case 'already_refunded': return 409;
    case 'preview_not_isolated': return 423;
    default: return 500;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

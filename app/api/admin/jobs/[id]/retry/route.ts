/**
 * POST /api/admin/jobs/[id]/retry — reset a FAILED job to pending + clear its error (v358 #4). Un-sticks the
 * DB state so a fresh run can be recorded; the render itself is client-driven. Idempotent (only acts on a
 * failed row). isAdmin-gated.
 */
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { retryJob } from '@/lib/admin/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  let svc: ReturnType<typeof createServiceRoleClient>;
  try { svc = createServiceRoleClient(); } catch { return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 }); }
  const result = await retryJob(svc, id);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'retry_failed' }, { status: result.error === 'invalid_id' ? 400 : 500 });
  return NextResponse.json({ ok: true, changed: result.changed });
}

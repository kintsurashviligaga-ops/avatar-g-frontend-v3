/**
 * POST /api/admin/jobs/[id]/cancel — mark a stuck job failed (v358 #4). ADVISORY: renders are client-driven
 * and Kling/Replicate are blocking, so this manages DB state only (it does not abort a live provider render);
 * a still-running render self-corrects back to 'completed' on finish. FORFEIT — no credit refund. isAdmin-gated.
 */
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { cancelJob } from '@/lib/admin/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  let svc: ReturnType<typeof createServiceRoleClient>;
  try { svc = createServiceRoleClient(); } catch { return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 }); }
  const result = await cancelJob(svc, id);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'cancel_failed' }, { status: result.error === 'invalid_id' ? 400 : 500 });
  return NextResponse.json({ ok: true, changed: result.changed });
}

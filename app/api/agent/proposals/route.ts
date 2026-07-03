/**
 * GET /api/agent/proposals — STEP 5 admin review gate.
 *
 * Lists prompt_optimization_proposals (the propose-only optimizer's output) for an admin to
 * review. Read-only here: this route NEVER applies a proposal — accept/reject/apply is a
 * separate, deliberate human action. Admin-gated (lib/auth/adminGuard). Fail-soft: returns an
 * empty list (not a 500) when the table isn't applied yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const status = new URL(req.url).searchParams.get('status') ?? 'proposed';
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from('prompt_optimization_proposals')
      .select('id, agent_type, model, kind, priority, rationale, evidence, status, created_at')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ proposals: [], note: 'table unavailable — apply the migration', detail: error.message });
    return NextResponse.json({ proposals: data ?? [] });
  } catch (e) {
    return NextResponse.json({ proposals: [], note: 'optimizer store unreachable', detail: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * GET /api/orchestrator/jobs — reload-recovery feed (#5).
 *
 * Returns the authenticated user's most-recent generation jobs (newest first)
 * so the chat shell can, on mount, re-hydrate finished media and resume polling
 * any still-running pipeline after a browser reload / cross-device handoff.
 *
 * Reads through the user's own session client so RLS enforces owner-only access.
 * Unauthenticated → an empty list (200), never a 401: recovery is additive UI,
 * not a gated action.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { JOB_COLUMNS, type GenerationJobRow } from '@/lib/orchestrator/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ jobs: [] });

  // Optional `?status=active` narrows to in-flight rows.
  const onlyActive = req.nextUrl.searchParams.get('status') === 'active';
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 12) || 12));

  try {
    let query = supabase
      .from('generation_jobs')
      .select(JOB_COLUMNS)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (onlyActive) query = query.in('status', ['pending', 'processing']);

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return NextResponse.json({ jobs: [] });
    return NextResponse.json({ jobs: data as GenerationJobRow[] });
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}

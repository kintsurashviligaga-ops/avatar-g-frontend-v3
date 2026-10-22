/**
 * POST /api/generate — the studio generations entry (brief §4). Its models run on Higgsfield, which has no Google
 * engine, so every start is refused with 503 google_only before any quote, charge or provider call, whatever
 * MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1, lib/providers/mediaPolicy).
 *
 * GET /api/generate[?limit=12] — the caller's most recent jobs, newest first. A reload, or a start whose
 * answer was lost, must not make a job the user paid for disappear from their screen.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { studioV2Enabled } from '@/lib/studio/flags';
import { getStudioRuntime } from '@/lib/studio/runtime';
import { publicJob } from '@/lib/studio/saga';
import { notFound, sagaError, unauthorized } from '@/lib/studio/http';
import { TERMINAL_JOB_STATUSES } from '@/lib/studio/store';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!studioV2Enabled()) return notFound();
  return refuseOutsideEngine(req);
}

/** Outputs signed per completed job (a result can carry several images). */
const MAX_SIGNED_PER_JOB = 4;

export async function GET(req: NextRequest) {
  if (!studioV2Enabled()) return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return unauthorized();

  const rt = getStudioRuntime();
  if (!rt) return sagaError('not_configured');
  const n = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isInteger(n) && n > 0 ? Math.min(n, 30) : 12;

  const jobs = await rt.store.listForUser(user.id, limit);
  const out = await Promise.all(
    jobs.map(async (job) => {
      const urls = job.status === 'completed' ? await rt.signOutputs(job.output_urls.slice(0, MAX_SIGNED_PER_JOB)).catch(() => []) : [];
      return { ...publicJob(job, urls), terminal: TERMINAL_JOB_STATUSES.has(job.status) };
    }),
  );
  return NextResponse.json({ jobs: out }, { headers: { 'Cache-Control': 'no-store' } });
}

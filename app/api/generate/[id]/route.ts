/**
 * GET    /api/generate/:id — the caller's own job; finishes a `finalizing` job on read (copies the outputs
 *                            into our storage) so a result never waits for the next cron tick.
 * DELETE /api/generate/:id — cancel while the provider has not started (refunded in full).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { studioV2Enabled } from '@/lib/studio/flags';
import { getStudioRuntime } from '@/lib/studio/runtime';
import { publicJob } from '@/lib/studio/saga';
import { notFound, sagaError, unauthorized } from '@/lib/studio/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// A finalize downloads and re-uploads the outputs (a video can be tens of MB).
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!studioV2Enabled()) return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return unauthorized();
  if (!UUID_RE.test(params.id)) return notFound();

  const rt = getStudioRuntime();
  if (!rt) return sagaError('not_configured');
  let job = await rt.store.getForUser(params.id, user.id);
  if (!job) return notFound();
  if (job.status === 'finalizing') job = await rt.saga.finalize(job);

  const urls = job.status === 'completed' ? await rt.signOutputs(job.output_urls) : [];
  return NextResponse.json({ job: publicJob(job, urls) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!studioV2Enabled()) return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return unauthorized();
  if (!UUID_RE.test(params.id)) return notFound();

  const rt = getStudioRuntime();
  if (!rt) return sagaError('not_configured');
  const r = await rt.saga.cancel(params.id, user.id);
  if (!r.ok) return sagaError(r.code);
  return NextResponse.json({ job: publicJob(r.job) });
}

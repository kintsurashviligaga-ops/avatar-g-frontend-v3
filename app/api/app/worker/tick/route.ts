import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const internalToken = request.headers.get('x-internal-worker-token');
  if (!process.env.WORKER_INTERNAL_TOKEN || internalToken !== process.env.WORKER_INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const staleThreshold = new Date(Date.now() - 1000 * 60 * 10).toISOString();

  const { data: staleJobs, error: staleError } = await supabase
    .from('service_jobs')
    .select('id, attempt_count, max_attempts')
    .eq('status', 'processing')
    .lt('heartbeat_at', staleThreshold)
    .limit(100);

  if (staleError) {
    return NextResponse.json({ error: staleError.message }, { status: 500 });
  }

  let recycled = 0;
  let deadLettered = 0;

  for (const job of staleJobs ?? []) {
    const isDeadLetter = (job.attempt_count ?? 0) >= (job.max_attempts ?? 3);

    const { error } = await supabase
      .from('service_jobs')
      .update(
        isDeadLetter
          ? {
              status: 'failed',
              progress: 100,
              error_message: 'Moved to dead-letter after max retries',
              heartbeat_at: new Date().toISOString(),
            }
          : {
              status: 'queued',
              progress: 0,
              error_message: 'Recovered from stale processing heartbeat',
              heartbeat_at: new Date().toISOString(),
            }
      )
      .eq('id', job.id);

    if (!error) {
      if (isDeadLetter) deadLettered += 1;
      else recycled += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: staleJobs?.length ?? 0,
    recycled,
    dead_lettered: deadLettered,
  });
}
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { enqueueBatch, batchStatus } from '@/lib/agent/videoQueue';
import { reportError } from '@/lib/observability/report-error';

/**
 * The batch entry point Agent G calls.
 *   POST → { prompts[], aspect?, watermark? }  enqueue, returns { batchId }
 *   GET  → ?batchId=…                          the per-item status of that batch
 *
 * ⚠️ THE PRINCIPAL COMES FROM THE SESSION, NEVER THE BODY. These rows carry a user_id and every drained
 * item charges that user's credits — a body-supplied userId here would be a way to spend someone else's
 * balance. This project has shipped that shape of IDOR before.
 *
 * ⚠️ ENQUEUEING IS FREE. Nothing is charged until an item is actually rendered, so a batch that is
 * submitted and never drained costs the user nothing. The alternative — charge up front, refund the
 * remainder — leaves money parked against work that may never happen.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A ceiling, not a guess: 25 clips is ~200 credits of work, and a batch larger than that is almost
// always a mistake in the caller rather than an intention.
const MAX_BATCH = 25;
const ASPECTS = new Set(['16:9', '9:16', '1:1', '4:5']);

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }

  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { prompts?: unknown; aspect?: unknown; watermark?: unknown };
  const raw = Array.isArray(body.prompts) ? body.prompts : [];
  const prompts = raw
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0);

  if (!prompts.length) return NextResponse.json({ error: 'prompts_required' }, { status: 400 });
  if (prompts.length > MAX_BATCH) {
    return NextResponse.json({ error: 'batch_too_large', max: MAX_BATCH }, { status: 400 });
  }

  const aspect = typeof body.aspect === 'string' && ASPECTS.has(body.aspect) ? body.aspect : '16:9';
  const watermark = body.watermark !== false;

  try {
    const svc = createServiceRoleClient();
    const { batchId, count } = await enqueueBatch(svc, user.id, prompts, { aspect, watermark });
    return NextResponse.json({ batchId, count, status: 'queued' });
  } catch (e) {
    reportError(e, { route: 'agent.video-queue.POST' });
    return NextResponse.json(
      { error: 'queue_unavailable', message: 'Run migration 20260802g_agent_video_queue.sql' },
      { status: 503 },
    );
  }
}

export async function GET(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }

  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;

  const batchId = req.nextUrl.searchParams.get('batchId') ?? '';
  if (!batchId) return NextResponse.json({ error: 'batchId_required' }, { status: 400 });

  try {
    // batchStatus scopes by user_id too — a batch id is a uuid, but authorisation must not rest on it
    // being unguessable.
    const items = await batchStatus(createServiceRoleClient(), batchId, user.id);
    const done = items.filter((i) => i.status === 'done').length;
    const failed = items.filter((i) => i.status === 'failed').length;
    return NextResponse.json({
      batchId,
      total: items.length,
      done,
      failed,
      pending: items.length - done - failed,
      items: items.map((i) => ({
        ordinal: i.ordinal, status: i.status, videoUrl: i.video_url,
        error: i.error, credits: i.credits,
      })),
    });
  } catch (e) {
    reportError(e, { route: 'agent.video-queue.GET' });
    return NextResponse.json({ error: 'queue_unavailable' }, { status: 503 });
  }
}

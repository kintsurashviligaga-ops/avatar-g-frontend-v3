/**
 * POST /api/webhooks/higgsfield?job=<uuid>&sig=<hmac> — Higgsfield's completion callback (docs/how-to/webhooks).
 *
 * Contract we must keep: answer within 10 s; 2xx ONLY after the event is durably recorded (5xx → retried for
 * up to 2 h; 4xx → permanent, never retried); duplicates are expected → dedupe on request_id + status and
 * still answer 2xx; reject bodies that do not match the documented envelope.
 *
 * Authentication is the signed job id in OUR URL (lib/providers/higgsfield/webhookAuth) — Higgsfield signs
 * nothing. Fast by design: status changes and refunds are DB-only; copying outputs into storage happens on
 * the user's next status read or the sweep cron, never inside this 10-second window.
 *
 * NOT behind STUDIO_V2: a job started while the flag was on must still finish, or be refunded, after it is off.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyJobSignature } from '@/lib/providers/higgsfield/webhookAuth';
import { extractOutputUrls } from '@/lib/providers/higgsfield/client';
import { getStudioRuntime } from '@/lib/studio/runtime';
import { reportError } from '@/lib/observability/report-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Envelope = z.object({
  request_id: z.string().min(8).max(80).regex(/^[A-Za-z0-9-]+$/),
  status: z.enum(['queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled']),
  error: z.string().max(2000).nullable().optional(),
  payload: z.record(z.unknown()).nullable().optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 256 * 1024;

export async function POST(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('job') ?? '';
  const sig = req.nextUrl.searchParams.get('sig');
  if (!UUID_RE.test(jobId) || !verifyJobSignature(jobId, sig)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const text = await req.text().catch(() => '');
  if (!text || text.length > MAX_BODY) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  let parsed: z.infer<typeof Envelope>;
  try {
    const r = Envelope.safeParse(JSON.parse(text));
    if (!r.success) return NextResponse.json({ error: 'bad_envelope' }, { status: 400 });
    parsed = r.data;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const rt = getStudioRuntime();
  if (!rt) return NextResponse.json({ error: 'unavailable' }, { status: 503 }); // 5xx → Higgsfield retries

  try {
    // The (provider, request_id, status) row is the durable record and the duplicate detector.
    const first = await rt.store.recordEvent({
      provider: 'higgsfield',
      requestId: parsed.request_id,
      status: parsed.status,
      jobId,
      payload: { status: parsed.status, error: parsed.error ?? null, payload: parsed.payload ?? null },
    });
    // Applied EVEN on a duplicate. applyEvent is idempotent (compare-and-set, settled jobs are skipped), so a
    // repeat costs two reads — and a delivery whose first attempt died AFTER the dedupe row was written, but
    // before the job moved, is still applied on the retry instead of being acknowledged and lost.
    const r = await rt.saga.applyEvent({
      jobId,
      requestId: parsed.request_id,
      status: parsed.status,
      outputUrls: parsed.status === 'completed' ? extractOutputUrls({ payload: parsed.payload ?? {} }) : [],
      error: parsed.error ?? null,
    });
    return NextResponse.json({ received: true, duplicate: !first, applied: r.applied });
  } catch (e) {
    // 5xx so Higgsfield re-delivers (for up to two hours); the sweeper's status poll is the backstop after that.
    reportError(e, { route: '/api/webhooks/higgsfield', jobId, requestId: parsed.request_id, status: parsed.status });
    return NextResponse.json({ error: 'retry' }, { status: 500 });
  }
}

/**
 * POST /api/research/[id]/cancel — stop a research job; the credits go back (from the ledger, once).
 *
 *   200 { job }   cancelled and refunded — or ALREADY finished (idempotent: a second press changes nothing). If the provider
 *                 could not confirm the cancel right now, `job.cancelRequested` is true, the status is still `running`, and the
 *                 sweeper retries — the credits are returned only once the provider confirms (or the job is lost).
 *                 If the run FINISHED while the user pressed cancel they get the report they paid for, and no refund.
 *   404 not the caller's (or malformed) · 409 too_early (the job is mid-start) · 401 no session
 */
import { NextRequest } from 'next/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { reportError } from '@/lib/observability/report-error';
import { callerId, json } from '@/lib/research/http';
import { researchMessage } from '@/lib/research/messages';
import { toPublicJob } from '@/lib/research/public';
import { RESEARCH_CANCEL_USER } from '@/lib/research/rateLimits';
import { isJobId } from '@/lib/research/request';
import { getResearchRuntime } from '@/lib/research/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await callerId(req);
  if (!userId || mustSignInToGenerate(userId)) return json(signInToGenerateBody(), 401);
  const limited = await checkRateLimitByKey(userId, RESEARCH_CANCEL_USER);
  if (limited) return limited;

  const id = params?.id;
  if (!isJobId(id)) return json({ error: 'not_found', message: researchMessage('not_found') }, 404);
  const rt = getResearchRuntime();
  if (!rt) return json({ error: 'unavailable', message: researchMessage('unavailable') }, 503);

  try {
    const out = await rt.service.cancel(id, userId);
    if (out.ok) return json({ job: toPublicJob(out.job, { withReport: out.job.status === 'completed' }), serverNow: new Date().toISOString() });
    const status = out.code === 'not_found' ? 404 : out.code === 'too_early' ? 409 : 503;
    return json({ error: out.code, message: researchMessage(out.code) }, status);
  } catch (e) {
    reportError(e, { route: '/api/research/[id]/cancel' });
    return json({ error: 'unavailable', message: researchMessage('unavailable') }, 503);
  }
}

/**
 * GET /api/research/[id] → { job (with `report` + `sources` once completed), serverNow }
 *
 * One research job, for its OWNER only. A malformed id and someone else's job are both a plain 404 — an id is never confirmed
 * to exist for a person who does not own it. A RUNNING job is polled at the provider first (the read-through: claimed, so at
 * most one provider read per 8 s however many tabs watch; a 6 s wait), so a card that is open sees its report seconds after
 * Google finishes. The report is returned here and nowhere else — the list stays small.
 */
import { NextRequest } from 'next/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { reportError } from '@/lib/observability/report-error';
import { callerId, json } from '@/lib/research/http';
import { researchMessage } from '@/lib/research/messages';
import { toPublicJob } from '@/lib/research/public';
import { RESEARCH_READ_USER } from '@/lib/research/rateLimits';
import { isJobId } from '@/lib/research/request';
import { getResearchRuntime } from '@/lib/research/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await callerId(req);
  if (!userId || mustSignInToGenerate(userId)) return json(signInToGenerateBody(), 401);
  const limited = await checkRateLimitByKey(userId, RESEARCH_READ_USER);
  if (limited) return limited;

  const id = params?.id;
  if (!isJobId(id)) return json({ error: 'not_found', message: researchMessage('not_found') }, 404);
  const rt = getResearchRuntime();
  if (!rt) return json({ error: 'unavailable', message: researchMessage('unavailable') }, 503);

  try {
    const job = await rt.store.getForUser(id, userId);
    if (!job) return json({ error: 'not_found', message: researchMessage('not_found') }, 404);
    const fresh = job.status === 'running' ? await rt.service.refresh(job) : job;
    return json({ job: toPublicJob(fresh, { withReport: true }), serverNow: new Date().toISOString() });
  } catch (e) {
    reportError(e, { route: '/api/research/[id]', stage: 'get' });
    return json({ error: 'unavailable', message: researchMessage('unavailable') }, 503);
  }
}

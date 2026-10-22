import { NextRequest } from 'next/server';
import { apiError } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/agent-g/calls/transcribe — the telephony STT, retired. Its engines were OpenAI and Deepgram, so it was
 * refused while AI_GOOGLE_ONLY was on; the kill switch that re-opened it is gone (MASTER TASK v3.1, audit F-04). It
 * keeps its internal-token gate and refuses before the body is read, with no provider code behind it.
 */
export async function POST(request: NextRequest) {
  // Server-to-server (no user session): the internal worker token, fail closed when WORKER_INTERNAL_TOKEN is unset.
  const internalToken = request.headers.get('x-internal-worker-token');
  if (!process.env.WORKER_INTERNAL_TOKEN || internalToken !== process.env.WORKER_INTERNAL_TOKEN) {
    return apiError(new Error('unauthorized'), 401, 'Unauthorized');
  }
  return apiError(new Error('google_only'), 503, 'Speech-to-text runs on Google models only.');
}

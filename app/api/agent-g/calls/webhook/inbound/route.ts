import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getCallsProvider } from '@/lib/calls/providers';
import { secretMatches } from '@/lib/security/secretMatch';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // ⚠️ Unsigned and anonymous, and it echoed the posted body straight back. No provider posts here today (the Twilio
  // provider is a skeleton); like its /status sibling it now requires the internal worker token (unset = refused).
  if (!secretMatches(request.headers.get('x-internal-worker-token'), process.env.WORKER_INTERNAL_TOKEN)) {
    return apiError(new Error('unauthorized'), 401, 'Unauthorized');
  }
  try {
    const body = await request.json().catch(() => ({}));
    const provider = getCallsProvider();
    const result = await provider.onWebhookEvent(body as Record<string, unknown>);

    return apiSuccess({ ok: result.ok, provider: provider.name });
  } catch (error) {
    return apiError(error, 500, 'Inbound webhook failed');
  }
}

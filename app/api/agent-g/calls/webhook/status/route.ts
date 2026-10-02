import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getCallsProvider } from '@/lib/calls/providers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { secretMatches } from '@/lib/security/secretMatch';

export const dynamic = 'force-dynamic';

/** A provider call id as it may appear in a PostgREST filter: plain id characters only. */
const SAFE_CALL_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(request: NextRequest) {
  // ⚠️ THIS WAS AN ANONYMOUS, UNSIGNED WEBHOOK THAT WROTE THROUGH THE SERVICE ROLE — and the call id from the body was
  // interpolated straight into a PostgREST `.or()` filter, so a crafted id (`x,id.neq.0`) could rewrite the status of
  // EVERY call row. No provider is wired to post here (the Twilio provider is a skeleton), so the route now requires
  // the internal worker token (fail closed: unset = refused) and accepts only a plain id.
  if (!secretMatches(request.headers.get('x-internal-worker-token'), process.env.WORKER_INTERNAL_TOKEN)) {
    return apiError(new Error('unauthorized'), 401, 'Unauthorized');
  }
  try {
    const body = await request.json().catch(() => ({}));
    const provider = getCallsProvider();
    const result = await provider.onWebhookEvent(body as Record<string, unknown>);

    if (result.callId && !SAFE_CALL_ID.test(result.callId)) {
      return apiError(new Error('invalid call id'), 400, 'Invalid call id');
    }
    if (result.callId) {
      const supabase = createServiceRoleClient();
      await supabase
        .from('agent_g_calls')
        .update({
          status: result.status || 'active',
          ended_at: (result.status === 'ended' || result.status === 'failed') ? new Date().toISOString() : null,
          meta: {
            webhook_status: result.status || 'active',
            provider: provider.name,
          },
        })
        .or(`id.eq.${result.callId},meta->>provider_call_id.eq.${result.callId}`);
    }

    return apiSuccess({ ok: true, provider: provider.name, updated: Boolean(result.callId) });
  } catch (error) {
    return apiError(error, 500, 'Status webhook failed');
  }
}

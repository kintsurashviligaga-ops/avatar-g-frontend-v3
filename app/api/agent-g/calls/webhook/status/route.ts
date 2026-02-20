import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getCallsProvider } from '@/lib/calls/providers';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = getCallsProvider();
    const result = await provider.onWebhookEvent(body as Record<string, unknown>);

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

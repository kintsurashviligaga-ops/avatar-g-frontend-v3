import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCallsProvider } from '@/lib/calls/providers';
import { inferAssistantMode } from '@/lib/agent-g/voice/mode-router';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userId: z.string().optional(),
  channel: z.enum(['phone', 'telegram', 'web_voice']),
  mode: z.enum(['task_intake', 'qa', 'status_update']),
  initial_text: z.string().optional(),
  related_task_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid call start payload');

    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const supabase = createServiceRoleClient();

    const prefsRes = await supabase
      .from('agent_g_user_prefs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const prefs = prefsRes.data || null;
    const assistantMode = inferAssistantMode(payload.data.initial_text || '', payload.data.mode === 'task_intake');
    const provider = getCallsProvider();
    const providerCall = await provider.startInboundSession({
      userId: user.id,
      channel: payload.data.channel,
      mode: payload.data.mode,
      phoneNumber: (prefs?.phone_number as string | null) || null,
      relatedTaskId: payload.data.related_task_id ?? null,
      initialText: payload.data.initial_text,
    });

    const insertRes = await supabase
      .from('agent_g_calls')
      .insert({
        user_id: user.id,
        direction: 'inbound',
        channel: payload.data.channel,
        status: providerCall.status,
        started_at: new Date().toISOString(),
        transcript: providerCall.transcript || payload.data.initial_text || null,
        summary: providerCall.summary || null,
        related_task_id: payload.data.related_task_id ?? null,
        meta: {
          provider: provider.name,
          provider_call_id: providerCall.providerCallId,
          assistant_mode: assistantMode,
          mode: payload.data.mode,
          ...providerCall.meta,
        },
      })
      .select('*')
      .single();

    if (insertRes.error || !insertRes.data) {
      return apiError(insertRes.error ?? new Error('Call insert failed'), 500, 'Failed to store call');
    }

    return apiSuccess({ call: insertRes.data, provider: provider.name, assistant_mode: assistantMode }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to start call');
  }
}

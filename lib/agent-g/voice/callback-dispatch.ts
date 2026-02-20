import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCallsProvider } from '@/lib/calls/providers';
import { isInQuietHours } from '@/lib/agent-g/voice/quiet-hours';
import { buildCallbackScript } from '@/lib/agent-g/voice/callback-script';

type DispatchInput = {
  userId: string;
  taskId: string;
  taskGoal: string;
  summary: string;
  subtasks?: Array<{ agent?: string; action?: string; status?: string }>;
  dashboardUrl: string;
  force?: boolean;
};

export async function queueAgentGCallback(input: DispatchInput): Promise<{ queued: boolean; reason?: string; callId?: string; provider?: string }> {
  const supabase = createServiceRoleClient();

  const prefsRes = await supabase
    .from('agent_g_user_prefs')
    .select('*')
    .eq('user_id', input.userId)
    .maybeSingle();

  const prefs = prefsRes.data;

  if (!prefs?.phone_number) {
    return { queued: false, reason: 'No phone number configured' };
  }

  if (!input.force && !prefs.call_me_when_finished) {
    return { queued: false, reason: 'Callback disabled' };
  }

  if (!input.force && isInQuietHours({
    enabled: Boolean(prefs.quiet_hours_enabled),
    start: prefs.quiet_hours_start || '22:00',
    end: prefs.quiet_hours_end || '08:00',
    timezoneOffsetMinutes: Number(prefs.timezone_offset_minutes || 0),
  })) {
    return { queued: false, reason: 'Within quiet hours' };
  }

  const provider = getCallsProvider();
  const script = buildCallbackScript({
    id: input.taskId,
    goal: input.taskGoal,
    results: {
      summary: input.summary,
      subtasks: input.subtasks || [],
    },
  }, input.dashboardUrl);

  const call = await provider.startOutboundCall(prefs.phone_number, script, {
    task_id: input.taskId,
    callback: true,
  });

  const insertRes = await supabase
    .from('agent_g_calls')
    .insert({
      user_id: input.userId,
      direction: 'outbound',
      channel: 'phone',
      status: call.status,
      started_at: new Date().toISOString(),
      summary: input.summary,
      transcript: script,
      related_task_id: input.taskId,
      meta: {
        provider: provider.name,
        provider_call_id: call.providerCallId,
        callback: true,
        ...call.meta,
      },
    })
    .select('id')
    .single();

  if (insertRes.error || !insertRes.data) {
    return { queued: false, reason: 'Failed to save callback call' };
  }

  return { queued: true, callId: insertRes.data.id, provider: provider.name };
}
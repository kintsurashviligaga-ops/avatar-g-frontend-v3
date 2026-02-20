import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildTaskPlan, makeTaskId } from '@/lib/agent-g/orchestrator/planner';
import { executePlan } from '@/lib/agent-g/orchestrator/executor';
import { aggregateResults } from '@/lib/agent-g/orchestrator/aggregator';
import { inferAssistantMode } from '@/lib/agent-g/voice/mode-router';

export type InboundChannel = 'telegram' | 'whatsapp' | 'web';

export type HandleInboundInput = {
  channel: InboundChannel;
  externalId: string;
  text: string;
  voiceUrl?: string;
  userHint?: string;
  origin?: string;
};

export type HandleInboundOutput = {
  replyMessages: string[];
  taskId?: string;
  outputLinks?: { dashboard: string; pdf?: string; zip?: string };
  userId?: string;
  assistantMode?: 'platform' | 'general';
};

export async function handleInbound(input: HandleInboundInput): Promise<HandleInboundOutput> {
  const supabase = createServiceRoleClient();

  try {
    let resolvedUserId = input.userHint || '';
    let resolvedLocale: 'en' | 'ka' | 'ru' = 'en';

    if (!resolvedUserId && input.externalId) {
      const channelRes = await supabase
        .from('agent_g_channels')
        .select('user_id, meta')
        .eq('type', input.channel)
        .eq('external_id', input.externalId)
        .eq('status', 'connected')
        .maybeSingle();

      if (channelRes.data?.user_id) {
        resolvedUserId = String(channelRes.data.user_id);
        const localeCandidate = String(channelRes.data?.meta?.locale || '').toLowerCase();
        if (localeCandidate === 'en' || localeCandidate === 'ka' || localeCandidate === 'ru') {
          resolvedLocale = localeCandidate;
        }
      }
    }

    if (!resolvedUserId) {
      return {
        replyMessages: [
          'Please connect your account first with /connect CODE from Agent G settings.',
        ],
      };
    }

    const goal = input.text.trim();
    if (!goal) {
      return { replyMessages: ['Please send a task description.'] };
    }

    const plan = buildTaskPlan(goal);
    const taskId = makeTaskId();

    await supabase.from('agent_g_tasks').insert({
      id: taskId,
      user_id: resolvedUserId,
      goal,
      status: 'processing',
      plan,
      results: null,
    });

    await supabase.from('agent_g_subtasks').insert(
      plan.sub_tasks.map((item) => ({
        task_id: taskId,
        agent_name: item.agent,
        status: 'queued',
        input: item.input,
        output: null,
      }))
    );

    const origin = input.origin || process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const executed = await executePlan(plan, {
      origin,
      internalSecret: process.env.AGENT_G_INTERNAL_SECRET,
    });

    const aggregated = aggregateResults(goal, executed.subtasks);

    await supabase
      .from('agent_g_tasks')
      .update({
        status: executed.status,
        results: aggregated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .eq('user_id', resolvedUserId);

    await supabase.from('agent_g_subtasks').delete().eq('task_id', taskId);
    await supabase.from('agent_g_subtasks').insert(
      executed.subtasks.map((item) => ({
        task_id: taskId,
        agent_name: item.agent,
        status: item.status,
        input: item.input,
        output: item.output ?? { error: item.error ?? null },
      }))
    );

    if (input.channel === 'telegram' && input.voiceUrl) {
      await supabase.from('agent_g_calls').insert({
        user_id: resolvedUserId,
        direction: 'inbound',
        channel: 'telegram',
        status: 'ended',
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        transcript: goal,
        summary: aggregated.summary,
        related_task_id: taskId,
        meta: {
          source: 'telegram-voice',
          voice_url: input.voiceUrl,
          assistant_mode: inferAssistantMode(goal),
        },
      });
    }

    const dashboard = `${origin}/${resolvedLocale}/services/agent-g/dashboard?task=${encodeURIComponent(taskId)}`;
    const pdf = `${origin}/api/agent-g/output?task_id=${encodeURIComponent(taskId)}&format=pdf`;
    const zip = `${origin}/api/agent-g/output?task_id=${encodeURIComponent(taskId)}&format=zip`;

    return {
      userId: resolvedUserId,
      taskId,
      assistantMode: inferAssistantMode(goal),
      outputLinks: { dashboard, pdf, zip },
      replyMessages: [
        `Done. ${aggregated.summary.split('\n')[0]}`,
        `Dashboard: ${dashboard}`,
        `PDF: ${pdf}`,
        `ZIP: ${zip}`,
      ],
    };
  } catch {
    return {
      replyMessages: [
        'Agent G could not process that request right now. Please retry in a moment.',
      ],
    };
  }
}

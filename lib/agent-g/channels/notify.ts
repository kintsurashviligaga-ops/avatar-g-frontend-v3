import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendTelegramMessage } from '@/lib/agent-g/channels/telegram-client';

type NotifyInput = {
  userId: string;
  taskId: string;
  summary: string;
  origin: string;
};

export async function notifyTelegramTaskCompletion(input: NotifyInput): Promise<void> {
  const supabase = createServiceRoleClient();

  const channelRes = await supabase
    .from('agent_g_channels')
    .select('external_id, status, meta')
    .eq('user_id', input.userId)
    .eq('type', 'telegram')
    .eq('status', 'connected')
    .not('external_id', 'is', null)
    .maybeSingle();

  const chatId = channelRes.data?.external_id ? String(channelRes.data.external_id) : '';
  if (!chatId) return;
  const localeCandidate = String(channelRes.data?.meta?.locale || '').toLowerCase();
  const locale = localeCandidate === 'en' || localeCandidate === 'ka' || localeCandidate === 'ru' ? localeCandidate : 'en';

  const dashboard = `${input.origin}/${locale}/services/agent-g/dashboard?task=${encodeURIComponent(input.taskId)}`;
  const pdf = `${input.origin}/api/agent-g/output?task_id=${encodeURIComponent(input.taskId)}&format=pdf`;
  const zip = `${input.origin}/api/agent-g/output?task_id=${encodeURIComponent(input.taskId)}&format=zip`;

  const text = [
    'Agent G task completed ✅',
    input.summary,
    `Dashboard: ${dashboard}`,
    `PDF: ${pdf}`,
    `ZIP: ${zip}`,
    'Next step: review outputs and request refinement if needed.',
  ].join('\n');

  await sendTelegramMessage({ chatId, text });
}

import type { AgentGChannelStatus } from '@/lib/agent-g/types';

export function getTelegramChannelStatus(): AgentGChannelStatus {
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const hasWebhook = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);

  return {
    type: 'telegram',
    connected: hasToken,
    ready: hasToken && hasWebhook,
    note: hasToken
      ? hasWebhook
        ? 'Webhook ready'
        : 'Token set, missing TELEGRAM_WEBHOOK_SECRET'
      : 'Not connected',
  };
}

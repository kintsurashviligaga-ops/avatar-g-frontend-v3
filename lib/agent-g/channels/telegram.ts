import type { AgentGChannelStatus } from '@/lib/agent-g/types';

export function getTelegramChannelStatus(): AgentGChannelStatus {
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const hasWebhook = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);
  const hasAppUrl = Boolean(process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL);

  return {
    type: 'telegram',
    connected: hasToken,
    ready: hasToken && hasWebhook && hasAppUrl,
    note: hasToken
      ? hasWebhook
        ? hasAppUrl
          ? 'Webhook ready'
          : 'Missing PUBLIC_APP_URL'
        : 'Token set, missing TELEGRAM_WEBHOOK_SECRET'
      : 'Not connected',
  };
}

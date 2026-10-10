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

/**
 * Is the Telegram account binding built? NO (2026-10-10): /connect-code mints a code but the bot never consumes it, so
 * no Telegram chat can be tied to an account and Settings must not offer „Connect" (Omnichannel inventory, PART F).
 * PART F builds the one-time deep-link binding and flips this with its tests.
 */
export const TELEGRAM_BINDING_LIVE = false;

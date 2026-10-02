import type { AgentGChannelStatus } from '@/lib/agent-g/types';
import { whatsappConfig } from '@/lib/agent-g/channels/whatsapp-client';

export function getWhatsappChannelStatus(): AgentGChannelStatus {
  // The same credential reading the sender uses (WHATSAPP_ACCESS_TOKEN or an accepted alias + the phone number id),
  // so this status can never say "connected" for a token the sender would not find — or the reverse.
  const sending = Boolean(whatsappConfig());
  const hasVerify = Boolean((process.env.WHATSAPP_VERIFY_TOKEN ?? '').trim());
  const hasAppSecret = Boolean((process.env.WHATSAPP_APP_SECRET ?? '').trim());
  const hasToken = Boolean(
    (process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN ||
      process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_CLOUD_API_TOKEN || '').trim(),
  );

  return {
    type: 'whatsapp',
    connected: sending,
    ready: sending && hasVerify && hasAppSecret,
    note: sending
      ? hasVerify
        ? hasAppSecret
          ? 'Webhook ready'
          : 'Connected, missing WHATSAPP_APP_SECRET'
        : 'Connected, missing WHATSAPP_VERIFY_TOKEN'
      : hasToken
        ? 'Token set, missing WHATSAPP_PHONE_NUMBER_ID'
        : 'Not connected',
  };
}

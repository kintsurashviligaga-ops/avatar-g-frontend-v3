import type { AgentGChannelStatus } from '@/lib/agent-g/types';

export function getWhatsappChannelStatus(): AgentGChannelStatus {
  const hasToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const hasPhoneId = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasVerify = Boolean(process.env.WHATSAPP_VERIFY_TOKEN);
  const hasAppSecret = Boolean(process.env.WHATSAPP_APP_SECRET);

  return {
    type: 'whatsapp',
    connected: hasToken && hasPhoneId,
    ready: hasToken && hasPhoneId && hasVerify && hasAppSecret,
    note: hasToken && hasPhoneId
      ? hasVerify
        ? hasAppSecret
          ? 'Webhook ready'
          : 'Connected, missing WHATSAPP_APP_SECRET'
        : 'Connected, missing WHATSAPP_VERIFY_TOKEN'
      : 'Not connected',
  };
}

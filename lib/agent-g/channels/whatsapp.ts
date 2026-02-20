import type { AgentGChannelStatus } from '@/lib/agent-g/types';

export function getWhatsappChannelStatus(): AgentGChannelStatus {
  const hasToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const hasPhoneId = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasVerify = Boolean(process.env.WHATSAPP_VERIFY_TOKEN);

  return {
    type: 'whatsapp',
    connected: hasToken && hasPhoneId,
    ready: hasToken && hasPhoneId && hasVerify,
    note: hasToken && hasPhoneId
      ? hasVerify
        ? 'Webhook ready'
        : 'Connected, missing WHATSAPP_VERIFY_TOKEN'
      : 'Not connected',
  };
}

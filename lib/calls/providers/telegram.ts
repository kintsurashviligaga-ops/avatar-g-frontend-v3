import type { CallsProvider, ProviderCallResult, StartSessionInput } from '@/lib/calls/providers/base';

export class TelegramCallsProvider implements CallsProvider {
  name = 'telegram';

  async startInboundSession(input: StartSessionInput): Promise<ProviderCallResult> {
    return {
      providerCallId: `telegram_in_${Date.now()}`,
      status: 'queued',
      summary: 'Telegram voice session skeleton (bot call handling to be wired).',
      meta: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN), channel: input.channel },
    };
  }

  async startOutboundCall(phoneNumber: string, textToSpeak: string): Promise<ProviderCallResult> {
    return {
      providerCallId: `telegram_out_${Date.now()}`,
      status: 'queued',
      summary: 'Telegram outbound voice skeleton',
      transcript: textToSpeak,
      meta: { destination: phoneNumber },
    };
  }

  async onWebhookEvent(event: Record<string, unknown>) {
    return {
      ok: true,
      callId: String(event.call_id || ''),
      status: 'active' as const,
      meta: { provider: 'telegram', skeleton: true },
    };
  }

  async endCall() {
    return { ok: true };
  }
}

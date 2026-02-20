import type { CallsProvider, ProviderCallResult, StartSessionInput } from '@/lib/calls/providers/base';

export class TwilioCallsProvider implements CallsProvider {
  name = 'twilio';

  async startInboundSession(input: StartSessionInput): Promise<ProviderCallResult> {
    return {
      providerCallId: `twilio_in_${Date.now()}`,
      status: 'queued',
      summary: 'Twilio inbound skeleton (configure webhook + voice app).',
      meta: { configured: Boolean(process.env.TWILIO_ACCOUNT_SID), channel: input.channel },
    };
  }

  async startOutboundCall(phoneNumber: string, textToSpeak: string): Promise<ProviderCallResult> {
    return {
      providerCallId: `twilio_out_${Date.now()}`,
      status: 'queued',
      summary: 'Twilio outbound skeleton prepared',
      transcript: textToSpeak,
      meta: { to: phoneNumber, configured: Boolean(process.env.TWILIO_AUTH_TOKEN) },
    };
  }

  async onWebhookEvent(event: Record<string, unknown>) {
    return {
      ok: true,
      callId: String(event.CallSid || event.call_id || ''),
      status: 'active' as const,
      meta: { provider: 'twilio', skeleton: true },
    };
  }

  async endCall() {
    return { ok: true };
  }
}

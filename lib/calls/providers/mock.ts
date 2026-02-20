import crypto from 'node:crypto';
import type { CallsProvider, ProviderCallResult, StartSessionInput } from '@/lib/calls/providers/base';

const calls = new Map<string, ProviderCallResult>();

export class MockCallsProvider implements CallsProvider {
  name = 'mock';

  async startInboundSession(input: StartSessionInput): Promise<ProviderCallResult> {
    const providerCallId = `mock_in_${crypto.randomUUID()}`;
    const payload: ProviderCallResult = {
      providerCallId,
      status: 'active',
      transcript: input.initialText || '',
      summary: `Mock inbound ${input.mode} session started`,
      meta: { channel: input.channel, mode: input.mode },
    };
    calls.set(providerCallId, payload);
    return payload;
  }

  async startOutboundCall(phoneNumber: string, textToSpeak: string, meta?: Record<string, unknown>): Promise<ProviderCallResult> {
    const providerCallId = `mock_out_${crypto.randomUUID()}`;
    const payload: ProviderCallResult = {
      providerCallId,
      status: 'ended',
      summary: `Mock outbound call to ${phoneNumber}`,
      transcript: textToSpeak,
      meta: { ...meta, delivered: true },
    };
    calls.set(providerCallId, payload);
    return payload;
  }

  async onWebhookEvent(event: Record<string, unknown>) {
    const callId = String(event.call_id || event.providerCallId || '');
    if (!callId) return { ok: false };
    const existing = calls.get(callId);
    if (!existing) return { ok: false };

    const status = (event.status as ProviderCallResult['status']) || existing.status;
    const updated = { ...existing, status };
    calls.set(callId, updated);
    return { ok: true, callId, status, meta: { source: 'mock-webhook' } };
  }

  async endCall(callId: string) {
    const existing = calls.get(callId);
    if (!existing) return { ok: false };
    calls.set(callId, { ...existing, status: 'ended' });
    return { ok: true };
  }
}

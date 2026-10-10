import { PHONE_CALLS_UNAVAILABLE } from '@/lib/calls/availability';
import type { CallsProvider, ProviderCallResult } from '@/lib/calls/providers/base';

/**
 * The only provider selected today: no call adapter exists, so it starts nothing and acknowledges no webhook.
 * A start throws instead of answering a status, so a caller can never store a call nobody placed.
 */
export class UnavailableCallsProvider implements CallsProvider {
  name = 'none';

  async startInboundSession(): Promise<ProviderCallResult> {
    throw new Error(PHONE_CALLS_UNAVAILABLE);
  }

  async startOutboundCall(): Promise<ProviderCallResult> {
    throw new Error(PHONE_CALLS_UNAVAILABLE);
  }

  async onWebhookEvent() {
    return { ok: false };
  }

  async endCall() {
    return { ok: false };
  }
}

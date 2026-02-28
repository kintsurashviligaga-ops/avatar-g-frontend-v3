/**
 * Telephony Provider Abstraction
 * ---------------------------------
 * Production: swap MockTelephonyProvider for a real Twilio / Vonage adapter.
 * The interface stays the same so nothing upstream changes.
 */

import { structuredLog } from '@/lib/logger';
import type {
  IncomingCallPayload,
  OutboundCallRequest,
  OutboundCallResult,
} from '@/types/billing';

/* ── Interface ─────────────────────────────────────────────────────────── */

export interface TelephonyProvider {
  /** Handle an incoming call webhook and return TwiML / response XML. */
  handleIncoming(payload: IncomingCallPayload): Promise<string>;
  /** Initiate an outbound call and return the call SID / result. */
  placeOutbound(req: OutboundCallRequest): Promise<OutboundCallResult>;
}

/* ── Mock Implementation ───────────────────────────────────────────────── */

class MockTelephonyProvider implements TelephonyProvider {
  async handleIncoming(payload: IncomingCallPayload): Promise<string> {
    structuredLog('info', 'telephony.incoming.mock', {
      from: payload.from,
      to: payload.to,
    });

    // Return minimal TwiML that announces the service is in setup mode
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ka-GE">myavatar.ge სერვისი მალე ამოქმედდება</Say>
  <Hangup/>
</Response>`;
  }

  async placeOutbound(req: OutboundCallRequest): Promise<OutboundCallResult> {
    structuredLog('info', 'telephony.outbound.mock', {
      to: req.to,
      userId: req.userId,
    });

    return {
      callSid: `mock_${crypto.randomUUID()}`,
      status: 'queued',
    };
  }
}

/* ── Singleton ─────────────────────────────────────────────────────────── */

let _provider: TelephonyProvider | null = null;

export function getTelephonyProvider(): TelephonyProvider {
  if (!_provider) {
    // TODO(prod): Replace with real Twilio/Vonage adapter when ready
    _provider = new MockTelephonyProvider();
  }
  return _provider;
}

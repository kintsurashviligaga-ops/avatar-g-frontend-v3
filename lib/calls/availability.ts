/**
 * One honest gate for PSTN calls. It turns true only after the DIDWW adapter, signed bridge and a real Georgian test
 * call are configured. A key by itself never makes a phone call path ready.
 */
import { phoneCallsReady as configuredPhoneCallsReady } from '@/lib/phone/connection';

export function phoneCallsReady(): boolean {
  return configuredPhoneCallsReady();
}

export const PHONE_CALLS_UNAVAILABLE = 'phone_calls_unavailable' as const;

export function phoneCallsUnavailableBody(): { error: typeof PHONE_CALLS_UNAVAILABLE; message: string } {
  return {
    error: PHONE_CALLS_UNAVAILABLE,
    message: 'Phone calls are not available yet. No call was placed and nothing was charged.',
  };
}

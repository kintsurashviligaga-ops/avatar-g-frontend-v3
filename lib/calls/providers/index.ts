import { UnavailableCallsProvider } from '@/lib/calls/providers/unavailable';
import type { CallsProvider } from '@/lib/calls/providers/base';

/**
 * No adapter places a real call yet (lib/calls/availability.ts), so every caller gets the unavailable provider.
 *
 * ⚠️ This used to pick Twilio or Telegram whenever their keys existed, and the in-memory mock otherwise. All three
 * answered `queued` / `active` (the mock even `ended` with `delivered: true`) without calling anyone, and the routes
 * stored those as real calls. The Twilio and Telegram classes stay in this folder for the later GSM and Telegram work;
 * a real adapter replaces them here only together with phoneCallsReady() and a recorded real call test.
 */
export function getCallsProvider(): CallsProvider {
  return new UnavailableCallsProvider();
}

/**
 * lib/calls/availability.ts — can Agent G ring a phone or answer one for this deployment? NO (2026-10-10).
 *
 * No provider places or receives a real call yet: the Twilio and Telegram "providers" in ./providers are skeletons that
 * used to answer `queued` / `active` without calling anyone, and the owner chose WhatsApp Business Calling + the existing
 * Gemini Live as the voice path (docs/handoffs/omnichannel/PHONE_PROVIDER_FEASIBILITY.md), which waits on Meta's answer
 * and the owner's steps. Settings → Connections reads this and says „Temporarily unavailable". It turns true only with a
 * real provider adapter AND a recorded real call test; never because a key exists.
 *
 * While it is false every phone-call start (/api/agent-g/calls/start, the task call-back, /api/voice/outbound,
 * /api/voice/outgoing, /api/voice/notify, Vapi's inbound assistant request) answers PHONE_CALLS_UNAVAILABLE and stores
 * no call row: none of them may report a call that nobody placed. WhatsApp Calling has its own switch
 * (lib/calls/whatsapp, WHATSAPP_CALLING_ENABLED).
 */
export function phoneCallsReady(): boolean {
  return false;
}

export const PHONE_CALLS_UNAVAILABLE = 'phone_calls_unavailable' as const;

/** The body a phone-call start answers (with 503) while phoneCallsReady() is false. */
export function phoneCallsUnavailableBody(): { error: typeof PHONE_CALLS_UNAVAILABLE; message: string } {
  return {
    error: PHONE_CALLS_UNAVAILABLE,
    message: 'Phone calls are not available yet. No call was placed and nothing was charged.',
  };
}

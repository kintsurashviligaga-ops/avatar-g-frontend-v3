/**
 * lib/calls/availability.ts — can Agent G ring a phone or answer one for this deployment? NO (2026-10-10).
 *
 * No provider places or receives a real call yet: the Twilio and Telegram "providers" in ./providers are skeletons that
 * used to answer `queued` / `active` without calling anyone, and the owner chose WhatsApp Business Calling + the existing
 * Gemini Live as the voice path (docs/handoffs/omnichannel/PHONE_PROVIDER_FEASIBILITY.md), which waits on Meta's answer
 * and the owner's steps. Settings → Connections reads this and says „Temporarily unavailable". It turns true only with a
 * real provider adapter AND a recorded real call test; never because a key exists.
 */
export function phoneCallsReady(): boolean {
  return false;
}

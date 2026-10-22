/**
 * lib/ai/google/policy.ts — the Google-only switch for chat, voice, Live and agents.
 *
 * Its own tiny module on purpose (the sibling of lib/veo/policy.ts): every chat/voice/agent route asks this one
 * yes/no question, and none of them should pull a provider client stack in to ask it. Dependency-free, so it is safe
 * on the server AND the client.
 *
 * Always ON (MASTER TASK v3.1, audit F-04): a Gemini miss is a Gemini failure — surfaced honestly as a
 * typed error — never a silent Anthropic / DeepSeek / Atlas answer. AI_GOOGLE_ONLY is no longer read; no env value
 * restores the old multi-vendor fallbacks.
 *
 * ⚠️ Always ON means an unfunded Google project takes chat, voice and Live DOWN (every call answers 402 — see the
 * 2026-09-29 prepay-depleted incident) instead of quietly answering from Haiku. That is the intended trade: a
 * visible outage is diagnosable, a silent vendor swap hid a dead key for days.
 */
/** Always true: chat, voice, Live and agents run on Google only. Kept as a function so its callers read the same. */
export function isAiGoogleOnly(): boolean {
  return true;
}

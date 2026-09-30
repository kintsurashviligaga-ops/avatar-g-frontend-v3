/**
 * lib/ai/google/policy.ts — the Google-only switch for chat, voice, Live and agents.
 *
 * Its own tiny module on purpose (the sibling of lib/veo/policy.ts, which governs VIDEO_GOOGLE_ONLY and is left
 * alone): every chat/voice/agent route asks this one yes/no question, and none of them should pull a provider
 * client stack in to ask it. Dependency-free apart from lib/env/flag, so it is safe on the server AND the client
 * (in a client bundle a non-NEXT_PUBLIC env is undefined → the default below).
 *
 * ON by default (AI_GOOGLE_ONLY unset): a Gemini miss is a Gemini failure — surfaced honestly as a typed error —
 * never a silent Anthropic / DeepSeek / Atlas answer. `AI_GOOGLE_ONLY=0` (or false/no/off) restores the old
 * multi-vendor fallbacks: the kill switch for when the Google project cannot serve.
 *
 * ⚠️ Default ON means an unfunded Google project takes chat, voice and Live DOWN (every call answers 402 — see the
 * 2026-09-29 prepay-depleted incident) instead of quietly answering from Haiku. That is the intended trade: a
 * visible outage is diagnosable, a silent vendor swap hid a dead key for days. Flip the kill switch, don't patch
 * the callers.
 */
import { isEnabledByDefault } from '@/lib/env/flag';

/** True unless AI_GOOGLE_ONLY is explicitly set falsy ('0' | 'false' | 'no' | 'off', case-insensitive). */
export function isAiGoogleOnly(): boolean {
  return isEnabledByDefault(process.env.AI_GOOGLE_ONLY);
}

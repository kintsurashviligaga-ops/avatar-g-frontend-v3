/**
 * What ElevenLabs' GET /v1/user says about the account behind ELEVENLABS_API_KEY — read by every voice health probe.
 *
 * A valid key is not a working voice. Every Georgian line in the product (a film's off-camera voice, the talking
 * avatar's line) is read in one of the cloned native-Georgian voices (lib/audio/georgian-voice, ElevenLabs Instant Voice
 * Cloning). On 2026-10-17 09:31Z the one approved paid avatar test was refused by ElevenLabs with
 * `401 subscription_required / ivc_not_permitted` while every health probe said "voice ok": they only asked whether the
 * key opened /v1/user. The account's plan has to allow cloned voices, and it has to have characters left.
 *
 * Pure: reads a parsed body, never a key. Unknown fields stay unknown (null) and never fail a probe on their own.
 */
export interface ElevenLabsAccount {
  /** The plan, as ElevenLabs names it ('free', 'starter', 'creator', …), when it said. */
  tier: string | null;
  /** Characters left this period, when both numbers came back. */
  charactersLeft: number | null;
  /** Whether the plan lets the account use Instant Voice Cloning voices, when it said. */
  cloning: boolean | null;
}

export type ElevenLabsVoiceState = 'ok' | 'no_cloning' | 'no_characters';

export function readElevenLabsAccount(body: unknown): ElevenLabsAccount {
  const sub = body && typeof body === 'object' ? (body as { subscription?: unknown }).subscription : undefined;
  const s = sub && typeof sub === 'object' ? (sub as Record<string, unknown>) : {};
  const tier = typeof s.tier === 'string' && /^[a-z0-9_ -]{1,40}$/i.test(s.tier) ? s.tier : null;
  const count = typeof s.character_count === 'number' ? s.character_count : null;
  const limit = typeof s.character_limit === 'number' ? s.character_limit : null;
  const cloning = typeof s.can_use_instant_voice_cloning === 'boolean' ? s.can_use_instant_voice_cloning : null;
  return { tier, charactersLeft: count !== null && limit !== null ? limit - count : null, cloning };
}

/** Can the product's Georgian voices speak on this account? Only an explicit "no" from ElevenLabs fails it. */
export function elevenLabsVoiceState(a: ElevenLabsAccount): ElevenLabsVoiceState {
  if (a.cloning === false) return 'no_cloning';
  if (a.charactersLeft !== null && a.charactersLeft <= 0) return 'no_characters';
  return 'ok';
}

/** One line for an operator's report: the plan, cloning, characters. Never a key. */
export function describeElevenLabsAccount(a: ElevenLabsAccount): string {
  const state = elevenLabsVoiceState(a);
  const parts = [
    `plan ${a.tier ?? 'unknown'}`,
    a.cloning === null ? 'cloned voices: unknown' : a.cloning ? 'cloned voices: allowed' : 'cloned voices: NOT allowed by the plan (every Georgian voice is a clone)',
    a.charactersLeft === null ? 'characters left: unknown' : `${a.charactersLeft} characters left`,
  ];
  return state === 'ok' ? parts.join(' · ') : `${state} · ${parts.join(' · ')}`;
}

/**
 * Is an ElevenLabs refusal one a retry cannot fix? Any 4xx but a timeout (408) or a rate limit (429): a plan without
 * cloning, an exhausted quota, a wrong key, a voice the account does not have. The user is then told the voice is off,
 * not to "try again in a minute".
 */
export function isLastingVoiceRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

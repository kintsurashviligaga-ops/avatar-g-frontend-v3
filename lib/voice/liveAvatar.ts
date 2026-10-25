/**
 * lib/voice/liveAvatar.ts — the talking avatar of a Live call (Vertex Gemini 3.8 Live, Google's prebuilt avatars).
 * Shared by the mint route (which builds the avatar setup) and the call screen (toggle, cap, player).
 *
 * VERIFIED 2026-10-25 by probe (Vertex, avatar Kira): gemini-3.8-live is served in us-central1 only (the relay routes it
 * there with LIVE_RELAY_MODEL_LOCATIONS); `avatarConfig` sits at the top of `setup`; Kira, Ben and Leo open (Aria, Mia →
 * 1007 "Unsupported avatar name"). The answer is fragmented MP4 with the avatar's own voice inside (lib/voice/fmp4).
 * COST: about 6.2k video tokens per second of speech at $1 per million (≈ $0.37 per minute while the avatar speaks, per
 * Google's price list as reported by third parties; unverified against a bill), on top of the call's audio. So an avatar
 * session is capped at LIVE_AVATAR_MAX_MS: the call then goes on as a voice call.
 * A custom avatar from the user's own face is allowlist-only at Google (a project without it gets 1007 "Current project is
 * not allowlisted for customized avatar feature", as reported on Google's developer forum), so only the prebuilt ones are
 * offered.
 */

export const LIVE_AVATAR_MODEL = 'gemini-3.8-live';

export type LiveAvatarName = 'Kira' | 'Ben' | 'Leo';

export const LIVE_AVATARS: ReadonlyArray<{ name: LiveAvatarName; gender: 'female' | 'male' }> = [
  { name: 'Kira', gender: 'female' },
  { name: 'Ben', gender: 'male' },
  { name: 'Leo', gender: 'male' },
];

/** 1.5 Mbit/s measured ~1.7 Mbit/s at 704×1280, 24 fps: sharp on a phone, fine on 4G. */
export const LIVE_AVATAR_BITRATE_BPS = 1_500_000;

/** One avatar session at most this long (cost); the call goes on by voice. */
export const LIVE_AVATAR_MAX_MS = 5 * 60_000;

/** The avatar ticket outlives the cap a little, so the screen's own cap ends the avatar before the relay does. */
export const LIVE_AVATAR_TICKET_MS = LIVE_AVATAR_MAX_MS + 60_000;

/** An allowlisted avatar name (case-insensitive), else null. */
export function normalizeLiveAvatar(raw: unknown): LiveAvatarName | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  return LIVE_AVATARS.find((a) => a.name.toLowerCase() === t)?.name ?? null;
}

/** The avatar that matches the call's voice: Kira for a female voice, Ben for a male one. */
export function defaultLiveAvatar(gender: 'female' | 'male' | null | undefined): LiveAvatarName {
  return gender === 'male' ? 'Ben' : 'Kira';
}

/**
 * NEXT_PUBLIC_LIVE_AVATAR: the one switch for the toggle on the call screen AND the mint route (off unless set to
 * 1/true/on/yes). Inlined into the browser bundle at build time, so a change needs a new deployment.
 */
export function liveAvatarEnabled(value: string | undefined = process.env.NEXT_PUBLIC_LIVE_AVATAR): boolean {
  return /^(1|true|on|yes)$/i.test((value ?? '').trim());
}

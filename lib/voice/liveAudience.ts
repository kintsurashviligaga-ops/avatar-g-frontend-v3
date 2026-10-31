/**
 * lib/voice/liveAudience.ts — who may open a Vertex Live call while it rolls out.
 *
 * GG chose (2026-10-25) to open Live on myavatar.ge to admins first and to everyone only after the owner's own test.
 * LIVE_AUDIENCE=everyone opens it to every signed-in user. Anything else, unset included, keeps it to admins
 * (lib/auth/adminGuard's one rule), so a missing or mistyped setting never opens the cost-bearing call to everyone.
 * Everyone else gets the route's 503, and the browser falls back to the REST voice loop, as before the relay.
 */
import 'server-only';
import { isAdminIdentity, type AdminCandidate } from '@/lib/auth/adminGuard';

export type LiveAudience = 'admins' | 'everyone';

export function liveAudience(env: Record<string, string | undefined> = process.env): LiveAudience {
  return env.LIVE_AUDIENCE?.trim().toLowerCase() === 'everyone' ? 'everyone' : 'admins';
}

export async function liveAudienceAllows(
  user: AdminCandidate | null | undefined,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (liveAudience(env) === 'everyone') return true;
  return isAdminIdentity(user);
}

/**
 * THE TALKING AVATAR has its own audience (GG 2026-10-31: „მომხმარებლები რატომ ვერ ნახულობენ ლაივ ავატარს?“). Live is
 * free to users and the avatar is its costly part (~$0.4–0.7 a minute measured, against ~$0.2–0.4 for voice), so
 * opening the call to everyone (LIVE_AUDIENCE) must not open the avatar too. LIVE_AVATAR_AUDIENCE=everyone opens it to
 * every signed-in user; anything else, unset included, keeps it to admins. A call without it is a voice call.
 */
export function liveAvatarAudience(env: Record<string, string | undefined> = process.env): LiveAudience {
  return env.LIVE_AVATAR_AUDIENCE?.trim().toLowerCase() === 'everyone' ? 'everyone' : 'admins';
}

/** Avatar sessions a day: admins keep the old 30; everyone else gets LIVE_AVATAR_DAILY_SESSIONS (default 1, 5 min each). */
export const LIVE_AVATAR_ADMIN_DAILY_SESSIONS = 30;
export const LIVE_AVATAR_USER_DAILY_SESSIONS = 1;

export type LiveAvatarAccess = { allowed: boolean; dailySessions: number };

export async function liveAvatarAccess(
  user: AdminCandidate | null | undefined,
  env: Record<string, string | undefined> = process.env,
): Promise<LiveAvatarAccess> {
  if (await isAdminIdentity(user)) return { allowed: true, dailySessions: LIVE_AVATAR_ADMIN_DAILY_SESSIONS };
  if (liveAvatarAudience(env) !== 'everyone') return { allowed: false, dailySessions: 0 };
  const n = Number.parseInt(env.LIVE_AVATAR_DAILY_SESSIONS?.trim() ?? '', 10);
  const dailySessions = Number.isFinite(n) && n >= 1 && n <= LIVE_AVATAR_ADMIN_DAILY_SESSIONS ? n : LIVE_AVATAR_USER_DAILY_SESSIONS;
  return { allowed: true, dailySessions };
}

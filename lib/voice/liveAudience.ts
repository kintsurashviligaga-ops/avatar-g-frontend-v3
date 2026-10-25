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

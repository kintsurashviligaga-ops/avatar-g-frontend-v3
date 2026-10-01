/**
 * lib/twin/caller.ts — whose twin a capture request is for.
 *
 * Two ways in, both a signed-in user's:
 *   · the browser's own session (the desktop capture in ChatChrome);
 *   · the desktop user's PHONE-HANDOFF link (/{locale}/avatar/enroll?t=…, the QR flow) — the phone has no session,
 *     and the link is the signed-in desktop user's delegation, exactly as for the legacy selfie handoff.
 *
 * ⚠️ A LINK WINS OVER THE PHONE'S OWN SESSION. A phone signed into a different account must still save the twin to the
 * account that showed the QR — otherwise the desktop waits forever and the face lands on the wrong account.
 * ⚠️ READING IS NOT COMPLETING. Here a link is only verified and checked unused; /api/twin/commit CLAIMS it
 * (consumeHandoffToken) right before the manifest switch, so the link works for exactly one finished twin.
 * GET and DELETE /api/twin take the session only — a link never reads or erases a twin.
 */
import 'server-only';

import { verifyHandoffToken, type HandoffClaims, type HandoffJtiStore } from '@/lib/avatar/handoff';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isTwinUserId } from './paths';

export type TwinCaller =
  | { ok: true; userId: string; via: 'session' }
  | { ok: true; userId: string; via: 'handoff'; token: string; claims: HandoffClaims }
  | { ok: false; status: 401 | 503; error: 'unauthorized' | 'invalid_or_expired_link' | 'link_already_used' | 'unavailable' };

/** The verified session's user id, or null (an auth outage reads as "no session", never as a user). */
export async function sessionUserId(req: Request): Promise<string | null> {
  try {
    const id = (await authedClientFromRequest(req)).user?.id ?? null;
    return isTwinUserId(id) ? id : null;
  } catch {
    return null;
  }
}

export async function resolveTwinCaller(req: Request, handoffToken: unknown, store: HandoffJtiStore): Promise<TwinCaller> {
  if (typeof handoffToken === 'string' && handoffToken.trim()) {
    const token = handoffToken.trim();
    const claims = verifyHandoffToken(token);
    if (!claims || !isTwinUserId(claims.userId)) return { ok: false, status: 401, error: 'invalid_or_expired_link' };
    const used = await store.isClaimed(claims.jti);
    if (used === null) return { ok: false, status: 503, error: 'unavailable' };
    if (used) return { ok: false, status: 401, error: 'link_already_used' };
    return { ok: true, userId: claims.userId, via: 'handoff', token, claims };
  }
  const userId = await sessionUserId(req);
  return userId ? { ok: true, userId, via: 'session' } : { ok: false, status: 401, error: 'unauthorized' };
}

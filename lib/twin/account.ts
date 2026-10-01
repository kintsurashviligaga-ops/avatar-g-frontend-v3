/**
 * lib/twin/account.ts — WHICH ACCOUNT a phone-handoff link captures into, shown on the phone before anything is captured.
 *
 * ⚠️ BIOMETRIC PHISHING. A handoff link is a bearer delegation: whoever opens it captures a face and a voice into the
 * LINK's account. "Scan this QR" from a stranger would otherwise put YOUR face into THEIR twin with nothing on screen to
 * say so. So the enroll page (app/[locale]/avatar/enroll) resolves the link here first and the capture's consent screen
 * says "Saving to: gi•••i@gmail.com" — and a phone signed into a DIFFERENT account is refused outright (the routes
 * refuse it too: lib/twin/caller.ts 409 account_mismatch).
 *
 * The label is MASKED: the link holder learns only enough to recognise their own account, never the full address.
 * Only the email or phone — never a display name, which the account's owner chooses and could make look like anyone's.
 */
import 'server-only';

import { verifyHandoffToken, type HandoffJtiStore } from '@/lib/avatar/handoff';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTwinUserId } from './paths';

const DOT = '•••';

/** `giorgi@gmail.com` → `gi•••i@gmail.com`; a short local part keeps only its first character. null when not an email. */
export function maskEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1 || e.length > 254) return null;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const shown = local.length >= 5 ? `${local.slice(0, 2)}${DOT}${local.slice(-1)}` : `${local.slice(0, 1)}${DOT}`;
  return `${shown}@${domain}`;
}

/** `+995 555 12 34 56` → `+•••56`: the last two digits only. null when there are fewer than 6 digits. */
export function maskPhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 ? `+${DOT}${digits.slice(-2)}` : null;
}

/** The masked label for an account: its email, else its phone; null when it has neither. */
export function maskedAccountLabel(user: { email?: string | null; phone?: string | null } | null | undefined): string | null {
  return maskEmail(user?.email) ?? maskPhone(user?.phone);
}

/** The masked label of a user id via the service role. null when the account has no email/phone; THROWS when auth cannot answer. */
export async function lookupMaskedAccount(userId: string): Promise<string | null> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error('twin account lookup failed');
  return maskedAccountLabel(data.user);
}

export type HandoffLinkInfo =
  | { ok: true; account: string }
  | { ok: false; reason: 'invalid' | 'used' | 'account_mismatch' | 'unavailable' };

/**
 * What the phone may show for a handoff link: the masked account it saves to — or why it must not start at all.
 * Fail-closed: when the store or the account lookup cannot answer, the capture does not start (a capture that cannot say
 * whose twin it is must not run).
 */
export async function describeHandoffLink(
  token: string,
  deps: {
    /** The phone's own signed-in user (null when signed out). */
    sessionUserId: string | null;
    store: () => HandoffJtiStore;
    lookup?: (userId: string) => Promise<string | null>;
  },
): Promise<HandoffLinkInfo> {
  const claims = verifyHandoffToken(token);
  if (!claims || !isTwinUserId(claims.userId)) return { ok: false, reason: 'invalid' };
  if (deps.sessionUserId && deps.sessionUserId !== claims.userId) return { ok: false, reason: 'account_mismatch' };
  try {
    const used = await deps.store().isClaimed(claims.jti);
    if (used === null) return { ok: false, reason: 'unavailable' };
    if (used) return { ok: false, reason: 'used' };
    const account = await (deps.lookup ?? lookupMaskedAccount)(claims.userId);
    return account ? { ok: true, account } : { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

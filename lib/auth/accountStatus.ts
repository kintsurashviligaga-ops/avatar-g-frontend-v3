/**
 * lib/auth/accountStatus.ts — what the sign-in sheet needs to know about an address BEFORE it asks for anything.
 *
 * The sheet has separate „Log in" and „Sign up" (owner, 2026-10-03): an address that already has an account must not
 * register again, and log-in should not ask for a password that does not exist. One server-only question answers both
 * — `public.auth_account_status` (supabase/migrations/20261003f), called by /api/auth/lookup:
 *
 *   none      no account, or a sign-up nobody finished (unconfirmed) → log-in says „no account — create one";
 *             sign-up goes ahead (an unfinished sign-up is simply re-sent its code)
 *   password  a confirmed account whose owner set a password in the sheet → log-in asks for it (a code stays one tap away)
 *   code      a confirmed account with NO password (made by a code, never set one) → log-in mails a code straight away
 *   unknown   the answer is not available (the function is not applied yet, or the database failed) → log-in offers
 *             the password AND a code, and sign-up still cannot duplicate an account: Supabase itself refuses
 *             `email_exists` when the register code is requested (/api/auth/email-otp/send)
 *
 * A confirmed account made before the flag existed (`password: null`) is `password`: it may have one (the old
 * email + password sign-up) — and the code is offered beside it anyway.
 */
export type AccountStatus = 'none' | 'password' | 'code' | 'unknown';

export function isAccountStatus(v: unknown): v is AccountStatus {
  return v === 'none' || v === 'password' || v === 'code' || v === 'unknown';
}

/** The function's jsonb → a status. Anything malformed is `unknown`, never a guess. */
export function statusFromRow(row: unknown): AccountStatus {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'unknown';
  const r = row as { exists?: unknown; confirmed?: unknown; password?: unknown };
  if (typeof r.exists !== 'boolean' || typeof r.confirmed !== 'boolean') return 'unknown';
  if (!r.exists || !r.confirmed) return 'none';
  return r.password === false ? 'code' : 'password';
}

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

/** Ask the database. Fails SOFT to `unknown` — the sheet then offers every way in rather than a wrong one. */
export async function lookupAccountStatus(
  admin: RpcClient,
  id: { kind: 'email'; email: string } | { kind: 'phone'; phone: string },
): Promise<AccountStatus> {
  try {
    const { data, error } = await admin.rpc('auth_account_status', id.kind === 'email'
      ? { p_email: id.email, p_phone: null }
      : { p_email: null, p_phone: id.phone });
    if (error) return 'unknown';
    return statusFromRow(data);
  } catch {
    return 'unknown';
  }
}

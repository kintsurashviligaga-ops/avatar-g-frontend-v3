/**
 * Is a ledger error really "the profile row is missing" rather than "the balance is too low"?
 *
 * ⚠️ THE RPC CANNOT TELL YOU FROM `message` ALONE. `deduct_credits` reports BOTH cases as
 * `message: "insufficient_credits"` and only distinguishes them in `details`. Probed against the live
 * database with a real user id that had no profile row:
 *
 *   { code: "P0001", details: "no profile record",  message: "insufficient_credits" }   ← broken user
 *   { code: "P0001", details: "have 0 need 1",      message: "insufficient_credits" }   ← empty wallet
 *
 * The first is a bug the user cannot escape (topping up cannot help — there is nowhere to put the
 * balance); the second is normal. Getting this backwards is expensive in both directions: treat an
 * empty wallet as a missing profile and renders are handed out free, treat a missing profile as an
 * empty wallet and the user is stuck behind a top-up that will never work.
 *
 * PURE ON PURPOSE — no Supabase import. The client pulls @t3-oss/env-nextjs, whose ESM cannot be
 * loaded by jest, so a predicate living beside it would be untestable.
 */
export function isMissingProfileError(details?: string | null, message?: string | null): boolean {
  const d = `${details ?? ''} ${message ?? ''}`.toLowerCase();
  return d.includes('no profile record') || d.includes('profile not found');
}

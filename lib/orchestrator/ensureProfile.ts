import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';

/**
 * Guarantee that an authenticated user has a `profiles` row, creating it if it is missing.
 *
 * ⚠️ THE BUG THIS EXISTS FOR — a signed-in user being told they are out of credits.
 *
 * Every credit operation goes through the `deduct_credits` RPC, and that RPC reports a MISSING PROFILE
 * as an insufficient balance. Probed against the live database with a real user id that has no row:
 *
 *   POST /rest/v1/rpc/deduct_credits
 *   → 400 { code: "P0001", details: "no profile record", message: "insufficient_credits" }
 *
 * The caller only ever sees `message`. So a validly logged-in user — correct session, correct cookies —
 * is told "not enough credits, please top up", and topping up cannot help because the row the balance
 * would land in does not exist. Every paid action fails for them, permanently, with a message that
 * points at the wrong thing entirely. Measured on the live database: 2 of 17 auth users were in this
 * state.
 *
 * It is worse than a confusing message. `hasSufficientBalance` reads the profile with `maybeSingle()`
 * and FAILS OPEN on a null row, so the pre-render gate waves the request through, the paid provider
 * call happens, and only the post-render deduct discovers there is nowhere to charge.
 *
 * WHY A TRIGGER IS NOT ENOUGH. `on_auth_user_created_profile` does exist and fires on `auth.users`
 * INSERT — but it only protects users created AFTER it was installed, and it cannot help a row deleted
 * later or an account made through a path that bypasses the normal flow. Self-healing on READ covers
 * all of those: the gap closes the next time the user does anything, without a backfill and without
 * knowing how it happened.
 *
 * Idempotent by construction (ON CONFLICT DO NOTHING via upsert + ignoreDuplicates), so concurrent
 * requests for the same user race harmlessly. Never throws: a repair that fails must not take down the
 * operation it was trying to protect.
 */
export async function ensureProfileRow(userId: string, email?: string | null): Promise<boolean> {
  if (!userId) return false;
  const sb = createServiceRoleClient();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from('profiles')
      .upsert(
        { id: userId, ...(email ? { email } : {}) },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    if (error) {
      reportError(error, { fn: 'ensureProfileRow', userId });
      return false;
    }
    return true;
  } catch (e) {
    reportError(e, { fn: 'ensureProfileRow', userId });
    return false;
  }
}

export { isMissingProfileError } from '@/lib/orchestrator/profileError';

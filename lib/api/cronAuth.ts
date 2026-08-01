import 'server-only';

/**
 * Is this request an authorised scheduled invocation?
 *
 * ⚠️ THE FAIL-OPEN THIS REPLACES. /api/tracking/sync compared against a template literal:
 *
 *     if (authHeader !== `Bearer ${cronSecret}`) { ...reject... }
 *
 * With CRON_SECRET unset — which is its state today — that string is the literal `"Bearer undefined"`.
 * Any caller sending exactly that header PASSED, reaching TrackingSyncService, which fans out to paid
 * carrier APIs per shipped job and writes back with a service-role client. An absent secret turned the
 * gate into a password anyone could read off the source.
 *
 * The correct shape was already in the repo — /api/cron/drain-renders opens with `if (!secret) return
 * false`. This is that logic, extracted so a third copy cannot drift into a fourth.
 *
 * ⚠️ NO SECRET MEANS NO ACCESS, NEVER "NO CHECK". A missing secret is a misconfiguration, and the safe
 * reading of a misconfigured lock is "locked". The cost is a cron that does not run and is visible in
 * logs; the alternative cost is an open endpoint nobody notices.
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return false; // unset → refuse, never fall open
  const auth = req.headers.get('authorization');
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; x-cron-token supports manual runs.
  return auth === `Bearer ${secret}` || req.headers.get('x-cron-token') === secret;
}

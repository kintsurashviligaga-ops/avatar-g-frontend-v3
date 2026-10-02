import 'server-only';

/**
 * lib/security/opsAccess.ts — who may read an OPERATIONS endpoint (health detail, readiness, self-tests, probes).
 *
 * ⚠️ THESE ENDPOINTS WERE ANONYMOUS RECONNAISSANCE AND AN AMPLIFIER. /api/app/health?live=1 fired a live probe at seven
 * providers on every anonymous GET and returned our vendor credit balances; /api/system/film-selftest made two
 * server-to-server POSTs per hit and, with ?udio=1, read our Udio balance aloud; /api/system/film-readiness listed which
 * provider keys this deployment has. None of that is for the public, and a loop against any of them spends real calls.
 *
 * The rule, in one place:
 *   · outside production (`next dev`, jest)                → allowed — local diagnostics stay convenient;
 *   · a scheduled / scripted caller with CRON_SECRET       → allowed (lib/api/cronAuth: unset secret = refused);
 *   · a signed-in admin (the imported email allowlist)     → allowed — `isAdmin()`, never user_metadata or a profile row;
 *   · anyone else in production                            → 404, so the endpoint does not even admit it exists.
 *
 * ⚠️ NODE_ENV is 'production' on Vercel Preview deployments too (next build sets it), so previews are gated like prod.
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { isAdmin } from '@/lib/auth/adminGuard';
import { secretMatches } from '@/lib/security/secretMatch';

export { secretMatches };

/** True when the request may see an operations endpoint (see the rule above). Never throws. */
export async function opsCallerAllowed(req: Request): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    if (isCronAuthorized(req)) return true;
  } catch {
    /* a malformed header is not authorisation */
  }
  try {
    return await isAdmin();
  } catch {
    return false;
  }
}

/** The answer for a refused operations caller: a plain 404, indistinguishable from a route that does not exist. */
export function opsNotFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Admin-key header check (`x-admin-key` against ADMIN_KEY), for scripted admin diagnostics.
 *
 * ⚠️ HEADER ONLY — NEVER `?key=`. A key in the query string lands in access logs, traces, browser history and error
 * reports; three routes used to accept it there.
 */
export function adminKeyHeaderMatches(req: Request): boolean {
  return secretMatches(req.headers.get('x-admin-key'), process.env.ADMIN_KEY);
}

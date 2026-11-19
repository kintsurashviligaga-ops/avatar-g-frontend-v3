/**
 * /api/agent/browser/login — log in to a site inside Agent G's cloud browser, so later tasks on that site run logged in
 * (lib/agent/browser/login; GG 2026-11-07 08:02Z chose "both": Premiere XML and logging in, the session stored encrypted).
 *
 *   GET                                   { enabled, sites: [{ site, savedAt }] } for THIS user (never a cookie)
 *   POST { action: 'start', url }         opens the site in a fresh cloud browser → { ok, pass, site }
 *   POST { action: 'act', pass, input }   one tap / text / key / scroll / back from the person → { ok }
 *   POST { action: 'frame', pass }        → { ok, url, title, done, error, jpeg (base64) }
 *   POST { action: 'save', pass }         seals this site's cookies in the person's vault, closes the browser
 *   POST { action: 'cancel', pass }       closes the browser, keeps nothing
 *   POST { action: 'forget', site }       deletes the saved login for one site
 *
 * ⚠️ CLOSED UNLESS AGENT_G_SANDBOX opens it to this user (admins first, v5.1 D-08), the browser is on (BROWSER_ENABLED,
 * BROWSER_SNAPSHOT_ID), AGENT_BROWSER_LOGIN=1 and AGENT_BROWSER_VAULT_KEY is a 32-byte key. Closed = 404 before the
 * session is read. Request bodies (which carry what the person types, a password included) are never logged.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentSandboxAccess, agentSandboxOpenTo } from '@/lib/agent/media/access';
import { browserLoginEnabled, liveBrowserLogin, liveSessionStore } from '@/lib/agent/browser';
import type { LoginError } from '@/lib/agent/browser/login';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Starting the sandbox from the snapshot, or waiting for the browser to hand over the login.
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });
const STATUS: Record<LoginError, number> = {
  bad_input: 400, not_configured: 503, pass_invalid: 409, refused: 503, runner_failed: 502, not_saved: 422,
};
const SITE = /^[a-z0-9.-]{3,253}$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (agentSandboxAccess() === 'off' || !browserLoginEnabled()) return NextResponse.json({ enabled: false, sites: [] }, { headers: NO_STORE });
  const { user } = await authedClientFromRequest(req);
  if (!user || !agentSandboxOpenTo(user)) return NextResponse.json({ enabled: false, sites: [] }, { headers: NO_STORE });
  const store = await liveSessionStore();
  const sites = store ? await store.list(user.id).catch(() => []) : [];
  return NextResponse.json({ enabled: true, sites }, { headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (agentSandboxAccess() === 'off' || !browserLoginEnabled()) return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!agentSandboxOpenTo(user)) return notFound();
  const limited = await checkRateLimit(req, RATE_LIMITS.BROWSER_LOGIN_LIVE, user.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  if (action === 'forget') {
    const site = typeof body?.site === 'string' ? body.site.toLowerCase() : '';
    if (!SITE.test(site)) return NextResponse.json({ ok: false, error: 'bad_input', message: 'Which site?' }, { status: 400, headers: NO_STORE });
    const store = await liveSessionStore();
    if (!store) return notFound();
    await store.forget(user.id, site);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const login = await liveBrowserLogin(user.id);
  if (!login) return notFound();
  const reply = (r: { ok: boolean; error?: LoginError | string | null } & Record<string, unknown>) =>
    NextResponse.json(r, { status: r.ok ? 200 : (STATUS[r.error as LoginError] ?? 400), headers: NO_STORE });

  switch (action) {
    case 'start': {
      const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.BROWSER_LOGIN_USER);
      if (capped) return capped;
      return reply(await login.start(user.id, body?.url));
    }
    case 'act':
      return reply(await login.act(user.id, body?.pass, body?.input));
    case 'frame': {
      const r = await login.frame(user.id, body?.pass);
      if (!r.ok) return reply(r);
      const { jpeg, ...rest } = r;
      return reply({ ...rest, ...(jpeg ? { jpeg: jpeg.toString('base64') } : {}) });
    }
    case 'save':
      return reply(await login.save(user.id, body?.pass));
    case 'cancel':
      return reply(await login.cancel(user.id, body?.pass));
    default:
      return NextResponse.json({ ok: false, error: 'bad_input', message: "action: 'start', 'act', 'frame', 'save', 'cancel' or 'forget'" }, { status: 400, headers: NO_STORE });
  }
}

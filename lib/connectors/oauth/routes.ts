/**
 * lib/connectors/oauth/routes.ts — the connect → provider → callback → disconnect routes of a token connector, written
 * once (the Drive routes' rules, lib/connectors/google + app/api/connectors/google_drive):
 *
 *   connect     signed in + flag open + configured, else 404 (closed) or a redirect back with a reason. Sets an httpOnly
 *               cookie (PKCE verifier ~ signed state ~ locale, 10 min, path-scoped) and 302s to the provider.
 *   callback    the state must equal the cookie's AND verify (HMAC, this user, unexpired, this connector's domain); the
 *               code is traded with the verifier; the token is sealed and stored; a store failure revokes it at once.
 *   disconnect  revokes at the provider, deletes the row, answers { ok, revoked }.
 *
 * Every return to the app is a 303 to /{locale}?{id}=linked | {id}=error&reason=… — the Plugins sheet says it in ka/en/ru.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { decryptToken, encryptToken, pkcePair, signState, verifyState, STATE_TTL_MS } from '@/lib/connectors/google/crypto';
import type { TokenConnectorDeps, TokenConnectorSpec } from './types';
import { tokenRedirectUri } from './token';
import type { FlagAccess } from './access';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };
const LOCALES = new Set(['ka', 'en', 'ru']);
export const localeOf = (v: string | null | undefined): 'ka' | 'en' | 'ru' => (v && LOCALES.has(v) ? (v as 'ka' | 'en' | 'ru') : 'ka');

export interface RouteEnv {
  user(req: NextRequest): Promise<User | null>;
  deps(spec: TokenConnectorSpec, user: User | null): Promise<TokenConnectorDeps>;
  /** Rate limit; a Response means "stop here". */
  limit(req: NextRequest, userId?: string): Promise<Response | null>;
  fetch?: typeof fetch;
  /**
   * Who the connector's flag opens it to (lib/connectors/oauth/access). `off` = every route is a plain 404 before
   * anything else runs, signed in or not; `admin` = a signed-out caller gets the same 404 (Phase 8.18 flag isolation).
   * Absent (unit tests) = decided by deps alone, as before.
   */
  access?(spec: TokenConnectorSpec): FlagAccess;
}

/** The 404 a closed connector answers, or null to go on. Called first, and again once the user is known. */
export function closedGate(spec: TokenConnectorSpec, env: RouteEnv, user?: User | null): Response | null {
  const a = env.access?.(spec);
  if (a === 'off') return notFound();
  if (a === 'admin' && user === null) return notFound();
  return null;
}

const cookieName = (spec: Pick<TokenConnectorSpec, 'id'>) => `${spec.id}_oauth`;
const cookiePath = (spec: Pick<TokenConnectorSpec, 'id'>) => `/api/connectors/${spec.id}`;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });

export function backTo(spec: Pick<TokenConnectorSpec, 'id'>, origin: string, locale: string, result: 'linked' | 'error', reason?: string): NextResponse {
  const u = new URL(`/${localeOf(locale)}`, origin);
  u.searchParams.set(spec.id, result);
  if (reason) u.searchParams.set('reason', reason);
  const res = NextResponse.redirect(u, 303);
  res.cookies.set(cookieName(spec), '', { path: cookiePath(spec), maxAge: 0 });
  return res;
}

export async function handleConnect(spec: TokenConnectorSpec, env: RouteEnv, req: NextRequest): Promise<Response> {
  const shut = closedGate(spec, env);
  if (shut) return shut;
  const limited = await env.limit(req);
  if (limited) return limited;
  const origin = req.nextUrl.origin;
  const locale = localeOf(req.nextUrl.searchParams.get('locale'));
  const user = await env.user(req);
  const shutForUser = closedGate(spec, env, user);
  if (shutForUser) return shutForUser;
  if (!user) return backTo(spec, origin, locale, 'error', 'not_signed_in');
  const deps = await env.deps(spec, user);
  if (!deps.cfg) return notFound();
  if (!deps.store || !deps.tableReady) return backTo(spec, origin, locale, 'error', 'unavailable');
  const { verifier, challenge } = pkcePair();
  const state = signState(user.id, deps.cfg.keys, Date.now(), spec.stateDomain);
  const url = spec.authorizeUrl(deps.cfg, { redirectUri: tokenRedirectUri(spec, origin), state, challenge });
  const res = NextResponse.redirect(url, 302);
  res.cookies.set(cookieName(spec), `${verifier}~${state}~${locale}`, {
    httpOnly: true, secure: true, sameSite: 'lax', path: cookiePath(spec), maxAge: Math.floor(STATE_TTL_MS / 1000),
  });
  return res;
}

export async function handleCallback(spec: TokenConnectorSpec, env: RouteEnv, req: NextRequest): Promise<Response> {
  const shut = closedGate(spec, env);
  if (shut) return shut;
  const limited = await env.limit(req);
  if (limited) return limited;
  const origin = req.nextUrl.origin;
  const [verifier = '', cookieState = '', locale = 'ka'] = (req.cookies.get(cookieName(spec))?.value ?? '').split('~');
  const user = await env.user(req);
  const shutForUser = closedGate(spec, env, user);
  if (shutForUser) return shutForUser;
  if (!user) return backTo(spec, origin, locale, 'error', 'not_signed_in');
  const deps = await env.deps(spec, user);
  if (!deps.cfg) return notFound();
  if (!deps.store || !deps.tableReady) return backTo(spec, origin, locale, 'error', 'unavailable');
  const q = req.nextUrl.searchParams;
  if (q.get('error')) return backTo(spec, origin, locale, 'error', 'denied');
  const state = q.get('state') ?? '';
  const code = q.get('code') ?? '';
  if (!verifier || !cookieState || !state || !code || !same(state, cookieState)) return backTo(spec, origin, locale, 'error', 'state');
  if (!verifyState(state, user.id, deps.cfg.keys, Date.now(), spec.stateDomain).ok) return backTo(spec, origin, locale, 'error', 'state');
  const ex = await spec.exchange(deps.cfg, { code, verifier, redirectUri: tokenRedirectUri(spec, origin) }, env.fetch);
  if (!ex.ok) return backTo(spec, origin, locale, 'error', ex.reason);
  const stored = await deps.store.put({ userId: user.id, sealedRefreshToken: encryptToken(ex.accessToken, user.id, deps.cfg.keys), scope: ex.scope, email: ex.account });
  if (!stored) {
    await spec.revoke(deps.cfg, ex.accessToken, env.fetch);
    return backTo(spec, origin, locale, 'error', 'unavailable');
  }
  return backTo(spec, origin, locale, 'linked');
}

export async function handleDisconnect(spec: TokenConnectorSpec, env: RouteEnv, req: NextRequest): Promise<Response> {
  const shut = closedGate(spec, env);
  if (shut) return shut;
  const user = await env.user(req);
  const shutForUser = closedGate(spec, env, user);
  if (shutForUser) return shutForUser;
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE });
  const limited = await env.limit(req, user.id);
  if (limited) return limited;
  const deps = await env.deps(spec, user);
  if (!deps.cfg) return notFound();
  if (!deps.store || !deps.tableReady) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  const row = await deps.store.get(user.id).catch(() => null);
  let revoked = true;
  if (row) {
    const token = decryptToken(row.sealedRefreshToken, user.id, deps.cfg.keys);
    revoked = token ? await spec.revoke(deps.cfg, token, env.fetch) : false;
  }
  if (!(await deps.store.remove(user.id))) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ ok: true, revoked }, { headers: NO_STORE });
}

/** The live RouteEnv: the Supabase session, the live deps, the READ rate limit. Loaded lazily so tests stay offline. */
export async function liveRouteEnv(): Promise<RouteEnv> {
  const [{ authedClientFromRequest }, { checkRateLimit, RATE_LIMITS }, { liveTokenDeps }, { flagAccess }] = await Promise.all([
    import('@/lib/supabase/server'),
    import('@/lib/api/rate-limit'),
    import('./live'),
    import('./access'),
  ]);
  return {
    access: (spec) => flagAccess(spec.flag),
    user: async (req) => (await authedClientFromRequest(req)).user ?? null,
    deps: (spec, user) => liveTokenDeps(spec, user),
    limit: (req, userId) => checkRateLimit(req, RATE_LIMITS.READ, userId),
  };
}

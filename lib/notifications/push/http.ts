/**
 * lib/notifications/push/http.ts — the small pieces the /api/push routes share.
 */
import 'server-only';
import type { NextResponse } from 'next/server';

/**
 * ⚠️ A cookie-authenticated WRITE started by another site. Subscribing is a write that matters: a forged subscribe would
 * register the attacker's push endpoint on the victim's account and deliver the victim's notifications to the attacker.
 * The session cookies are SameSite=Lax (cross-site POSTs carry none), and browsers that send Fetch Metadata let us refuse
 * the request outright. A Bearer-token caller (the mobile shell) cannot be forged cross-site, so it is not checked.
 */
export function isCrossSiteCookieWrite(req: Request): boolean {
  if ((req.headers.get('authorization') ?? '').startsWith('Bearer ')) return false;
  return req.headers.get('sec-fetch-site') === 'cross-site';
}

/** A per-user answer must never be stored by a cache in between. */
export function noStore<T extends NextResponse>(res: T): T {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

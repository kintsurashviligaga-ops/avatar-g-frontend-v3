/**
 * Shared bits of the Google Drive link routes (connect → Google → callback, picker, disconnect).
 */
import { NextResponse } from 'next/server';

export const COOKIE = 'drive_oauth';
export const NO_STORE = { 'Cache-Control': 'private, no-store' };
const LOCALES = new Set(['ka', 'en', 'ru']);

export function localeOf(v: string | null | undefined): 'ka' | 'en' | 'ru' {
  return v && LOCALES.has(v) ? (v as 'ka' | 'en' | 'ru') : 'ka';
}

/** Back to the app with a result flag the Connectors view reads (drive=linked | drive=error&reason=…). */
export function backTo(origin: string, locale: string, result: 'linked' | 'error', reason?: string): NextResponse {
  const u = new URL(`/${localeOf(locale)}`, origin);
  u.searchParams.set('drive', result);
  if (reason) u.searchParams.set('reason', reason);
  const res = NextResponse.redirect(u, 303);
  res.cookies.set(COOKIE, '', { path: '/api/connectors/google_drive', maxAge: 0 });
  return res;
}

export const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });

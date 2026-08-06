'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Tells the server this browser is still on the site, so the admin panel can show "active now".
 *
 * ⚠️ ONLY WHILE THE TAB IS VISIBLE. A background tab left open for a week would otherwise report itself
 * as an active visitor forever — the counter would drift up and never come down, and an admin would be
 * reading open tabs rather than people. Pings stop on hide and resume on show.
 *
 * ⚠️ THE ID IS AN OPAQUE RANDOM TOKEN IN localStorage — not a user id, not a fingerprint, not derived
 * from anything about the person. It exists so two page views from one browser count as one visitor.
 * Clearing site data resets it, which is the correct amount of tracking for a live counter.
 *
 * ⚠️ SECTION IS COARSE, NEVER THE URL. A path can carry a signed token or a query string, and this value
 * is read by admins; "pricing" is all the panel needs.
 */

const KEY = 'myavatar:visitor-id';
// 45s against the server's 2-minute "active" window: a visitor stays counted across one missed ping
// (a sleeping laptop, a slow network) without the window being so wide that leavers linger.
const INTERVAL_MS = 45_000;

function visitorId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const fresh = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage disabled — a per-session id still counts the visitor, it just will not
    // survive a reload. Better than not counting them at all.
    return `s-${Math.random().toString(36).slice(2, 14)}`;
  }
}

function sectionOf(pathname: string): string {
  if (/\/(dashboard|hub|workspace)(\/|$)/.test(pathname)) return 'chat';
  if (/\/library(\/|$)/.test(pathname)) return 'library';
  if (/\/pricing(\/|$)/.test(pathname)) return 'pricing';
  if (/\/settings(\/|$)/.test(pathname)) return 'settings';
  if (/\/support(\/|$)/.test(pathname)) return 'support';
  if (/\/(terms|privacy|refund|cookies|licenses)(\/|$)/.test(pathname)) return 'legal';
  if (/\/admin(\/|$)/.test(pathname)) return 'admin';
  if (/^\/([a-z]{2})?\/?$/.test(pathname) || /\/(about|business|blog|careers|contact|services)(\/|$)/.test(pathname)) return 'marketing';
  return 'other';
}

export function PresenceHeartbeat() {
  const pathname = usePathname() || '/';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = visitorId();
    const section = sectionOf(pathname);
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      // keepalive so a ping fired as the user navigates away still lands.
      void fetch('/api/presence/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, section }),
        keepalive: true,
      }).catch(() => { /* presence is best-effort — never surfaced */ });
    };

    const start = () => { if (!timer) { ping(); timer = setInterval(ping, INTERVAL_MS); } };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    return () => { document.removeEventListener('visibilitychange', onVisibility); stop(); };
  }, [pathname]);

  return null;
}

export default PresenceHeartbeat;

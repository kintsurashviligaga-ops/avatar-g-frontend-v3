'use client';

/**
 * AdminSignOutButton — clears the Supabase session and returns to /{locale}/admin, where the server then
 * renders the login gate (no session → AdminLogin). Shared by the dashboard header and the access-denied
 * screen so "Log out" behaves identically everywhere.
 */
import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';

export default function AdminSignOutButton({ locale, className, label }: { locale: string; className?: string; label?: string }) {
  const ka = locale === 'ka';
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try { await createBrowserClient().auth.signOut(); } catch { /* sign-out is best-effort; navigate regardless */ }
    window.location.assign(`/${locale}/admin`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={className ?? 'rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-gray-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50'}
    >
      {busy ? (ka ? 'გამოსვლა…' : 'Signing out…') : (label ?? (ka ? 'გასვლა' : 'Log out'))}
    </button>
  );
}

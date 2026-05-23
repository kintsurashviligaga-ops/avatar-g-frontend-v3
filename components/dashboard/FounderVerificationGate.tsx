'use client';

/**
 * FounderVerificationGate — admin-ONLY production verification card.
 *
 * Visibility: admin is detected server-truth via /api/health/config, which only
 * returns the `integrations` detail to ADMIN_EMAILS. Non-admins receive a coarse
 * payload → this renders nothing. The action (founder-verify) is independently
 * 403-guarded server-side, so the gate is defense-in-depth (UI hidden AND route
 * forbidden).
 */

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Loader2, ExternalLink } from 'lucide-react';

export function FounderVerificationGate({ locale }: { locale: string }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/health/config', { cache: 'no-store', credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json() as { integrations?: unknown[] };
        // Only admins receive the integrations array.
        if (Array.isArray(j.integrations)) setIsAdmin(true);
      } catch { /* non-admin / offline → stay hidden */ }
    })();
  }, []);

  const verify = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/billing/founder-verify', { method: 'POST', credentials: 'include' });
      const j = await r.json().catch(() => ({})) as { url?: string; error?: string };
      if (r.ok && j.url) { window.location.href = j.url; return; }
      setError(
        r.status === 403 ? (locale === 'ka' ? 'მხოლოდ ადმინისთვის.' : 'Admins only.')
        : j.error === 'gel_unsupported' ? (locale === 'ka' ? 'Stripe-ს ანგარიში ჯერ არ უჭერს მხარს GEL-ს.' : 'Stripe account does not yet support GEL.')
        : (locale === 'ka' ? 'ვერ დაიწყო. სცადე მოგვიანებით.' : 'Could not start. Try again later.'),
      );
    } catch {
      setError(locale === 'ka' ? 'ქსელის შეცდომა.' : 'Network error.');
    } finally {
      setBusy(false);
    }
  }, [locale]);

  if (!isAdmin) return null;

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/[0.06] to-sky-500/[0.04] p-4 shadow-[0_0_28px_-12px_rgba(251,191,36,0.5)]">
      <div className="flex items-center gap-2 mb-1.5">
        <ShieldCheck size={16} className="text-amber-300" />
        <span className="text-[13px] font-bold text-white">Founder Production Verification Gate</span>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">admin</span>
      </div>
      <p className="text-[12px] text-white/55 leading-relaxed mb-3">
        {locale === 'ka'
          ? 'ცოცხალი E2E გადახდა — 100 USD (~275.00 ₾). ადებს რეალურ GEL ბალანსს და ააქტიურებს მთლიან MCP პაიფლაინს.'
          : 'Live E2E charge — 100 USD (~275.00 ₾). Hydrates the real GEL ledger and arms the full MCP pipeline.'}
      </p>
      <button
        type="button"
        onClick={verify}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl font-bold text-[14px] text-white bg-gradient-to-r from-amber-500 to-sky-600 hover:from-amber-400 hover:to-sky-500 disabled:opacity-60 transition-all duration-300 active:scale-[0.99] shadow-[0_10px_34px_-12px_rgba(251,191,36,0.7)]"
      >
        {busy ? <Loader2 size={17} className="animate-spin" /> : <ExternalLink size={16} />}
        {locale === 'ka' ? 'შევსება — 100 USD (275.00 ₾)' : 'Refill 100 USD (275.00 ₾)'}
      </button>
      {error && <p className="mt-2 text-[12px] text-rose-300">{error}</p>}
      <p className="mt-2 text-[10.5px] text-white/35 leading-relaxed">
        {locale === 'ka' ? 'ცოცხალი/ტესტ რეჟიმს განსაზღვრავს Stripe-ის გასაღები გარემოში.' : 'Live vs test is governed by the Stripe key in the environment.'}
      </p>
    </div>
  );
}

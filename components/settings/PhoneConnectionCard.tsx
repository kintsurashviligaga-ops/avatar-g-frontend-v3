'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Phone, ShieldCheck } from 'lucide-react';
import type { ConnCopy } from './connectionsCopy';

interface PhoneStatus {
  available: boolean;
  callsReady: boolean;
  verified: boolean;
  enabled: boolean;
  phone: string | null;
}

export function PhoneConnectionCard({ t, onChange }: { t: ConnCopy; onChange: () => void }) {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/api/agent-g/phone', { credentials: 'include', cache: 'no-store' });
      const body = await response.json() as { data?: PhoneStatus };
      if (response.ok && body.data) setStatus(body.data);
    } catch { /* the parent status remains honest */ }
  };
  useEffect(() => { void load(); }, []);

  const call = async (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/agent-g/phone', { method, credentials: 'include', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json().catch(() => ({})) as { data?: PhoneStatus & { challengeId?: string; phone?: string | null }; message?: string };
      if (!response.ok) throw new Error(payload.message || t.phoneError);
      return payload.data;
    } catch (e) { setError(e instanceof Error ? e.message : t.phoneError); return null; }
    finally { setBusy(false); }
  };

  const start = async (event: FormEvent) => {
    event.preventDefault();
    const result = await call('POST', { action: 'start', phoneNumber: number });
    if (result?.challengeId) { setChallengeId(result.challengeId); setNumber(''); }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    const result = await call('POST', { action: 'verify', challengeId, code });
    if (result?.verified) { setChallengeId(null); setCode(''); await load(); onChange(); }
  };

  const toggle = async () => {
    const result = await call('PATCH', { enabled: !status?.enabled });
    if (result) { await load(); onChange(); }
  };

  const disconnect = async () => {
    const result = await call('DELETE');
    if (result) { setStatus((current) => current ? { ...current, verified: false, enabled: false, phone: null } : current); onChange(); }
  };

  if (!status) return <Loader2 size={16} className="text-app-muted motion-safe:animate-spin" aria-label="…" />;
  if (!status.available) return <p className="text-[13px] text-app-muted">{t.phoneOff}</p>;

  if (!status.verified) return (
    <div className="space-y-3" data-testid="phone-connect-card">
      <p className="text-[13px] text-app-muted">{challengeId ? t.phoneCodeLead : t.phoneLead}</p>
      {challengeId ? (
        <form onSubmit={verify} className="space-y-2">
          <label className="block text-[12px] text-app-muted" htmlFor="phone-otp">{t.phoneCodeLabel}</label>
          <input id="phone-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="h-11 w-full rounded-xl bg-app-bg/70 px-3 text-sm text-app-text ring-1 ring-app-border/50 outline-none focus:ring-app-accent" placeholder="123456" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || code.length !== 6} className="inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-4 text-[13px] font-semibold text-app-bg disabled:opacity-50">{busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <ShieldCheck size={15} className="mr-2" />}{t.phoneVerify}</button>
            <button type="button" disabled={busy} onClick={() => { setChallengeId(null); setCode(''); }} className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-app-muted">{t.phoneResend}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={start} className="space-y-2">
          <label className="block text-[12px] text-app-muted" htmlFor="phone-number">{t.phoneNumberLabel}</label>
          <input id="phone-number" type="tel" inputMode="tel" autoComplete="tel" value={number} onChange={(e) => setNumber(e.target.value)} className="h-11 w-full rounded-xl bg-app-bg/70 px-3 text-sm text-app-text ring-1 ring-app-border/50 outline-none focus:ring-app-accent" placeholder="599 12 34 56" />
          <button type="submit" disabled={busy || number.replace(/\D/g, '').length < 9} className="inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-4 text-[13px] font-semibold text-app-bg disabled:opacity-50">{busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Phone size={15} className="mr-2" />}{t.phoneSendCode}</button>
        </form>
      )}
      {error && <p role="alert" className="text-[12px] text-rose-300">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-3" data-testid="phone-connected-card">
      <div className="flex items-center gap-2 text-[13px] text-app-text"><ShieldCheck size={16} className="text-emerald-400" />{status.phone}</div>
      <p className="text-[13px] text-app-muted">{status.callsReady ? t.phoneToggleLead : t.phoneVerifiedWaiting}</p>
      <button type="button" role="switch" aria-checked={status.enabled} aria-label={t.phoneToggleLabel} disabled={!status.callsReady || busy} onClick={() => void toggle()} className={`flex min-h-[48px] w-full items-center justify-between rounded-xl px-3 text-left ring-1 transition ${status.enabled ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-app-bg/60 ring-app-border/50'} disabled:cursor-not-allowed disabled:opacity-60`}>
        <span><span className="block text-[13px] font-semibold text-app-text">{t.phoneToggleLabel}</span><span className="block text-[12px] text-app-muted">{status.enabled ? t.phoneCallsOn : t.phoneCallsOff}</span></span>
        <span className={`relative h-6 w-11 rounded-full transition ${status.enabled ? 'bg-emerald-500' : 'bg-app-muted/40'}`} aria-hidden="true"><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${status.enabled ? 'left-6' : 'left-1'}`} /></span>
      </button>
      <button type="button" disabled={busy} onClick={() => void disconnect()} className="min-h-[40px] text-[12px] font-semibold text-app-muted underline decoration-app-border underline-offset-4">{t.phoneDisconnect}</button>
      {error && <p role="alert" className="text-[12px] text-rose-300">{error}</p>}
    </div>
  );
}

'use client';
/**
 * NotificationPrefsPanel — Settings → Connections → Notifications: which kind of news also goes to WhatsApp.
 *
 * Reads and writes /api/notifications/preferences. The site is always on (shown, not switchable). WhatsApp is offered
 * only when the server says this person's number is linked; Telegram, SMS and calls are named as temporarily unavailable
 * and offer nothing to press (no fake options). Each press saves at once; a failed save puts the switch back and says so.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { NOTIFY_EVENTS, type NotifyEventKind, type NotifyPrefs } from '@/lib/notifications/preferences';
import { CONN_COPY, type ConnLang } from './connectionsCopy';

interface PrefsData {
  prefs: NotifyPrefs;
  saved: boolean;
  available: { whatsapp: boolean; telegram: boolean; sms: boolean; call: boolean };
}

async function load(): Promise<PrefsData | null> {
  try {
    const r = await fetch('/api/notifications/preferences', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: PrefsData };
    return j.data ?? null;
  } catch {
    return null;
  }
}

export function NotificationPrefsPanel({ lang, whatsappState }: { lang: ConnLang; whatsappState: string }) {
  const t = CONN_COPY[lang];
  const [data, setData] = useState<PrefsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<NotifyEventKind | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setFailed(false);
    const d = await load();
    if (d) setData(d);
    else setFailed(true);
  }, []);

  // Re-read when WhatsApp is linked or disconnected in the row above.
  useEffect(() => { void refresh(); }, [refresh, whatsappState]);

  const toggle = async (event: NotifyEventKind) => {
    if (!data) return;
    const before = data;
    const on = data.prefs.events[event].includes('whatsapp');
    const nextEvents = { ...data.prefs.events, [event]: on ? data.prefs.events[event].filter((p) => p !== 'whatsapp') : [...data.prefs.events[event], 'whatsapp'] };
    const next: PrefsData = { ...data, prefs: { ...data.prefs, events: nextEvents } };
    setData(next);
    setBusy(event);
    setError(false);
    try {
      const r = await fetch('/api/notifications/preferences', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs: next.prefs }),
      });
      const j = (await r.json().catch(() => ({}))) as { data?: { prefs?: NotifyPrefs } };
      if (!r.ok || !j.data?.prefs) throw new Error('save failed');
      setData({ ...next, prefs: j.data.prefs, saved: true });
    } catch {
      setData(before);
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  if (!data && !failed) return <Loader2 size={16} className="text-app-muted motion-safe:animate-spin" aria-label="…" />;
  if (!data) {
    return (
      <div className="flex items-center justify-between gap-2 text-[13px] text-app-muted" role="alert">
        <span>{t.prefsLoadFailed}</span>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-[44px] items-center rounded-full px-3 font-semibold text-app-accent">{t.retry}</button>
      </div>
    );
  }

  const wa = data.available.whatsapp;
  return (
    <div data-testid="notify-prefs">
      <h4 className="text-[14px] font-semibold text-app-text">{t.prefsTitle}</h4>
      <p className="mt-0.5 text-[12.5px] leading-snug text-app-muted">{wa ? t.prefsLead : t.siteAlways}</p>
      <ul className="mt-2 divide-y divide-app-border/20">
        {NOTIFY_EVENTS.map((event) => {
          const on = data.prefs.events[event].includes('whatsapp');
          return (
            <li key={event} className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5" data-testid={`notify-row-${event}`}>
              <span className="min-w-0 flex-1 text-[13.5px] text-app-text">{t.events[event]}</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-app-bg/50 px-2.5 text-[12px] text-app-muted" aria-label={t.siteAlways}>
                  <Check size={12} aria-hidden="true" />{t.site}
                </span>
                {wa && (
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${t.whatsapp}: ${t.events[event]}`}
                    disabled={busy !== null}
                    onClick={() => void toggle(event)}
                    data-testid={`notify-wa-${event}`}
                    className={`inline-flex min-h-[44px] items-center gap-1 rounded-full px-3.5 text-[12.5px] font-medium transition-colors disabled:opacity-60 ${on ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' : 'text-app-muted ring-1 ring-app-border/40 hover:text-app-text'}`}
                  >
                    {busy === event ? <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : on ? <Check size={12} aria-hidden="true" /> : null}
                    {t.whatsapp}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {!wa && whatsappState === 'connect' && <p className="mt-2 text-[12.5px] text-app-muted">{t.connectWhatsAppFirst}</p>}
      <p className="mt-2 text-[12px] text-app-muted" data-testid="notify-later">{t.laterPlaces}</p>
      {error && <p className="mt-2 text-[12.5px] text-app-danger" role="alert">{t.saveFailed}</p>}
    </div>
  );
}

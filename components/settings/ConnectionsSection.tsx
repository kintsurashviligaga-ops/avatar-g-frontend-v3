'use client';
/**
 * ConnectionsSection — Settings → Connections (Omnichannel PART B, 2026-10-10): one compact card, four rows.
 *
 *   Phone (calls & SMS) · WhatsApp · Telegram · Notifications
 *
 * Every status word comes from the SERVER (GET /api/agent-g/channels → lib/connections/model.ts), never from the
 * browser guessing: „Connected" means a proven link, „Temporarily unavailable" means it cannot work here right now.
 * Web chat and Live Voice are the app itself and are not rows. A row opens in place (one at a time):
 *   WhatsApp       the existing link flow (WhatsAppLinkCard, embedded): Connect → Open WhatsApp → send → Connected;
 *                  Disconnect inside. Opens by itself on /settings#whatsapp (Agent G's WhatsApp replies link there).
 *   Notifications  this browser's push (PushPermissionCard) + what goes where (NotificationPrefsPanel).
 *   Phone, Telegram  one plain sentence while unavailable, and nothing to press.
 */
import { useCallback, useEffect, useState } from 'react';
import { Bell, ChevronDown, Loader2, MessageCircle, Phone, Send, type LucideIcon } from 'lucide-react';
import type { ConnectionId, ConnectionState, ConnectionView } from '@/lib/connections/model';
import { WhatsAppLinkCard } from '@/components/agent-g/WhatsAppLinkCard';
import { PushPermissionCard } from '@/components/notifications/PushPermissionCard';
import { NotificationPrefsPanel } from './NotificationPrefsPanel';
import { CONN_COPY, connLang } from './connectionsCopy';

const ICON: Record<ConnectionId, LucideIcon> = { phone: Phone, whatsapp: MessageCircle, telegram: Send, notifications: Bell };

const PILL: Record<ConnectionState, string> = {
  connect: 'bg-app-accent/15 text-app-accent',
  connected: 'bg-emerald-500/15 text-emerald-400',
  on: 'bg-emerald-500/15 text-emerald-400',
  unavailable: 'bg-app-bg/60 text-app-muted',
  signin: 'bg-app-bg/60 text-app-muted',
};

async function readConnections(): Promise<{ guest: boolean; connections: ConnectionView[] } | null> {
  try {
    const r = await fetch('/api/agent-g/channels', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { guest: boolean; connections: ConnectionView[] } };
    return j.data && Array.isArray(j.data.connections) ? j.data : null;
  } catch {
    return null;
  }
}

export function ConnectionsSection({ locale }: { locale: string }) {
  const lang = connLang(locale);
  const t = CONN_COPY[lang];
  const [data, setData] = useState<{ guest: boolean; connections: ConnectionView[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<ConnectionId | null>(null);

  const refresh = useCallback(async () => {
    setFailed(false);
    const d = await readConnections();
    if (d) setData(d);
    else setFailed(true);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // /settings#whatsapp — where every WhatsApp „link your number" reply points.
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#whatsapp') return;
    setOpen('whatsapp');
    window.setTimeout(() => document.getElementById('whatsapp')?.scrollIntoView({ block: 'start' }), 50);
  }, []);

  const stateOf = (id: ConnectionId): ConnectionState => data?.connections.find((c) => c.id === id)?.state ?? 'unavailable';

  const panel = (c: ConnectionView) => {
    if (c.state === 'signin') {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-app-muted">
          <span>{t.signIn}</span>
          <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); } catch { /* SSR */ } }}
            className="inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-4 text-[13px] font-semibold text-app-bg hover:opacity-90">{t.signInButton}</button>
        </div>
      );
    }
    switch (c.id) {
      case 'phone':
        return <p className="text-[13px] text-app-muted">{t.phoneOff}</p>;
      case 'telegram':
        return <p className="text-[13px] text-app-muted">{t.telegramOff}</p>;
      case 'whatsapp':
        return c.state === 'unavailable'
          ? <p className="text-[13px] text-app-muted" data-testid="wa-row-off">{t.state.unavailable}</p>
          : <WhatsAppLinkCard locale={lang} embedded onChange={() => void refresh()} />;
      case 'notifications':
        return (
          <div className="space-y-4">
            <PushPermissionCard locale={lang} />
            <NotificationPrefsPanel lang={lang} whatsappState={stateOf('whatsapp')} />
          </div>
        );
    }
  };

  return (
    <section className="rounded-2xl bg-app-elevated/60 p-5 ring-1 ring-app-border/40 backdrop-blur-sm md:p-6" data-testid="connections-section" aria-labelledby="connections-title">
      <header className="mb-3">
        <h2 id="connections-title" className="text-base font-semibold tracking-tight md:text-lg">{t.title}</h2>
        <p className="mt-0.5 text-xs text-app-muted md:text-sm">{t.subtitle}</p>
      </header>

      {!data && !failed && <Loader2 size={16} className="text-app-muted motion-safe:animate-spin" aria-label="…" />}
      {!data && failed && (
        <div className="flex items-center justify-between gap-2 text-[13px] text-app-muted" role="alert">
          <span>{t.loadFailed}</span>
          <button type="button" onClick={() => void refresh()} className="inline-flex min-h-[44px] items-center rounded-full px-3 font-semibold text-app-accent">{t.retry}</button>
        </div>
      )}

      {data && (
        <ul className="divide-y divide-app-border/20">
          {data.connections.map((c) => {
            const Icon = ICON[c.id];
            const isOpen = open === c.id;
            const panelId = `conn-panel-${c.id}`;
            return (
              <li key={c.id} id={c.id === 'whatsapp' ? 'whatsapp' : undefined} className="scroll-mt-24" data-testid={`conn-row-${c.id}`} data-state={c.state}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : c.id)}
                  className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-bg/50 text-app-muted" aria-hidden="true"><Icon size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium text-app-text">{t.rows[c.id]}</span>
                    {c.detail && <span className="block text-[12px] tabular-nums text-app-muted">{c.detail}</span>}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${PILL[c.state]}`} data-testid={`conn-state-${c.id}`}>{t.state[c.state]}</span>
                  <ChevronDown size={16} className={`shrink-0 text-app-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {isOpen && <div id={panelId} className="pb-4 pl-12 pr-1" data-testid={`conn-panel-${c.id}`}>{panel(c)}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

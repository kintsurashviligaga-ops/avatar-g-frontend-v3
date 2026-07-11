'use client';

/**
 * NotificationBell (PHASE 3 Task 3) — top-bar bell with an unread badge + a
 * dropdown of the last 5 notifications. Reads /api/notifications (fail-open: shows
 * nothing if the table isn't migrated). Opening the dropdown marks all read.
 * Mobile-first; Georgian default.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
// `link` (optional) lets a notification deep-link to its own asset (e.g. the finished render).
// Backward-safe: absent → falls back to the by-type destination below. Populating it is a
// follow-up in the notification-creation sites (+ a `link` column via migration).
interface Item { id: string; type: string; message: string; read: boolean; created_at: string; link?: string }

// Where a notification leads when tapped: a finished render → Library; a billing
// notice → the dashboard (credits modal lives there). Default → Library.
function notifHref(type: string, locale: string): string {
  if (type === 'credits_low' || type === 'payment') return `/${locale}/dashboard`;
  return `/${locale}/library`;
}

const ICON: Record<string, string> = { video: '🎬', music: '🎵', image: '🖼', credits_low: '⚠️', payment: '✅' };

// When the feed comes from the generation_jobs fallback (no server read-state), the
// badge counts items newer than the last time this device opened the bell.
const LAST_SEEN_KEY = 'myavatar:notif-last-seen';
function readLastSeen(): number { try { return Number(localStorage.getItem(LAST_SEEN_KEY)) || 0; } catch { return 0; } }
function writeLastSeen(ms: number): void { try { localStorage.setItem(LAST_SEEN_KEY, String(ms)); } catch { /* ignore */ } }
function tsOf(iso: string): number { const t = new Date(iso).getTime(); return Number.isFinite(t) ? t : 0; }

function rel(iso: string, lang: Lang): string {
  try {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return lang === 'en' ? 'just now' : lang === 'ru' ? 'только что' : 'ახლახ';
    const m = Math.floor(s / 60); if (m < 60) return lang === 'en' ? `${m}m ago` : lang === 'ru' ? `${m} мин` : `${m} წთ`;
    const h = Math.floor(m / 60); if (h < 24) return lang === 'en' ? `${h}h ago` : lang === 'ru' ? `${h} ч` : `${h} სთ`;
    const d = Math.floor(h / 24); return lang === 'en' ? `${d}d ago` : lang === 'ru' ? `${d} дн` : `${d} დღ`;
  } catch { return ''; }
}

export default function NotificationBell({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const empty = lang === 'en' ? 'No notifications' : lang === 'ru' ? 'Нет уведомлений' : 'შეტყობინებები არ არის';
  const title = lang === 'en' ? 'Notifications' : lang === 'ru' ? 'Уведомления' : 'შეტყობინებები';

  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<'table' | 'fallback'>('table');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return;
      const j = (await r.json()) as { items?: Item[]; unread?: number; source?: string };
      const list = Array.isArray(j.items) ? j.items : [];
      setItems(list);
      if (j.source === 'fallback') {
        // No server read-state — count items newer than this device's last open.
        sourceRef.current = 'fallback';
        const seen = readLastSeen();
        setUnread(list.filter((it) => tsOf(it.created_at) > seen).length);
      } else {
        sourceRef.current = 'table';
        setUnread(typeof j.unread === 'number' ? j.unread : 0);
      }
    } catch { /* fail-soft */ }
  }, []);

  // Initial + light polling so completion/payment notices appear without a reload.
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    const onRefresh = () => void load();
    window.addEventListener('myavatar:notifications-refresh', onRefresh);
    return () => { window.clearInterval(id); window.removeEventListener('myavatar:notifications-refresh', onRefresh); };
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      if (sourceRef.current === 'fallback') {
        // Mark everything currently shown as "seen" on this device.
        const newest = items.reduce((m, it) => Math.max(m, tsOf(it.created_at)), 0);
        writeLastSeen(Math.max(newest, Date.now()));
      } else {
        setItems((prev) => prev.map((it) => ({ ...it, read: true })));
        try { await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' }); } catch { /* fail-soft */ }
      }
    }
  }, [open, unread, items]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-label={title}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-app-text transition-colors hover:bg-app-elevated touch-manipulation sm:h-9 sm:w-9">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-app-accent px-1 text-[9.5px] font-bold leading-none text-app-bg">
            {/* PHASE 7.2 — a soft pulse ring draws the eye to a new notification; gated to
                motion-safe so prefers-reduced-motion users get a static badge. */}
            <span className="absolute inset-0 -z-10 rounded-full bg-app-accent/60 motion-safe:animate-ping" aria-hidden="true" />
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[80] mt-2 w-[290px] max-w-[88vw] overflow-hidden rounded-2xl border border-app-border/15 bg-app-surface shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]">
          <div className="border-b border-app-border/10 px-4 py-2.5 text-[12.5px] font-semibold text-app-text">{title}</div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12.5px] text-app-muted">{empty}</div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((it) => (
                <li key={it.id} className="border-b border-app-border/10 last:border-0">
                  <button type="button"
                    onClick={() => { setOpen(false); router.push(it.link || notifHref(it.type, locale)); }}
                    className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-app-elevated active:scale-[0.99]">
                    <span className="mt-0.5 text-[15px]">{ICON[it.type] ?? '🔔'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] leading-snug text-app-text">{it.message}</span>
                      <span className="mt-0.5 block text-[10.5px] text-app-muted">{rel(it.created_at, lang)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

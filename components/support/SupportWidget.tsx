'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import type { SupportMessage } from '@/types/support';

/**
 * The floating support chat.
 *
 * ⚠️ MESSAGE BODIES ARE RENDERED AS TEXT — `{m.body}` and nothing else. No dangerouslySetInnerHTML, no
 * markdown renderer, no auto-linkifier, ever. The user's half of this transcript is written by a stranger
 * and read by an ADMIN in the panel that adjusts balances, so stored XSS here would be privilege
 * escalation rather than defacement. React escapes by default; the only job is to not undo that.
 *
 * ⚠️ PLACEMENT. z-[150] sits ABOVE page content but BELOW the modals (110-113 are the billing/legal
 * dialogs, which must cover it) and below the mobile bottom nav (z-[200]) — and `bottom` is offset to
 * clear that nav rather than sitting on top of it. SupportWidgetMount decides whether it renders at all.
 */

const T = {
  ka: {
    open: 'დახმარება', title: 'მხარდაჭერა',
    intro: 'დაწერე შენი კითხვა — ვნახავთ და გიპასუხებთ.',
    ph: 'აღწერე პრობლემა…', send: 'გაგზავნა', close: 'დახურვა',
    signin: 'დასაწერად გაიარე ავტორიზაცია.',
    failed: 'ვერ გაიგზავნა — სცადე თავიდან.',
    you: 'შენ', team: 'მხარდაჭერა',
  },
  en: {
    open: 'Help', title: 'Support',
    intro: 'Write your question — we read every message and reply.',
    ph: 'Describe the problem…', send: 'Send', close: 'Close',
    signin: 'Please sign in to write to us.',
    failed: 'Could not send — please try again.',
    you: 'You', team: 'Support',
  },
  ru: {
    open: 'Помощь', title: 'Поддержка',
    intro: 'Напишите вопрос — мы читаем всё и отвечаем.',
    ph: 'Опишите проблему…', send: 'Отправить', close: 'Закрыть',
    signin: 'Войдите, чтобы написать нам.',
    failed: 'Не отправлено — попробуйте снова.',
    you: 'Вы', team: 'Поддержка',
  },
} as const;

type Lang = keyof typeof T;

export function SupportWidget({ locale, bottomOffset }: { locale: string; bottomOffset: number }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'anon' | 'error'>('idle');
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/support/chat', { cache: 'no-store' });
      if (res.status === 401) { setState('anon'); return; }
      if (!res.ok) { setState('error'); return; }
      const j = (await res.json()) as { chat?: { unread_for_user?: number }; messages?: SupportMessage[] };
      setMessages(j.messages ?? []);
      setUnread(j.chat?.unread_for_user ?? 0);
      setState('idle');
    } catch { setState('error'); }
  }, []);

  // Poll only while OPEN — a closed widget must not cost a request every few seconds on every page.
  // The unread badge is refreshed on a much slower beat below.
  useEffect(() => {
    if (!open) return;
    void load();
    const id = setInterval(() => { void load(); }, 8000);
    return () => clearInterval(id);
  }, [open, load]);

  // Badge heartbeat while closed: cheap, and it is what makes a reply noticeable at all.
  useEffect(() => {
    if (open) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/support/chat', { cache: 'no-store' });
        if (!alive || !res.ok) return;
        const j = (await res.json()) as { chat?: { unread_for_user?: number } };
        setUnread(j.chat?.unread_for_user ?? 0);
      } catch { /* offline — the badge simply does not move */ }
    };
    const id = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [open]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, open]);

  // Opening IS reading.
  useEffect(() => {
    if (!open || unread === 0) return;
    setUnread(0);
    void fetch('/api/support/chat/read', { method: 'POST' }).catch(() => {});
  }, [open, unread]);

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setDraft('');
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      });
      if (res.status === 401) { setState('anon'); setDraft(body); return; }
      if (!res.ok) { setState('error'); setDraft(body); return; }
      const j = (await res.json()) as { message?: SupportMessage };
      if (j.message) setMessages((m) => [...m, j.message!]);
      setState('idle');
    } catch { setState('error'); setDraft(body); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.open}
        className="fixed right-4 z-[150] flex h-14 w-14 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-[0_10px_30px_-8px_rgba(6,182,212,0.65)] transition hover:scale-105 active:scale-95"
        style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` }}
      >
        <MessageCircle size={22} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed right-4 z-[150] flex w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-app-border/15 bg-app-surface shadow-[0_24px_70px_-20px_rgba(0,0,0,0.65)]"
      style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`, maxHeight: 'min(70svh, 560px)' }}
      role="dialog"
      aria-label={t.title}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-app-border/10 px-4 py-3">
        <span className="text-[14px] font-bold text-app-text">{t.title}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label={t.close}
          className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition hover:bg-app-elevated hover:text-app-text">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3.5">
        {state === 'loading' && messages.length === 0 && (
          <div className="flex justify-center py-6 text-app-muted"><Loader2 size={18} className="animate-spin" /></div>
        )}
        {state === 'anon' && <p className="py-6 text-center text-[13px] text-app-muted">{t.signin}</p>}
        {state !== 'anon' && messages.length === 0 && state !== 'loading' && (
          <p className="py-6 text-center text-[13px] leading-relaxed text-app-muted">{t.intro}</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.sender === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-app-accent/15 text-app-text ring-1 ring-app-accent/25'
                  : 'bg-app-elevated text-app-text ring-1 ring-app-border/10'
              }`}
            >
              {/* Rendered as TEXT. See the file header — this string is read by an admin. */}
              <span className="whitespace-pre-wrap break-words">{m.body}</span>
            </div>
          </div>
        ))}
        {state === 'error' && <p className="text-center text-[12px] text-rose-400">{t.failed}</p>}
        <div ref={endRef} />
      </div>

      {state !== 'anon' && (
        <div className="flex shrink-0 items-end gap-2 border-t border-app-border/10 px-3 py-2.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={1}
            maxLength={4000}
            placeholder={t.ph}
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl bg-app-elevated px-3 py-2.5 text-[13.5px] !text-app-text outline-none ring-1 ring-app-border/10 placeholder:text-app-muted focus:ring-app-accent/40"
          />
          <button
            type="button" onClick={() => void send()} disabled={busy || !draft.trim()} aria-label={t.send}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-app-accent text-app-bg transition disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      )}
    </div>
  );
}

export default SupportWidget;

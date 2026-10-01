'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { SupportMessage } from '@/types/support';

/**
 * The user's side of the support chat, inline on /{lang}/support. The admin answers in Admin → Support
 * (components/admin/SupportInbox.tsx → /api/admin/support/chats/[id]/reply); this is where the user reads it.
 *
 * ⚠️ THIS WAS THE FLOATING SUPPORT BUBBLE. It was deleted with the old shell on 2026-10-01, which silently cut the
 * channel: the admin inbox kept accepting replies nobody could read, and no one could start a chat. The bubble stays
 * gone (it sat on the old shell's bottom nav); the transcript lives on the support page, which the settings drawer's
 * „დახმარება" row opens.
 *
 * ⚠️ MESSAGE BODIES ARE RENDERED AS TEXT — `{m.body}` and nothing else. No dangerouslySetInnerHTML, no markdown
 * renderer, no auto-linkifier, ever. The user's half of this transcript is written by a stranger and read by an ADMIN
 * in the panel that adjusts balances, so stored XSS here would be privilege escalation rather than defacement.
 */

const T = {
  ka: {
    title: 'მოგვწერე', intro: 'დაწერე შენი კითხვა — ვნახავთ და გიპასუხებთ აქვე.',
    ph: 'აღწერე პრობლემა…', send: 'გაგზავნა', signin: 'დასაწერად გაიარე ავტორიზაცია.',
    failed: 'ვერ გაიგზავნა — სცადე თავიდან.',
  },
  en: {
    title: 'Write to us', intro: 'Write your question — we read every message and reply right here.',
    ph: 'Describe the problem…', send: 'Send', signin: 'Please sign in to write to us.',
    failed: 'Could not send — please try again.',
  },
  ru: {
    title: 'Напишите нам', intro: 'Напишите вопрос — мы читаем всё и отвечаем прямо здесь.',
    ph: 'Опишите проблему…', send: 'Отправить', signin: 'Войдите, чтобы написать нам.',
    failed: 'Не отправлено — попробуйте снова.',
  },
} as const;

type Lang = keyof typeof T;

export function SupportChat({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'anon' | 'error'>('loading');
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
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

  // Poll while the page is visible — a reply should appear without a reload, and a background tab costs nothing.
  useEffect(() => {
    void load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 8000);
    return () => clearInterval(id);
  }, [load]);

  // The thread is on screen, so seeing it IS reading it.
  useEffect(() => {
    if (unread === 0) return;
    setUnread(0);
    void fetch('/api/support/chat/read', { method: 'POST' }).catch(() => {});
  }, [unread]);

  // Keep the newest message in view — inside the thread only, never scrolling the page.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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

  return (
    <div data-testid="support-chat" className="flex flex-col overflow-hidden rounded-xl border border-app-border/15 bg-app-surface">
      <div className="border-b border-app-border/10 px-4 py-3 text-[14px] font-semibold text-app-text">{t.title}</div>

      <div ref={listRef} className="max-h-[360px] min-h-[120px] space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3.5">
        {state === 'loading' && messages.length === 0 && (
          <div className="flex justify-center py-6 text-app-muted"><Loader2 size={18} className="animate-spin" /></div>
        )}
        {state === 'anon' && <p className="py-6 text-center text-[13px] text-app-muted">{t.signin}</p>}
        {state !== 'anon' && state !== 'loading' && messages.length === 0 && (
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
        {state === 'error' && <p className="text-center text-[12px] text-app-danger">{t.failed}</p>}
      </div>

      {state !== 'anon' && (
        <div className="flex items-end gap-2 border-t border-app-border/10 px-3 py-2.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={1}
            maxLength={4000}
            placeholder={t.ph}
            aria-label={t.ph}
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

export default SupportChat;

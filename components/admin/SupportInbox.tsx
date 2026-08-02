'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Check, Inbox } from 'lucide-react';
import type { SupportChatWithUser, SupportMessage } from '@/types/support';

/**
 * The support inbox: chat list on the left, transcript + reply box on the right.
 *
 * ⚠️ USER MESSAGES ARE RENDERED AS TEXT. This panel is the highest-privilege screen in the product — it
 * sits beside the controls that adjust balances — and the left half of every transcript was typed by a
 * stranger. `{m.body}` only: no dangerouslySetInnerHTML, no markdown, no linkify. Stored XSS here is
 * privilege escalation, not defacement.
 *
 * Polling, not Realtime: this panel is only mounted while an admin is looking at it, so a 10s poll costs
 * nothing when nobody is watching and needs no subscription lifecycle to get wrong. The user's widget is
 * the side that benefits from a push.
 */

const STATUSES = [
  { id: 'open', label: 'ღია' },
  { id: 'pending', label: 'მოლოდინში' },
  { id: 'closed', label: 'დახურული' },
  { id: 'all', label: 'ყველა' },
] as const;

type StatusFilter = (typeof STATUSES)[number]['id'];

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'ახლა';
  if (m < 60) return `${m} წთ`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} სთ`;
  return `${Math.floor(h / 24)} დღე`;
}

export function SupportInbox() {
  const [filter, setFilter] = useState<StatusFilter>('open');
  const [chats, setChats] = useState<SupportChatWithUser[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/support/chats?status=${filter}`, { cache: 'no-store' });
      if (!res.ok) return;
      const j = (await res.json()) as { chats?: SupportChatWithUser[]; degraded?: boolean };
      setChats(j.chats ?? []);
      setDegraded(!!j.degraded);
    } finally { setLoading(false); }
  }, [filter]);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/support/chats/${id}`, { cache: 'no-store' });
    if (!res.ok) return;
    const j = (await res.json()) as { messages?: SupportMessage[] };
    setMessages(j.messages ?? []);
  }, []);

  useEffect(() => { void loadList(); const t = setInterval(() => void loadList(), 10_000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => { if (!selected) return; void loadThread(selected); const t = setInterval(() => void loadThread(selected), 10_000); return () => clearInterval(t); }, [selected, loadThread]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const reply = async () => {
    const body = draft.trim();
    if (!body || !selected || busy) return;
    setBusy(true); setDraft('');
    try {
      const res = await fetch(`/api/admin/support/chats/${selected}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      });
      if (!res.ok) { setDraft(body); return; }
      const j = (await res.json()) as { message?: SupportMessage };
      if (j.message) setMessages((m) => [...m, j.message!]);
      void loadList();
    } catch { setDraft(body); }
    finally { setBusy(false); }
  };

  const setStatus = async (status: 'open' | 'pending' | 'closed') => {
    if (!selected) return;
    await fetch(`/api/admin/support/chats/${selected}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }).catch(() => {});
    void loadList();
  };

  const active = chats.find((c) => c.id === selected) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* ── list ── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button key={s.id} type="button" onClick={() => setFilter(s.id)}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition ${
                filter === s.id ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/50 hover:bg-white/5'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {degraded && (
          <p className="mb-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-300">
            ცხრილები ჯერ არ არსებობს — გაუშვი მიგრაცია <code>20260802_support_live_chat.sql</code> Supabase-ის SQL რედაქტორში.
          </p>
        )}

        {loading && <div className="flex justify-center py-8 text-white/30"><Loader2 size={18} className="animate-spin" /></div>}
        {!loading && chats.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-white/30">
            <Inbox size={22} /><span className="text-[12px]">შეტყობინებები არ არის</span>
          </div>
        )}

        <ul className="space-y-1">
          {chats.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setSelected(c.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                  selected === c.id ? 'bg-cyan-500/10 ring-1 ring-cyan-400/25' : 'hover:bg-white/5'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-semibold text-white/90">{c.email ?? c.user_id.slice(0, 8)}</span>
                  <span className="shrink-0 text-[10.5px] text-white/35">{relTime(c.last_message_at)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  {/* Preview is plain text from the DB — same no-HTML rule as the transcript. */}
                  <span className="truncate text-[11.5px] text-white/45">{c.last_message_preview ?? '—'}</span>
                  {c.unread_for_admin > 0 && (
                    <span className="ml-auto flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {c.unread_for_admin}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ── transcript ── */}
      <div className="flex min-h-[420px] flex-col rounded-xl border border-white/10 bg-white/[0.03]">
        {!active && <div className="flex flex-1 items-center justify-center text-[12.5px] text-white/30">აირჩიე მიმოწერა</div>}
        {active && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-white/90">{active.email ?? active.user_id}</div>
                <div className="text-[11px] text-white/40">{active.message_count} შეტყობინება · {active.status}</div>
              </div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => void setStatus('pending')}
                  className="rounded-lg bg-white/5 px-2.5 py-1 text-[11.5px] text-white/60 hover:bg-white/10">მოლოდინში</button>
                <button type="button" onClick={() => void setStatus('closed')}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11.5px] text-emerald-300 hover:bg-emerald-500/25">
                  <Check size={12} /> დახურვა
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3.5" style={{ maxHeight: '46vh' }}>
              {messages.map((m) => (
                <div key={m.id} className={m.sender === 'admin' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                    m.sender === 'admin' ? 'bg-cyan-500/15 text-white/90 ring-1 ring-cyan-400/25' : 'bg-white/[0.06] text-white/85'}`}>
                    {/* TEXT. See the file header. */}
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="flex items-end gap-2 border-t border-white/10 px-3 py-2.5">
              <textarea
                value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={4000}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void reply(); } }}
                placeholder="პასუხი…"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl bg-white/[0.06] px-3 py-2.5 text-[13px] !text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-cyan-400/40"
              />
              <button type="button" onClick={() => void reply()} disabled={busy || !draft.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-black transition disabled:opacity-40">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SupportInbox;

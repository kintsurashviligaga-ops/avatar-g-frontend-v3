'use client';

/**
 * ApprovalCenter — every yes Agent G is waiting for, in one list (v5.1 Phase 7 / M-7, mocked data). Each card says what
 * a yes allows (scope), what it costs, why it needs a tap and when it expires. Sensitive actions (passwords, payments,
 * buy, send, delete: GG 12:34Z) are marked and always need this explicit tap; nothing approves itself. Answered and
 * expired approvals stay below, greyed, so the user can see what was allowed.
 */
import { useEffect, useState } from 'react';
import { CreditCard, Globe, ShieldAlert, Sparkles } from 'lucide-react';
import { approvalList, clockText, type ApprovalView, type WorkspaceState } from '@/lib/agent/liveWorkspace/model';
import type { Words } from './labels';

const KIND_ICON = { spend: Sparkles, external: Globe, sensitive: ShieldAlert } as const;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function ApprovalCard({ a, w, now, onAnswer }: { a: ApprovalView; w: Words; now: number; onAnswer?: (id: string, ans: 'approved' | 'declined') => void }) {
  const Icon = KIND_ICON[a.kind];
  const pending = a.state === 'pending';
  const sensitive = a.kind === 'sensitive';
  return (
    <li data-testid="approval-card" data-approval={a.id} data-state={a.state} data-kind={a.kind}
      className={`rounded-2xl border p-3.5 ${pending ? (sensitive ? 'border-app-warning/50 bg-app-warning/[0.06]' : 'border-app-accent/30 bg-app-accent/[0.05]') : 'border-app-border/15 bg-app-elevated/30 opacity-70'}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${sensitive ? 'bg-app-warning/15 text-app-warning' : 'bg-app-accent/15 text-app-accent'}`}>
          <Icon size={14} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-app-muted">{w.kind[a.kind]}</p>
          <p className="text-[14px] font-semibold leading-snug text-app-text">{a.title}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-app-text/80">{a.scope}</p>
          <p className={`mt-1 text-[12px] leading-snug ${sensitive ? 'text-app-warning' : 'text-app-muted'}`}>{a.reason}</p>
          <p className="mt-1.5 flex flex-wrap gap-x-2 text-[12px] text-app-muted">
            <span className="inline-flex items-center gap-1 tabular-nums">
              {a.credits !== null ? <>✦{a.credits}</> : <><CreditCard size={11} aria-hidden="true" />{w.noCredits}</>}
            </span>
            {pending ? <><span aria-hidden="true">·</span><span className="tabular-nums">{w.expiresIn(clockText(a.expiresAt - now))}</span></> : <><span aria-hidden="true">·</span><span>{w.answered[a.state as 'approved' | 'declined' | 'expired']}</span></>}
          </p>
        </div>
      </div>
      {pending && onAnswer ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" data-testid="approval-approve" onClick={() => onAnswer(a.id, 'approved')}
            className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-full bg-app-accent px-4 text-[14px] font-semibold text-white hover:bg-app-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 sm:flex-none">
            {w.approve}{a.credits !== null ? ` · ✦${a.credits}` : ''}
          </button>
          <button type="button" data-testid="approval-decline" onClick={() => onAnswer(a.id, 'declined')}
            className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-full border border-app-border/30 px-4 text-[14px] text-app-text hover:bg-app-border/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50 sm:flex-none">
            {w.decline}
          </button>
          {sensitive ? <p className="basis-full text-[11.5px] text-app-muted">{w.tapToAllow}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export function ApprovalCenter({ state, w, onAnswer, headingOnPhone = true }: { state: WorkspaceState; w: Words; onAnswer?: (id: string, ans: 'approved' | 'declined') => void; /** false when a tab above already names the list (the workspace on a phone). */ headingOnPhone?: boolean }) {
  const hasPending = Object.values(state.approvals).some((a) => a.state === 'pending');
  const now = useNow(hasPending);
  const list = approvalList(state, now);
  const pending = list.filter((a) => a.state === 'pending').length;
  return (
    <section data-testid="approval-center" aria-label={w.approvals} className="w-full">
      <h2 className={`mb-2 items-center ${headingOnPhone ? "flex" : "hidden lg:flex"} gap-2 text-[13px] font-semibold text-app-text`}>
        {w.approvals}
        {pending ? <span data-testid="approval-count" className="rounded-full bg-app-warning px-1.5 text-[11px] font-bold leading-[18px] text-black">{pending}</span> : null}
      </h2>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-app-border/25 px-4 py-6 text-center text-[13px] text-app-muted">{w.noApprovals}</p>
      ) : (
        <ul className="flex flex-col gap-2.5" aria-live="polite">
          {list.map((a) => <ApprovalCard key={a.id} a={a} w={w} now={now} onAnswer={onAnswer} />)}
        </ul>
      )}
    </section>
  );
}

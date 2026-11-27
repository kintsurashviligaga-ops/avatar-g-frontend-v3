'use client';

/**
 * LiveWorkspace — the Live Agent Workspace (v5.1 Phase 7; PREPARED, MOCKED, NOT WIRED). Runs on the left, the approval
 * center on the right; on a phone, two tabs with the pending count on "Approvals". Today it replays lib/agent/liveWorkspace
 * /mock on a timer (nothing runs, nothing is spent); later the same components draw GET /api/runs/:id/stream.
 */
import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { mockScript } from '@/lib/agent/liveWorkspace/mock';
import { answer, cancel, pause, resume, start, tick, type Player } from '@/lib/agent/liveWorkspace/player';
import { ApprovalCenter } from './ApprovalCenter';
import { RunTimeline } from './RunTimeline';
import { WORDS, langOf } from './labels';

export function useMockWorkspace(locale: string, autoplay = true) {
  const lang = langOf(locale) === 'ka' ? 'ka' : 'en';
  const make = useCallback(() => start(mockScript(lang, Date.now()), Date.now()), [lang]);
  const [p, setP] = useState<Player>(make);
  useEffect(() => {
    if (!autoplay) return;
    const t = setInterval(() => setP((cur) => tick(cur, Date.now())), 200);
    return () => clearInterval(t);
  }, [autoplay]);
  return {
    state: p.state,
    answer: (id: string, ans: 'approved' | 'declined') => setP((cur) => answer(cur, id, ans, Date.now())),
    pause: (runId: string) => setP((cur) => pause(cur, runId, Date.now())),
    resume: (runId: string) => setP((cur) => resume(cur, runId, Date.now())),
    cancel: (runId: string) => setP((cur) => cancel(cur, runId, Date.now())),
    restart: () => setP(make()),
  };
}

export function LiveWorkspace({ locale }: { locale: string }) {
  const w = WORDS[langOf(locale)];
  const ws = useMockWorkspace(locale);
  const [tab, setTab] = useState<'runs' | 'approvals'>('runs');
  // Same rule as the approval center: a pending approval past its time no longer counts.
  const now = Date.now();
  const pending = Object.values(ws.state.approvals).filter((a) => a.state === 'pending' && a.expiresAt > now).length;
  const runs = ws.state.order.map((id) => ws.state.runs[id]!).filter(Boolean);

  return (
    <div data-testid="live-workspace" className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-app-text">{w.title}</h1>
          <p className="text-[13px] text-app-muted">{w.subtitle}</p>
        </div>
        <button type="button" onClick={ws.restart} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-border/25 px-3 text-[13px] text-app-text hover:bg-app-border/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50">
          <RotateCcw size={13} aria-hidden="true" />{w.restart}
        </button>
        <p role="note" data-testid="mock-banner" className="basis-full rounded-xl bg-app-warning/10 px-3 py-2 text-[12px] text-app-warning">{w.mock}</p>
      </header>

      {/* Phone: two tabs. Desktop: both columns, the tabs hidden. */}
      <div role="tablist" aria-label={w.title} className="mb-3 flex gap-1 rounded-full bg-app-elevated/60 p-1 lg:hidden">
        {(['runs', 'approvals'] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium ${tab === k ? 'bg-app-surface text-app-text shadow-sm' : 'text-app-muted'}`}>
            {k === 'runs' ? w.runs : w.approvals}
            {k === 'approvals' && pending ? <span className="rounded-full bg-app-warning px-1.5 text-[11px] font-bold leading-[18px] text-black">{pending}</span> : null}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label={w.runs} className={`${tab === 'runs' ? 'flex' : 'hidden'} min-w-0 flex-col gap-3 lg:flex`}>
          <h2 className="hidden text-[13px] font-semibold text-app-text lg:block">{w.runs}</h2>
          {runs.length === 0 ? <p className="rounded-2xl border border-dashed border-app-border/25 px-4 py-6 text-center text-[13px] text-app-muted">{w.noRuns}</p> : null}
          {runs.map((r) => (
            <RunTimeline key={r.id} run={r} w={w} onPause={() => ws.pause(r.id)} onResume={() => ws.resume(r.id)} onCancel={() => ws.cancel(r.id)} />
          ))}
        </section>
        <aside className={`${tab === 'approvals' ? 'block' : 'hidden'} lg:block`}>
          <div className="lg:sticky lg:top-4">
            <ApprovalCenter state={ws.state} w={w} onAnswer={ws.answer} headingOnPhone={false} />
          </div>
        </aside>
      </div>
    </div>
  );
}

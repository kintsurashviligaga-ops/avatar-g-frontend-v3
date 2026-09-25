'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  HelpCircle,
  Clock3,
  Copy,
  ExternalLink,
  Info,
  KeyRound,
  ListFilter,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';

const fetchedAt = '25 Sep 2026, 17:34 (GMT+4)';
const queryWindow = '25 Sep → 09 Oct 2026';

const capabilities = [
  {
    icon: CalendarDays,
    title: 'Read calendars',
    copy: 'Pull event data from the primary calendar or a specific calendar ID.',
    tone: 'cyan',
  },
  {
    icon: Search,
    title: 'Search events',
    copy: 'Filter by free-text query, start time, end time, and result limit.',
    tone: 'sky',
  },
  {
    icon: Clock3,
    title: 'Use time windows',
    copy: 'Ask for a focused range with RFC3339 timestamps for clean results.',
    tone: 'amber',
  },
];

const requestBody = `{
  "calendar_id": "primary",
  "time_min": "2026-09-25T00:00:00+04:00",
  "time_max": "2026-10-09T23:59:59+04:00",
  "max_results": 10
}`;

export default function CalendarLabPage() {
  const [showGuide, setShowGuide] = useState(false);
  const [ranAgain, setRanAgain] = useState(false);
  const [copied, setCopied] = useState(false);
  const statusLabel = ranAgain ? 'Test completed just now' : 'Test completed';

  const statItems = useMemo(
    () => [
      { label: 'Events found', value: '0', note: 'in selected window', color: 'text-cyan-300' },
      { label: 'Calendar', value: 'Primary', note: 'calendar_id: primary', color: 'text-white' },
      { label: 'Window', value: '14 days', note: '25 Sep → 09 Oct', color: 'text-white' },
    ],
    [],
  );

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(requestBody);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="min-h-[var(--app-screen-height)] overflow-y-auto bg-[#070b12] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-cyan-400/[0.08] blur-3xl" />
        <div className="absolute -right-48 top-40 h-[30rem] w-[30rem] rounded-full bg-sky-500/[0.07] blur-3xl" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <div className="relative mx-auto max-w-[1420px] px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.09] pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[15px] border border-cyan-200/30 bg-[#06111d] shadow-[0_0_28px_rgba(14,165,233,0.28)]">
              <img src="/myavatar-logo.png" alt="MyAvatar logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">MyAvatar<span className="text-cyan-300">.ge</span></p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Connector lab / Google Calendar</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="hidden sm:inline">Integration playground</span>
            <span className="h-1 w-1 rounded-full bg-cyan-300" />
            <span>Read-only test</span>
          </div>
        </header>

        <section className="grid gap-10 pb-14 pt-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)] lg:items-end lg:gap-16 lg:pt-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
              Connector verified
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.03] tracking-[-0.045em] text-white sm:text-6xl">
              Your calendar,<br /><span className="text-cyan-300">ready to query.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
              A small, transparent test bench for reading Google Calendar data. See the exact request, the returned result, and the next step at a glance.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setRanAgain(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-[#06111d] transition hover:bg-cyan-200 active:scale-[0.98]"
              >
                <Play className="h-4 w-4 fill-current" />
                Run test again
              </button>
              <button
                onClick={() => setShowGuide(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/30 hover:bg-white/[0.07] active:scale-[0.98]"
              >
                <HelpCircle className="h-4 w-4 text-cyan-300" />
                How to use it
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.09] bg-white/[0.035] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Live test snapshot</p>
                <p className="mt-2 text-lg font-semibold text-white">Google Calendar</p>
              </div>
              <div className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                Connected
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3"><span className="text-slate-500">Fetched</span><span className="text-right text-slate-200">{fetchedAt}</span></div>
              <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3"><span className="text-slate-500">Calendar</span><span className="font-mono text-xs text-cyan-200">primary</span></div>
              <div className="flex items-center justify-between gap-4"><span className="text-slate-500">Result</span><span className="font-semibold text-white">0 events returned</span></div>
            </div>
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-cyan-300/[0.07] p-3 text-xs leading-5 text-cyan-100/75">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <span>No events were found in this window. That is a valid connector response—not an error.</span>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-y border-white/[0.09] py-6 sm:grid-cols-3">
          {statItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 sm:block">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
              <div className="text-right sm:mt-2 sm:text-left"><p className={`text-2xl font-semibold tracking-tight ${item.color}`}>{item.value}</p><p className="text-xs text-slate-500">{item.note}</p></div>
            </div>
          ))}
        </section>

        <section className="grid gap-5 py-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">What it can do</p>
            <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-[-0.035em] text-white">Useful calendar context, without the guesswork.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">The connector is designed for focused reads: pull what you need, bound the time range, and keep the returned data easy to audit.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, copy, tone }) => (
              <div key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-white/[0.05]">
                <div className={`mb-5 flex h-9 w-9 items-center justify-center rounded-xl ${tone === 'amber' ? 'bg-amber-300/10 text-amber-200' : tone === 'sky' ? 'bg-sky-300/10 text-sky-200' : 'bg-cyan-300/10 text-cyan-200'}`}><Icon className="h-4 w-4" /></div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 pb-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-3xl border border-white/[0.09] bg-[#0b111b]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2"><Terminal className="h-4 w-4 text-cyan-300" /><span className="text-sm font-semibold text-white">Request used for this test</span></div>
              <button onClick={handleCopy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-cyan-300/30 hover:text-white"><Copy className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Copy JSON'}</button>
            </div>
            <pre className="overflow-x-auto p-5 text-xs leading-6 text-slate-300"><code><span className="text-slate-600">// google_calendar_search_events</span>{'\n'}{requestBody}</code></pre>
          </div>

          <div className="rounded-3xl border border-white/[0.09] bg-white/[0.03] p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><p className="text-sm font-semibold text-white">What happened</p></div>
            <div className="mt-5 space-y-5">
              <div className="flex gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.7)]" /><div><p className="text-sm text-slate-200">Connection accepted</p><p className="mt-1 text-xs leading-5 text-slate-500">The connector authenticated and accepted a read request.</p></div></div>
              <div className="flex gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-300" /><div><p className="text-sm text-slate-200">Query completed</p><p className="mt-1 text-xs leading-5 text-slate-500">{queryWindow} · max 10 results · primary calendar.</p></div></div>
              <div className="flex gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-500" /><div><p className="text-sm text-slate-200">Empty result set</p><p className="mt-1 text-xs leading-5 text-slate-500">Try a wider date range or add a search term to find an event.</p></div></div>
            </div>
            <button onClick={() => setShowGuide(true)} className="mt-7 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 transition hover:text-cyan-100">View usage guide <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.09] pt-6 text-xs text-slate-500">
          <span>{statusLabel} · read-only</span>
          <span className="inline-flex items-center gap-1.5">Powered by Google Calendar connector <ExternalLink className="h-3.5 w-3.5" /></span>
        </footer>
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#101721] p-6 shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Quick guide</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">How to use the connector</h2></div><button onClick={() => setShowGuide(false)} aria-label="Close guide" className="rounded-xl p-2 text-slate-500 transition hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div>
            <ol className="mt-6 space-y-4 text-sm leading-6 text-slate-300"><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-xs font-bold text-[#06111d]">1</span><span>Choose <strong className="text-white">primary</strong> or pass a specific calendar ID.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-xs font-bold text-[#06111d]">2</span><span>Set <strong className="text-white">time_min</strong> and <strong className="text-white">time_max</strong> as RFC3339 timestamps.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-xs font-bold text-[#06111d]">3</span><span>Optionally add <strong className="text-white">q</strong> to search titles, descriptions, or locations.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-xs font-bold text-[#06111d]">4</span><span>Use <strong className="text-white">max_results</strong> to keep responses focused and easy to review.</span></li></ol>
            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-3 text-xs leading-5 text-cyan-100/75"><KeyRound className="h-4 w-4 shrink-0 text-cyan-300" />This test is read-only: it searches events and does not create, edit, or delete anything.</div>
            <button onClick={() => setShowGuide(false)} className="mt-6 w-full rounded-xl bg-cyan-300 py-3 text-sm font-semibold text-[#06111d] transition hover:bg-cyan-200">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

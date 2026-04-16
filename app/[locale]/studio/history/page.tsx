'use client';

/**
 * /studio/history
 *
 * Displays the last 20 AI generation results from the persisted store.
 *
 * Features:
 *   • Filter by agent (all / avatar / image / video / music / copy)
 *   • Credit timeline bar chart (visual spend per agent)
 *   • Per-entry: copy result, re-run (navigates back to agent page with prompt pre-seeded via URL)
 *   • Empty state
 *   • Clear all history with confirmation
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  Zap,
  UserCircle2,
  ImageIcon,
  Film,
  Music2,
  FileText,
  BarChart2,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button }     from '@/components/ui/button';
import { CreditBadge } from '@/components/ui/CreditBadge';
import {
  useAiPipelineStore,
  selectHistory,
  selectAnalytics,
  type AgentType,
  type HistoryEntry,
  AGENT_COSTS,
} from '@/store/useAiPipelineStore';

// ─── Agent metadata ───────────────────────────────────────────────────────────

const AGENT_META: Record<AgentType, {
  label:    string;
  icon:     React.ReactNode;
  gradient: string;
  href:     string;
}> = {
  avatar : { label: 'Avatar',    icon: <UserCircle2 size={14} />, gradient: 'from-cyan-500 to-blue-600',      href: '/studio/avatar' },
  image  : { label: 'Image',     icon: <ImageIcon   size={14} />, gradient: 'from-violet-500 to-fuchsia-600', href: '/studio/image'  },
  video  : { label: 'Video',     icon: <Film        size={14} />, gradient: 'from-rose-500 to-orange-500',    href: '/studio/video'  },
  music  : { label: 'Music',     icon: <Music2      size={14} />, gradient: 'from-emerald-500 to-teal-600',   href: '/studio/music'  },
  copy   : { label: 'Copy/SEO',  icon: <FileText    size={14} />, gradient: 'from-amber-500 to-yellow-500',   href: '/studio/copy'   },
};

type FilterAgent = AgentType | 'all';
const FILTER_OPTIONS: FilterAgent[] = ['all', 'avatar', 'image', 'video', 'music', 'copy'];

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 py-1 text-xs text-white/55 transition-all hover:border-white/[0.18] hover:text-white/90"
    >
      {copied
        ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</>
        : <><Copy className="h-3 w-3" /> {label}</>
      }
    </button>
  );
}

// ─── Analytics bar chart ──────────────────────────────────────────────────────

function CreditChart() {
  const analytics = useAiPipelineStore(selectAnalytics);
  const maxCalls  = Math.max(1, ...Object.values(analytics.callsPerAgent));

  return (
    <div className="rounded-2xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-cyan-400/70" />
          <span className="text-sm font-semibold text-white/70">Usage Summary</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/35">
          <Zap className="h-3 w-3 text-cyan-400/50" />
          {analytics.totalCreditsSpent} credits spent
        </div>
      </div>

      <div className="space-y-2.5">
        {(Object.entries(analytics.callsPerAgent) as [AgentType, number][]).map(([agent, calls]) => {
          const meta = AGENT_META[agent];
          const pct  = calls === 0 ? 0 : Math.round((calls / maxCalls) * 100);
          const spent = calls * AGENT_COSTS[agent];

          return (
            <div key={agent} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white/55">
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br ${meta.gradient} text-white`}>
                    {meta.icon}
                  </span>
                  {meta.label}
                </span>
                <span className="text-white/35">
                  {calls} run{calls !== 1 ? 's' : ''} · {spent} cr
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className={`h-full rounded-full bg-gradient-to-r ${meta.gradient}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {analytics.totalExecutionMs > 0 && (
        <p className="text-[11px] text-white/25 text-right">
          Avg {Math.round(analytics.totalExecutionMs / Math.max(1, Object.values(analytics.callsPerAgent).reduce((a, b) => a + b, 0)) / 1000 * 10) / 10}s per call
        </p>
      )}
    </div>
  );
}

// ─── History entry card ───────────────────────────────────────────────────────

function HistoryCard({ entry, index }: { entry: HistoryEntry; index: number }) {
  const router  = useRouter();
  const meta    = AGENT_META[entry.agent];
  const date    = new Date(entry.createdAt);
  const timeStr = date.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // Re-run: navigate to the agent page with the prompt pre-filled via query param
  const handleRerun = () => {
    const url = new URL(meta.href, window.location.origin);
    url.searchParams.set('prompt', entry.prompt);
    router.push(url.pathname + url.search);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="rounded-2xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(12,22,46,0.85),rgba(7,14,32,0.78))] backdrop-blur-xl overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.35)]"
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white',
              meta.gradient
            )}
          >
            {meta.icon}
          </div>
          <span className="text-xs font-semibold text-white/70">{meta.label}</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] text-white/30">
            <Zap className="h-3 w-3 text-cyan-400/40" />
            {entry.creditsUsed} credits
          </span>
          <span className="flex items-center gap-1 text-[11px] text-white/30">
            <Clock className="h-3 w-3" />
            {(entry.executionMs / 1000).toFixed(1)}s
          </span>
          <span className="text-[11px] text-white/25">{timeStr}</span>
        </div>
      </div>

      {/* Prompt */}
      <div className="px-5 pt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-white/30 mb-1.5">Prompt</p>
        <p className="text-sm text-white/65 leading-relaxed line-clamp-2">{entry.prompt}</p>
      </div>

      {/* Result preview */}
      <div className="px-5 pt-3 pb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-white/30 mb-1.5">Result</p>
        <pre className="whitespace-pre-wrap font-mono text-xs text-white/75 leading-relaxed max-h-40 overflow-y-auto rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          {entry.result}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3">
        <span className="text-[11px] text-white/20 font-mono truncate max-w-[160px]">{entry.model}</span>
        <div className="flex items-center gap-2">
          <CopyButton text={entry.prompt} label="Copy prompt" />
          <CopyButton text={entry.result} label="Copy result" />
          <button
            onClick={handleRerun}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-2.5 py-1 text-xs text-cyan-300/70 transition-all hover:border-cyan-400/35 hover:text-cyan-200"
            title="Re-run with same prompt"
          >
            <RotateCcw className="h-3 w-3" /> Re-run
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const history      = useAiPipelineStore(selectHistory);
  const clearHistory = useAiPipelineStore((s) => s.clearHistory);

  const [filter,          setFilter]          = useState<FilterAgent>('all');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const filtered = useMemo(
    () => filter === 'all' ? history : history.filter(h => h.agent === filter),
    [history, filter]
  );

  const handleClear = () => {
    if (!confirmingClear) { setConfirmingClear(true); return; }
    clearHistory();
    setConfirmingClear(false);
  };

  return (
    <div className="min-h-screen bg-transparent text-white">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[linear-gradient(180deg,rgba(3,7,16,0.96),rgba(3,7,16,0.88))] backdrop-blur-2xl border-b border-white/[0.07]">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/studio"
                className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors px-2.5 py-1.5 rounded-xl hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] text-sm"
              >
                <ArrowLeft size={15} />
                <span className="hidden sm:inline">Studio</span>
              </Link>
              <div className="w-px h-5 bg-white/[0.12]" />
              <h1 className="text-sm font-bold text-white">Generation History</h1>
            </div>
            <CreditBadge compact />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Analytics chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <CreditChart />
        </motion.div>

        {/* Filters + clear */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Agent filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {FILTER_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold tracking-wide transition-all',
                  filter === f
                    ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.12)]'
                    : 'border-white/[0.10] bg-white/[0.04] text-white/45 hover:border-white/[0.18] hover:text-white/70'
                )}
              >
                {f === 'all' ? 'All' : AGENT_META[f as AgentType].label}
                {f !== 'all' && (
                  <span className="ml-1 opacity-50">
                    {history.filter(h => h.agent === f).length}
                  </span>
                )}
                {f === 'all' && (
                  <span className="ml-1 opacity-50">{history.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Clear button */}
          {history.length > 0 && (
            <button
              onClick={handleClear}
              onBlur={() => setConfirmingClear(false)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-all',
                confirmingClear
                  ? 'border-red-400/40 bg-red-400/10 text-red-300 shadow-[0_0_10px_rgba(248,113,113,0.12)]'
                  : 'border-white/[0.10] bg-white/[0.04] text-white/40 hover:border-red-400/25 hover:text-red-300/70'
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmingClear ? 'Confirm clear?' : 'Clear all'}
            </button>
          )}
        </div>

        {/* Entry list */}
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-5 py-24 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                <Inbox className="h-7 w-7 text-white/20" />
              </div>
              <div>
                <p className="text-base font-semibold text-white/40">No history yet</p>
                <p className="mt-1 text-sm text-white/25">
                  {filter === 'all'
                    ? 'Run a generator to see results here.'
                    : `No ${AGENT_META[filter as AgentType].label} runs yet.`}
                </p>
              </div>
              <Link
                href="/studio"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/[0.18] bg-transparent px-4 text-sm font-semibold text-white/75 transition-all hover:border-white/[0.30] hover:bg-white/[0.06] hover:text-white active:scale-[0.985]"
              >
                Go to Studio
              </Link>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {filtered.map((entry, i) => (
                <HistoryCard key={entry.id} entry={entry} index={i} />
              ))}
            </div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

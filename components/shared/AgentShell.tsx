'use client';

/**
 * AgentShell
 *
 * The single reusable UI frame for every AI generation page (avatar, image,
 * video, music, copy/SEO). Composes:
 *
 *   • Header with title, agent icon, credit badge, and optional back link
 *   • Prompt textarea with character counter
 *   • Optional context input
 *   • Generate button (disabled when loading / no credits)
 *   • Loading state (skeleton + spinner + elapsed timer)
 *   • Error banner with dismiss
 *   • Result panel (scrollable, copy-to-clipboard)
 *   • Execution metadata (model · ms · credits used)
 *
 * Usage:
 *   <AgentShell
 *     agent="image"
 *     title="Image Generator"
 *     subtitle="AI-powered image prompts"
 *     icon={<ImageIcon size={18} />}
 *     gradient="from-violet-500 to-fuchsia-500"
 *     placeholderPrompt="Describe the image you want to create…"
 *     showContextInput
 *   />
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Copy, Check, AlertCircle, Zap, Clock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button }     from '@/components/ui/button';
import { Skeleton }   from '@/components/ui/Skeleton';
import { Spinner }    from '@/components/ui/Spinner';
import { CreditBadge } from '@/components/ui/CreditBadge';
import { useAiPipeline, type RunResult } from '@/hooks/useAiPipeline';
import { AGENT_COSTS, type AgentType } from '@/store/useAiPipelineStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentShellProps {
  agent:             AgentType;
  title:             string;
  subtitle:          string;
  icon:              React.ReactNode;
  gradient:          string;               // Tailwind gradient classes e.g. "from-cyan-500 to-blue-500"
  placeholderPrompt: string;
  showContextInput?: boolean;
  contextLabel?:     string;
  backHref?:         string;
}

// ─── Elapsed timer ────────────────────────────────────────────────────────────

function useElapsedMs(running: boolean): number {
  const [ms, setMs] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (running) {
      startRef.current = Date.now();
      const id = setInterval(() => setMs(Date.now() - startRef.current), 100);
      return () => clearInterval(id);
    } else {
      setMs(0);
      return undefined;
    }
  }, [running]);

  return ms;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore — clipboard unavailable */ }
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.05] px-2.5 py-1 text-xs text-white/60 transition-all hover:border-white/[0.18] hover:text-white/90"
      title="Copy to clipboard"
    >
      {copied
        ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
        : <><Copy className="h-3.5 w-3.5" /> Copy</>
      }
    </button>
  );
}

// ─── Skeleton loader for the result area ─────────────────────────────────────

function ResultSkeleton() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentShell({
  agent,
  title,
  subtitle,
  icon,
  gradient,
  placeholderPrompt,
  showContextInput = false,
  contextLabel = 'Additional context (optional)',
  backHref = '/dashboard',
}: AgentShellProps) {
  const { run, loading, error, lastResult: _lastResult, canAfford, clearError } = useAiPipeline(agent);

  const [prompt,  setPrompt]  = useState('');
  const [context, setContext] = useState('');
  const [result,  setResult]  = useState<RunResult | null>(null);

  const elapsed = useElapsedMs(loading);
  const cost    = AGENT_COSTS[agent];

  const handleSubmit = async () => {
    clearError();
    const res = await run({ prompt, context: context || undefined });
    if (res) setResult(res);
  };

  const promptTooLong  = prompt.length  > 4000;
  const contextTooLong = context.length > 1000;
  const canSubmit      = canAfford && prompt.trim().length > 0 && !promptTooLong && !contextTooLong && !loading;

  return (
    <div className="min-h-screen bg-transparent text-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[linear-gradient(180deg,rgba(3,7,16,0.96),rgba(3,7,16,0.88))] backdrop-blur-2xl border-b border-white/[0.07]">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href={backHref}
                className="flex shrink-0 items-center gap-1.5 text-white/40 hover:text-white transition-colors px-2.5 py-1.5 rounded-xl hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] text-sm"
                aria-label="Back"
              >
                <ArrowLeft size={15} />
                <span className="hidden sm:inline">Back</span>
              </Link>

              <div className="w-px h-5 bg-white/[0.12] shrink-0" />

              <div
                className={cn(
                  'flex shrink-0 h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br',
                  gradient,
                  'shadow-[0_0_16px_rgba(34,211,238,0.25)]'
                )}
              >
                {icon}
              </div>

              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-white leading-tight truncate">{title}</h1>
                <p className="text-[11px] text-white/40 leading-tight hidden sm:block truncate">{subtitle}</p>
              </div>
            </div>

            <CreditBadge agent={agent} showCost compact />
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Input card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_16px_48px_rgba(0,0,0,0.45)] overflow-hidden"
        >
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

          <div className="p-6 space-y-4">
            {/* Prompt */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={placeholderPrompt}
                rows={5}
                maxLength={4100}
                disabled={loading}
                className={cn(
                  'w-full resize-none rounded-xl border bg-white/[0.04] px-4 py-3 text-sm text-white/90 placeholder-white/25 outline-none transition-all',
                  'focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20 focus:bg-white/[0.06]',
                  promptTooLong
                    ? 'border-red-400/40 focus:border-red-400/60'
                    : 'border-white/[0.10] hover:border-white/[0.18]',
                  loading && 'opacity-50 cursor-not-allowed'
                )}
              />
              <div className="flex justify-end">
                <span className={cn('text-[11px]', promptTooLong ? 'text-red-400' : 'text-white/25')}>
                  {prompt.length}/4000
                </span>
              </div>
            </div>

            {/* Optional context */}
            {showContextInput && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  {contextLabel}
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g. brand voice, target audience, style references…"
                  rows={2}
                  maxLength={1100}
                  disabled={loading}
                  className={cn(
                    'w-full resize-none rounded-xl border bg-white/[0.04] px-4 py-3 text-sm text-white/90 placeholder-white/25 outline-none transition-all',
                    'focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20',
                    contextTooLong
                      ? 'border-red-400/40'
                      : 'border-white/[0.10] hover:border-white/[0.18]',
                    loading && 'opacity-50 cursor-not-allowed'
                  )}
                />
                <div className="flex justify-end">
                  <span className={cn('text-[11px]', contextTooLong ? 'text-red-400' : 'text-white/25')}>
                    {context.length}/1000
                  </span>
                </div>
              </div>
            )}

            {/* No-credit warning */}
            {!canAfford && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-4 py-3">
                <Zap className="h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-sm text-amber-200">
                  Not enough credits. This generation costs{' '}
                  <span className="font-semibold">{cost}</span>. Please top up your balance.
                </p>
              </div>
            )}

            {/* Submit */}
            <Button
              variant="primary"
              className="w-full"
              disabled={!canSubmit}
              loading={loading}
              onClick={handleSubmit}
            >
              {loading
                ? <span className="flex items-center gap-2">
                    <Spinner className="h-4 w-4" />
                    Generating… ({(elapsed / 1000).toFixed(1)}s)
                  </span>
                : <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Generate · {cost} credits
                  </span>
              }
            </Button>
          </div>
        </motion.div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-3 rounded-2xl border border-red-400/25 bg-red-400/[0.08] px-5 py-4"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="flex-1 text-sm text-red-200">{error}</p>
              <button
                onClick={clearError}
                className="shrink-0 text-xs text-red-400/60 hover:text-red-300 transition-colors"
                aria-label="Dismiss error"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading skeleton */}
        {loading && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(155deg,rgba(12,22,46,0.70),rgba(7,14,32,0.60))] overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-2">
              <Spinner className="h-4 w-4" />
              <span className="text-xs text-white/40">Claude 3.5 Sonnet is thinking…</span>
            </div>
            <ResultSkeleton />
          </motion.div>
        )}

        {/* Result */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-2xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_16px_48px_rgba(0,0,0,0.45)] overflow-hidden"
            >
              {/* Result header */}
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-3">
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Result</span>
                <div className="flex items-center gap-3">
                  {/* Execution metadata */}
                  <span className="flex items-center gap-1 text-[11px] text-white/30">
                    <Clock className="h-3 w-3" />
                    {(result.executionMs / 1000).toFixed(1)}s
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-white/30">
                    <Zap className="h-3 w-3" />
                    {result.creditsUsed} credits
                  </span>
                  <CopyButton text={result.result} />
                </div>
              </div>

              {/* Result body */}
              <div className="p-6 max-h-[520px] overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-sm text-white/85 leading-relaxed">
                  {result.result}
                </pre>
              </div>

              {/* Model pill */}
              <div className="border-t border-white/[0.05] px-6 py-2.5 flex justify-end">
                <span className="text-[11px] text-white/25">{result.model}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

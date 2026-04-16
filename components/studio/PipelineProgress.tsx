'use client';

import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/Spinner';
import { WaveRow } from './WaveRow';
import type { PipelineStreamState } from '@/lib/hooks/usePipelineStream';

interface PipelineProgressProps {
  state: PipelineStreamState;
  className?: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function PipelineProgress({ state, className }: PipelineProgressProps) {
  const { status, progress, totalNodes, completedNodes, waves, errorMessage, durationMs } = state;

  // Nothing to show before we receive the first event
  if (status === 'idle') return null;

  const isConnecting = status === 'connecting';
  const isRunning = status === 'running';
  const isDone = status === 'completed';
  const isError = status === 'error';

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.09] bg-white/[0.04] backdrop-blur-md p-5 space-y-4',
        className
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {isConnecting && <Spinner />}

          <h3 className="text-sm font-semibold text-white/80 tracking-wide">
            {isConnecting && 'Connecting…'}
            {isRunning && 'Pipeline Running'}
            {isDone && 'Pipeline Complete'}
            {isError && 'Pipeline Failed'}
          </h3>
        </div>

        <div className="flex items-center gap-3 text-[11px] tabular-nums">
          {/* Node counter */}
          {totalNodes > 0 && (
            <span className="text-white/40">
              {completedNodes}
              <span className="text-white/20"> / </span>
              {totalNodes} nodes
            </span>
          )}

          {/* Duration badge */}
          {durationMs !== null && (
            <span
              className={cn(
                'px-2 py-0.5 rounded-full border text-[10px] font-bold',
                isDone
                  ? 'border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300'
                  : 'border-red-400/30 bg-red-400/[0.08] text-red-300'
              )}
            >
              {formatDuration(durationMs)}
            </span>
          )}
        </div>
      </div>

      {/* ── Overall progress bar ────────────────────────────────────── */}
      {!isConnecting && totalNodes > 0 && (
        <div className="space-y-1.5">
          <Progress
            value={progress}
            className={cn(
              'h-1.5',
              isDone && '[&>div]:bg-gradient-to-r [&>div]:from-emerald-400 [&>div]:to-teal-400',
              isError && '[&>div]:bg-gradient-to-r [&>div]:from-red-400 [&>div]:to-red-500'
            )}
          />
          <div className="flex justify-between text-[10px] font-medium">
            <span
              style={{
                color: isDone ? '#34d399' : isError ? '#f87171' : '#22d3ee',
              }}
            >
              {isDone ? 'All nodes completed' : isError ? 'Execution stopped' : 'Executing…'}
            </span>
            <span
              className="font-bold tabular-nums"
              style={{ color: isDone ? '#34d399' : isError ? '#f87171' : '#22d3ee' }}
            >
              {progress}%
            </span>
          </div>
        </div>
      )}

      {/* ── Wave rows ───────────────────────────────────────────────── */}
      {waves.length > 0 && (
        <div className="space-y-2">
          {waves.map((wave) => (
            <WaveRow
              key={wave.index}
              wave={wave}
              isParallel={wave.nodes.length > 1}
            />
          ))}
        </div>
      )}

      {/* ── Connecting placeholder ──────────────────────────────────── */}
      {isConnecting && (
        <div className="flex items-center gap-3 py-4 px-2">
          <Spinner />
          <span className="text-sm text-white/40">Initialising pipeline…</span>
        </div>
      )}

      {/* ── Error message ────────────────────────────────────────────── */}
      {isError && errorMessage && (
        <div className="rounded-xl border border-red-400/25 bg-red-400/[0.07] px-4 py-3">
          <p className="text-xs text-red-300 leading-relaxed">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}

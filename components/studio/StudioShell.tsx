'use client';

/**
 * StudioShell
 *
 * A generic container that wires the pipeline stream hook to the
 * PipelineProgress visualiser. Consumers provide:
 *
 *   - `nodes` — the PipelineNode[] to execute
 *   - `title` — optional heading
 *   - `onComplete` — called with the finished execution state
 *   - `children` — rendered in the results area once the pipeline completes
 *
 * Usage:
 *   <StudioShell
 *     title="Media Studio"
 *     nodes={[
 *       { id: 'img', tool: 'generate_image', input: { prompt: '...' } },
 *       { id: 'mus', tool: 'compose_music',  input: { mood: 'epic', duration_seconds: 30 } },
 *       { id: 'vid', tool: 'generate_video', input: { prompt: '...', length_seconds: 15 },
 *         dependsOn: ['img', 'mus'] },
 *     ]}
 *     onComplete={(state) => console.log('done', state)}
 *   >
 *     {(state) => <ResultsPanel state={state} />}
 *   </StudioShell>
 */

import { useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { usePipelineStream } from '@/lib/hooks/usePipelineStream';
import { PipelineProgress } from './PipelineProgress';
import type { PipelineNode } from '@/lib/ai/pipeline';
import type { PipelineStreamState } from '@/lib/hooks/usePipelineStream';

interface StudioShellProps {
  nodes: PipelineNode[];
  title?: string;
  /** Auto-start when component mounts. Defaults to false. */
  autoRun?: boolean;
  onComplete?: (state: PipelineStreamState) => void;
  onError?: (state: PipelineStreamState) => void;
  /**
   * Render-prop child — called once the pipeline finishes.
   * Return your result UI here.
   */
  children?: (state: PipelineStreamState) => React.ReactNode;
  className?: string;
}

export function StudioShell({
  nodes,
  title,
  autoRun = false,
  onComplete,
  onError,
  children,
  className,
}: StudioShellProps) {
  const { state, execute, reset } = usePipelineStream();
  const { status } = state;

  // Notify parent callbacks on terminal states
  useEffect(() => {
    if (status === 'completed') onComplete?.(state);
    if (status === 'error') onError?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Auto-run on mount
  useEffect(() => {
    if (autoRun) execute(nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRun = useCallback(() => {
    execute(nodes);
  }, [execute, nodes]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  const isIdle = status === 'idle';
  const isTerminal = status === 'completed' || status === 'error';
  const isActive = status === 'connecting' || status === 'running';

  return (
    <div className={cn('space-y-4', className)}>
      {/* ── Header ───────────────────────────────────────────────── */}
      {(title || !autoRun) && (
        <div className="flex items-center justify-between gap-4">
          {title && (
            <h2 className="text-base font-bold text-white/85 tracking-wide">{title}</h2>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {isTerminal && (
              <button
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg border border-white/[0.12] bg-white/[0.05] text-xs font-semibold text-white/55 hover:text-white/75 hover:bg-white/[0.08] transition-all"
              >
                Reset
              </button>
            )}

            <button
              onClick={handleRun}
              disabled={isActive}
              className={cn(
                'px-4 py-1.5 rounded-lg border text-xs font-bold tracking-wide transition-all',
                isActive
                  ? 'border-white/[0.10] bg-white/[0.04] text-white/30 cursor-not-allowed'
                  : 'border-cyan-400/40 bg-cyan-400/[0.10] text-cyan-200 hover:bg-cyan-400/[0.18] hover:border-cyan-400/60 shadow-[0_0_12px_rgba(34,211,238,0.08)] hover:shadow-[0_0_18px_rgba(34,211,238,0.18)]'
              )}
            >
              {isActive ? 'Running…' : isIdle ? 'Run Pipeline' : 'Run Again'}
            </button>
          </div>
        </div>
      )}

      {/* ── Pipeline progress visualiser ─────────────────────────── */}
      <PipelineProgress state={state} />

      {/* ── Results area ─────────────────────────────────────────── */}
      {isTerminal && children && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {children(state)}
        </div>
      )}
    </div>
  );
}

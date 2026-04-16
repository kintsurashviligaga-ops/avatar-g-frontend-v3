'use client';

/**
 * usePipelineStream
 *
 * Connects to POST /api/pipeline/run via Server-Sent Events, parses
 * incoming PipelineEvent messages, and builds a structured wave-by-wave
 * state that components can render directly.
 *
 * Usage:
 *   const { state, execute, reset } = usePipelineStream();
 *
 *   <button onClick={() => execute(myNodes)}>Run</button>
 *   <PipelineProgress state={state} />
 */

import { useCallback, useReducer, useRef } from 'react';
import type { PipelineNode, PipelineEvent } from '@/lib/ai/pipeline';

// ─── State shape ──────────────────────────────────────────────────────────────

export type NodeStreamStatus = 'pending' | 'running' | 'completed' | 'failed';
export type WaveStreamStatus = 'pending' | 'running' | 'completed' | 'failed';
export type PipelineStreamStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'error';

export interface NodeStreamState {
  id: string;
  tool: string;
  status: NodeStreamStatus;
  fromCache: boolean;
}

export interface WaveStreamState {
  index: number;
  status: WaveStreamStatus;
  nodes: NodeStreamState[];
  successCount: number;
}

export interface PipelineStreamState {
  status: PipelineStreamStatus;
  executionId: string | null;
  totalNodes: number;
  completedNodes: number;
  /** progress 0–100 derived from completedNodes / totalNodes */
  progress: number;
  waves: WaveStreamState[];
  errorMessage: string | null;
  durationMs: number | null;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type StreamAction =
  | { type: 'CONNECTING' }
  | { type: 'EVENT'; event: PipelineEvent }
  | { type: 'STREAM_ERROR'; message: string }
  | { type: 'RESET' };

const initialState: PipelineStreamState = {
  status: 'idle',
  executionId: null,
  totalNodes: 0,
  completedNodes: 0,
  progress: 0,
  waves: [],
  errorMessage: null,
  durationMs: null,
};

function pct(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

function reducer(state: PipelineStreamState, action: StreamAction): PipelineStreamState {
  switch (action.type) {
    case 'CONNECTING':
      return { ...initialState, status: 'connecting' };

    case 'RESET':
      return { ...initialState };

    case 'STREAM_ERROR':
      return { ...state, status: 'error', errorMessage: action.message };

    case 'EVENT': {
      const ev = action.event;

      switch (ev.type) {
        case 'execution_start':
          return {
            ...state,
            status: 'running',
            executionId: ev.executionId,
            totalNodes: ev.totalNodes,
            completedNodes: 0,
            progress: 0,
            waves: [],
            errorMessage: null,
            durationMs: null,
          };

        case 'wave_start': {
          const newWave: WaveStreamState = {
            index: ev.waveIndex,
            status: 'running',
            nodes: ev.nodeIds.map((id, i) => ({
              id,
              tool: ev.tools[i] ?? id,
              status: 'running',
              fromCache: false,
            })),
            successCount: 0,
          };
          return {
            ...state,
            waves: [...state.waves, newWave],
          };
        }

        case 'node_complete': {
          const completed = state.completedNodes + 1;
          return {
            ...state,
            completedNodes: completed,
            progress: pct(completed, state.totalNodes),
            waves: state.waves.map((w) => {
              if (w.index !== ev.waveIndex) return w;
              return {
                ...w,
                nodes: w.nodes.map((n) => {
                  if (n.id !== ev.nodeId) return n;
                  return {
                    ...n,
                    status: ev.success ? 'completed' : 'failed',
                    fromCache: ev.fromCache,
                  };
                }),
              };
            }),
          };
        }

        case 'wave_complete':
          return {
            ...state,
            waves: state.waves.map((w) => {
              if (w.index !== ev.waveIndex) return w;
              return {
                ...w,
                status: ev.successCount === ev.totalCount ? 'completed' : 'failed',
                successCount: ev.successCount,
              };
            }),
          };

        case 'execution_complete':
          return {
            ...state,
            status: ev.status === 'completed' ? 'completed' : 'error',
            progress: ev.status === 'completed' ? 100 : state.progress,
            durationMs: ev.durationMs,
          };

        case 'error':
          return {
            ...state,
            status: 'error',
            errorMessage: ev.message,
          };

        default:
          return state;
      }
    }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UsePipelineStreamResult {
  state: PipelineStreamState;
  execute: (nodes: PipelineNode[]) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function usePipelineStream(): UsePipelineStreamResult {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    cancel();
    dispatch({ type: 'RESET' });
  }, [cancel]);

  const execute = useCallback(
    async (nodes: PipelineNode[]) => {
      // Cancel any in-flight execution
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: 'CONNECTING' });

      try {
        const res = await fetch('/api/pipeline/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }));
          dispatch({ type: 'STREAM_ERROR', message: err.error ?? `HTTP ${res.status}` });
          return;
        }

        if (!res.body) {
          dispatch({ type: 'STREAM_ERROR', message: 'No response body' });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE lines arrive as "data: {...}\n\n"
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(trimmed.slice(6)) as PipelineEvent;
              dispatch({ type: 'EVENT', event });
            } catch {
              // Malformed line — skip
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        dispatch({
          type: 'STREAM_ERROR',
          message: err instanceof Error ? err.message : 'Connection failed',
        });
      }
    },
    []
  );

  return { state, execute, cancel, reset };
}

'use client';

/**
 * useAiPipeline — client-side hook wiring `/api/ai` to the AI pipeline store.
 *
 * Usage:
 *   const { run, loading, error, lastResult, canAfford } = useAiPipeline('image');
 *
 *   await run({ prompt: 'a neon cityscape at night' });
 *
 * Responsibilities:
 *   - Calls POST /api/ai with the correct agent + prompt
 *   - Drives store actions: setAgentLoading → useCredits / setAgentError
 *   - Syncs server-returned balance back via resetCredits
 *   - Surfaces structured error messages (402 credit, 401 auth, etc.)
 *   - Returns the last result so components don't need local state
 *   - Exposes canAfford so UI can disable submit buttons proactively
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAiPipelineStore,
  selectCanAfford,
  type AgentType,
  type HistoryEntry,
} from '@/store/useAiPipelineStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunParams {
  prompt:    string;
  context?:  string;
}

export interface RunCallbacks {
  onStart?: () => void;
  onSuccess?: (result: RunResult) => void;
  onError?: (message: string) => void;
  onFinally?: () => void;
}

export interface RunResult {
  result:      string;
  creditsUsed: number;
  newBalance:  number;
  executionMs: number;
  model:       string;
}

export interface UseAiPipelineReturn {
  /** Trigger an AI generation for the bound agent */
  run:         (params: RunParams, callbacks?: RunCallbacks) => Promise<RunResult | null>;
  /** True while an in-flight request is pending */
  loading:     boolean;
  /** Current error message, null when clear */
  error:       string | null;
  /** Last successful result entry from the store */
  lastResult:  HistoryEntry | null;
  /** Current credit balance */
  balance:     number;
  /** Whether the user has enough credits to run this agent */
  canAfford:   boolean;
  /** Manually clear the error state */
  clearError:  () => void;
}

// ─── API response shape ───────────────────────────────────────────────────────

interface ApiResponse {
  result:      string;
  agent:       AgentType;
  creditsUsed: number;
  newBalance:  number;
  executionMs: number;
  model:       string;
}

interface ApiError {
  error:     string;
  required?: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAiPipeline(agent: AgentType): UseAiPipelineReturn {
  const router = useRouter();

  // Store slices
  const loading    = useAiPipelineStore((s) => s.agents[agent].loading);
  const error      = useAiPipelineStore((s) => s.agents[agent].error);
  const balance    = useAiPipelineStore((s) => s.balance);
  const canAfford  = useAiPipelineStore(selectCanAfford(agent));
  const history    = useAiPipelineStore((s) => s.history);

  // Store actions
  const setAgentLoading = useAiPipelineStore((s) => s.setAgentLoading);
  const setAgentError   = useAiPipelineStore((s) => s.setAgentError);
  const clearAgentError = useAiPipelineStore((s) => s.clearAgentError);
  const useCredits      = useAiPipelineStore((s) => s.useCredits);
  const resetCredits    = useAiPipelineStore((s) => s.resetCredits);

  // Derived: most recent history entry for this agent
  const lastResult = history.find((h) => h.agent === agent) ?? null;

  // ── run ──────────────────────────────────────────────────────────────────
  const run = useCallback(
    async ({ prompt, context }: RunParams, callbacks?: RunCallbacks): Promise<RunResult | null> => {
      if (!prompt.trim()) {
        const message = 'Prompt cannot be empty.';
        setAgentError(agent, message);
        callbacks?.onError?.(message);
        callbacks?.onFinally?.();
        return null;
      }

      if (!canAfford) {
        const message = `Not enough credits. You need at least ${
          useAiPipelineStore.getState().balance
        } credits.`;
        setAgentError(
          agent,
          message
        );
        callbacks?.onError?.(message);
        callbacks?.onFinally?.();
        return null;
      }

      callbacks?.onStart?.();
      setAgentLoading(agent, true);

      let response: Response;
      try {
        response = await fetch('/api/ai', {
          method  : 'POST',
          headers : { 'Content-Type': 'application/json' },
          body    : JSON.stringify({ agent, prompt: prompt.trim(), context }),
        });
      } catch {
        const message = 'Network error — please check your connection.';
        setAgentError(agent, message);
        callbacks?.onError?.(message);
        callbacks?.onFinally?.();
        return null;
      }

      // Parse body regardless of status so we can surface server messages
      let json: ApiResponse | ApiError;
      try {
        json = await response.json();
      } catch {
        const message = `Unexpected server response (HTTP ${response.status}).`;
        setAgentError(agent, message);
        callbacks?.onError?.(message);
        callbacks?.onFinally?.();
        return null;
      }

      if (!response.ok) {
        const errBody = json as ApiError;
        let message: string;

        // 401 → redirect to login
        if (response.status === 401) {
          message = 'Session expired. Redirecting to login…';
          setAgentError(agent, message);
          callbacks?.onError?.(message);
          callbacks?.onFinally?.();
          router.push('/login');
          return null;
        }

        // 402 → insufficient credits
        if (response.status === 402) {
          message = errBody.required
            ? `Insufficient credits (need ${errBody.required}).`
            : 'Insufficient credits. Please top up your balance.';
          setAgentError(agent, message);
          callbacks?.onError?.(message);
          callbacks?.onFinally?.();
          return null;
        }

        // 429 → rate limited
        if (response.status === 429) {
          message = 'Too many requests — please wait a moment and try again.';
          setAgentError(agent, message);
          callbacks?.onError?.(message);
          callbacks?.onFinally?.();
          return null;
        }

        // 504 → AI timeout
        if (response.status === 504) {
          message = 'AI request timed out. Please try a shorter prompt.';
          setAgentError(agent, message);
          callbacks?.onError?.(message);
          callbacks?.onFinally?.();
          return null;
        }

        message = errBody.error ?? `Request failed (HTTP ${response.status}).`;
        setAgentError(agent, message);
        callbacks?.onError?.(message);
        callbacks?.onFinally?.();
        return null;
      }

      const data = json as ApiResponse;

      // Update store: record usage, deduct credits, sync balance from server
      useCredits({
        agent,
        prompt,
        result      : data.result,
        creditsUsed : data.creditsUsed,
        executionMs : data.executionMs,
        model       : data.model,
      });

      // Trust server balance as source of truth
      resetCredits(data.newBalance);

      setAgentLoading(agent, false);

      const result = {
        result      : data.result,
        creditsUsed : data.creditsUsed,
        newBalance  : data.newBalance,
        executionMs : data.executionMs,
        model       : data.model,
      };

      callbacks?.onSuccess?.(result);
      callbacks?.onFinally?.();

      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent, canAfford]
  );

  // ── clearError ────────────────────────────────────────────────────────────
  const clearError = useCallback(() => {
    clearAgentError(agent);
  }, [agent, clearAgentError]);

  return { run, loading, error, lastResult, balance, canAfford, clearError };
}

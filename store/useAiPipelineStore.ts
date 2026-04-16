/**
 * AI Pipeline Store — Zustand + Immer + persist
 *
 * Manages:
 *   • Credit balance (synced from server, cached in localStorage)
 *   • Usage history (last 20 results, persisted across sessions)
 *   • Per-agent loading / error state
 *   • Analytics accumulator (credits spent, execution time)
 *
 * Reducer-style actions (per the V14 spec):
 *   CREDITS_ADD      — add credits (e.g. after purchase / plan upgrade)
 *   CREDITS_USE      — deduct credits after a successful AI call
 *   CREDITS_RESET    — reset balance to a given amount (e.g. monthly renewal)
 *   CREDITS_HISTORY  — bulk-replace history (e.g. after server sync)
 *
 * Agent costs (kept in sync with /app/api/ai/route.ts):
 *   avatar → 10  |  image → 5  |  video → 15  |  music → 8  |  copy → 3
 *
 * Storage key: "mya_v14"
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentType = 'avatar' | 'image' | 'video' | 'music' | 'copy';

export const AGENT_COSTS: Record<AgentType, number> = {
  avatar : 10,
  image  :  5,
  video  : 15,
  music  :  8,
  copy   :  3,
} as const;

export interface HistoryEntry {
  id:           string;
  agent:        AgentType;
  prompt:       string;
  result:       string;
  creditsUsed:  number;
  executionMs:  number;
  model:        string;
  createdAt:    string; // ISO-8601
}

export interface AgentState {
  loading:  boolean;
  error:    string | null;
}

export interface Analytics {
  totalCreditsSpent:  number;
  totalExecutionMs:   number;
  callsPerAgent:      Record<AgentType, number>;
}

// ─── Store interface ──────────────────────────────────────────────────────────

export interface AiPipelineState {
  // ── Credit state ──────────────────────────────────────────────────────────
  balance:      number;
  totalSpent:   number;

  // ── History (capped at 20) ─────────────────────────────────────────────────
  history:      HistoryEntry[];

  // ── Per-agent UI state ────────────────────────────────────────────────────
  agents:       Record<AgentType, AgentState>;

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics:    Analytics;

  // ── Reducer-style actions (CREDITS_*) ────────────────────────────────────
  /** CREDITS_ADD — increase balance (purchase / plan renewal) */
  addCredits:   (amount: number) => void;

  /** CREDITS_USE — record a successful AI call; deducts from balance */
  useCredits:   (params: {
    agent:       AgentType;
    prompt:      string;
    result:      string;
    creditsUsed: number;
    executionMs: number;
    model:       string;
  }) => void;

  /** CREDITS_RESET — set balance to an exact value (server sync) */
  resetCredits: (balance: number) => void;

  /** CREDITS_HISTORY — replace history array in full (server sync) */
  setHistory:   (entries: HistoryEntry[]) => void;

  // ── Per-agent UI helpers ──────────────────────────────────────────────────
  setAgentLoading: (agent: AgentType, loading: boolean) => void;
  setAgentError:   (agent: AgentType, error: string | null) => void;
  clearAgentError: (agent: AgentType) => void;

  // ── Convenience ───────────────────────────────────────────────────────────
  /** Returns true when the user has enough credits for the given agent */
  canAfford:    (agent: AgentType) => boolean;

  /** Clears all history entries */
  clearHistory: () => void;
}

// ─── Initial per-agent state factory ─────────────────────────────────────────

const ALL_AGENTS: AgentType[] = ['avatar', 'image', 'video', 'music', 'copy'];

function defaultAgentStates(): Record<AgentType, AgentState> {
  return Object.fromEntries(
    ALL_AGENTS.map(a => [a, { loading: false, error: null }])
  ) as Record<AgentType, AgentState>;
}

function defaultAnalytics(): Analytics {
  return {
    totalCreditsSpent : 0,
    totalExecutionMs  : 0,
    callsPerAgent     : Object.fromEntries(
      ALL_AGENTS.map(a => [a, 0])
    ) as Record<AgentType, number>,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAiPipelineStore = create<AiPipelineState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // ── Initial state ────────────────────────────────────────────────────
        balance    : 20,          // Free tier default (overridden by server sync)
        totalSpent : 0,
        history    : [],
        agents     : defaultAgentStates(),
        analytics  : defaultAnalytics(),

        // ── CREDITS_ADD ──────────────────────────────────────────────────────
        addCredits: (amount) => {
          if (amount <= 0) return;
          set((state) => {
            state.balance += amount;
          });
        },

        // ── CREDITS_USE ──────────────────────────────────────────────────────
        useCredits: ({ agent, prompt, result, creditsUsed, executionMs, model }) => {
          set((state) => {
            // Deduct balance
            state.balance    = Math.max(0, state.balance - creditsUsed);
            state.totalSpent += creditsUsed;

            // Append history entry (cap at 20)
            const entry: HistoryEntry = {
              id          : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              agent,
              prompt      : prompt.slice(0, 500),   // cap stored prompt length
              result      : result.slice(0, 5000),  // cap stored result length
              creditsUsed,
              executionMs,
              model,
              createdAt   : new Date().toISOString(),
            };
            state.history.unshift(entry);
            if (state.history.length > 20) {
              state.history.splice(20);
            }

            // Update analytics
            state.analytics.totalCreditsSpent += creditsUsed;
            state.analytics.totalExecutionMs  += executionMs;
            state.analytics.callsPerAgent[agent] += 1;
          });
        },

        // ── CREDITS_RESET ────────────────────────────────────────────────────
        resetCredits: (balance) => {
          set((state) => {
            state.balance = Math.max(0, balance);
          });
        },

        // ── CREDITS_HISTORY ──────────────────────────────────────────────────
        setHistory: (entries) => {
          set((state) => {
            // Keep most recent 20, sorted descending by createdAt
            state.history = [...entries]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 20);
          });
        },

        // ── Per-agent UI helpers ──────────────────────────────────────────────
        setAgentLoading: (agent, loading) => {
          set((state) => {
            state.agents[agent].loading = loading;
            if (loading) state.agents[agent].error = null; // clear error on new attempt
          });
        },

        setAgentError: (agent, error) => {
          set((state) => {
            state.agents[agent].loading = false;
            state.agents[agent].error   = error;
          });
        },

        clearAgentError: (agent) => {
          set((state) => {
            state.agents[agent].error = null;
          });
        },

        // ── Convenience ──────────────────────────────────────────────────────
        canAfford: (agent) => {
          const { balance } = get();
          return balance >= AGENT_COSTS[agent];
        },

        clearHistory: () => {
          set((state) => {
            state.history = [];
          });
        },
      })),
      {
        name    : 'mya_v14',
        // Only persist credit balance, history, analytics — NOT transient UI state
        partialize: (state) => ({
          balance    : state.balance,
          totalSpent : state.totalSpent,
          history    : state.history,
          analytics  : state.analytics,
        }),
      }
    ),
    { name: 'AiPipelineStore' }
  )
);

// ─── Typed selectors (stable references, safe for useMemo) ───────────────────

export const selectBalance       = (s: AiPipelineState) => s.balance;
export const selectHistory       = (s: AiPipelineState) => s.history;
export const selectAnalytics     = (s: AiPipelineState) => s.analytics;
export const selectAgentState    = (agent: AgentType) =>
  (s: AiPipelineState) => s.agents[agent];
export const selectCanAfford     = (agent: AgentType) =>
  (s: AiPipelineState) => s.balance >= AGENT_COSTS[agent];

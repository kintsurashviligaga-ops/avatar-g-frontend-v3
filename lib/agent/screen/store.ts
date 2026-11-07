/**
 * lib/agent/screen/store.ts — what Agent G's "computer" shows right now (GG 2026-11-07 09:36Z: „the work in the browser on
 * the right, like Manus"). One screen for the whole app: the task cards (components/agent/AutoTaskCard, the site agent)
 * publish to it and the panel (components/agent/AgentScreenPanel, mounted once in the locale layout) draws it. Lives in
 * the page, never persisted, never sent anywhere. Pure: no React, no DOM.
 */

export type ScreenStepState = 'run' | 'ok' | 'fail' | 'todo';
export interface ScreenStep { label: string; state: ScreenStepState }
export type ScreenPhase = 'running' | 'done' | 'stopped';

export interface AgentScreen {
  /** Who publishes: one task at a time owns the screen; a newer task takes it over. */
  key: string;
  /** The cloud browser, or the user's own page (the site agent drives this very tab). */
  source: 'browser' | 'site';
  goal: string;
  phase: ScreenPhase;
  startedAt: number;
  endedAt?: number;
  /** The address the browser is on. */
  url?: string;
  /** A data: URL of the last picture of the page (the cloud browser's live.jpg). */
  picture?: string;
  steps: ScreenStep[];
  /** A line under the steps: why it stopped, what it waits for. */
  note?: string;
}

type Listener = () => void;
let current: AgentScreen | null = null;
/** The user closed the panel for this task; a newer task opens it again. */
let hiddenKey: string | null = null;
const listeners = new Set<Listener>();
const emit = () => { for (const l of listeners) { try { l(); } catch { /* one listener never stops the others */ } } };

export const agentScreen = {
  get(): AgentScreen | null { return current; },
  hidden(): boolean { return !!current && hiddenKey === current.key; },
  subscribe(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; },
  /** Start a task's screen (a new key takes over), or update the one on it. Updates from another key are ignored. */
  publish(s: Partial<AgentScreen> & { key: string }): void {
    if (!current || current.key !== s.key) {
      // Only a task that names its goal starts a screen; a late update from an older task is dropped.
      if (!s.goal) return;
      current = { source: 'browser', phase: 'running', startedAt: Date.now(), steps: [], ...s } as AgentScreen;
      hiddenKey = null;
    } else {
      current = { ...current, ...s };
    }
    emit();
  },
  hide(): void { if (current) { hiddenKey = current.key; emit(); } },
  show(): void { hiddenKey = null; emit(); },
  /** Tests only. */
  reset(): void { current = null; hiddenKey = null; emit(); },
};

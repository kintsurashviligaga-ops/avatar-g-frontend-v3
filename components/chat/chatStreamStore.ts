'use client';

/**
 * components/chat/chatStreamStore.ts — the live state of ONE streaming assistant reply, held outside React.
 *
 * `useChatStream` writes into it; `StreamingBubble` reads it with `useSyncExternalStore`. Nothing else
 * subscribes, so a chunk re-renders the streaming bubble and nothing more.
 *
 * ⚠️ WHY THIS EXISTS. The dashboard chat used to call `setMessages` once per SSE chunk. Each call
 * re-rendered all ~7,500 lines of the OmniStudio component function, including the hidden settings body
 * and every history bubble's wrapper, several times per animation frame on a fast stream. The browser
 * could only paint one of those renders per frame anyway, so the rest were pure main-thread waste, and
 * that waste is what made the composer lag while an answer streamed.
 * Two rules fix it:
 *   1. The text lives here, not in the host's state, so the host does not re-render per chunk.
 *   2. Text deltas are coalesced and committed at most ONCE PER ANIMATION FRAME, so however many chunks
 *      arrive between two paints, subscribers are notified once.
 * Terminal transitions (done, error, aborted) flush synchronously. The final text must never wait for a
 * frame: in a background tab `requestAnimationFrame` does not fire at all, and a reply that finished
 * while the tab was hidden would otherwise sit uncommitted until the user came back.
 *
 * ⚠️ WRITES ARE SCOPED TO A GENERATION. `begin()` hands out a writer bound to that stream. When the user
 * sends again and a new stream begins, the old writer goes stale and its late chunks become no-ops. The
 * old code guarded every `setMessages` with `genIdRef.current === myGen` for the same reason. Here the
 * guard is built into the only write path, so it cannot be forgotten.
 *
 * Snapshots are immutable and keep their identity between commits, which is what `useSyncExternalStore`
 * requires. A new object is created only when something visible changed.
 */

import { useSyncExternalStore } from 'react';
import type { ChatErrorCode, ChatMeta } from '@/lib/chat/sse';

export type ChatLocale = 'ka' | 'en' | 'ru';

export type ChatStreamStatus = 'idle' | 'waiting' | 'streaming' | 'done' | 'error' | 'aborted';

/**
 * The latest `{meta}` frame, as decoded (and validated) by lib/chat/sse: who is answering, in which chat mode, whether
 * it is a fallback, and — on a server-side downgrade — the mode the user asked for, why, and when that clears. An
 * alias rather than a copy, so the wire type and the store can never drift apart.
 */
export type ChatStreamMeta = ChatMeta;

export interface ChatSource {
  url: string;
  title?: string;
}

export interface ChatStreamUsage {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * Why a failure happened, beyond the wire code. The route's codes describe the provider; these describe the
 * transport, so the client can say "too long" or "attachments too large" instead of a generic failure.
 */
export type ChatStreamErrorReason = 'frame' | 'http' | 'timeout' | 'too_large' | 'empty' | 'network';

export interface ChatStreamError {
  code: ChatErrorCode;
  retryable: boolean;
  /** Localized, user-facing text (ka/en/ru). */
  message: string;
  reason: ChatStreamErrorReason;
  /** The server's own message, for logs. Never shown in place of `message`. */
  detail?: string;
  /** HTTP status when the failure was a non-2xx response. */
  status?: number;
  /** Seconds from a 429's `Retry-After` header, when it sent one. */
  retryAfterSec?: number;
}

export interface ChatStreamSnapshot {
  /** Increments on every `begin()` and `reset()`. */
  readonly gen: number;
  /** The caller's id for the turn this stream answers (for matching the bubble to a message). */
  readonly turnId: string | null;
  readonly status: ChatStreamStatus;
  readonly text: string;
  readonly meta: ChatStreamMeta | null;
  readonly sources: readonly ChatSource[];
  readonly usage: ChatStreamUsage | null;
  readonly error: ChatStreamError | null;
  /** Milliseconds from `begin()` to the first text delta, or null before it. */
  readonly firstTokenMs: number | null;
}

export interface ChatStreamWriter {
  readonly gen: number;
  /** False once a newer `begin()` or a `reset()` superseded this stream. Every write is then a no-op. */
  isCurrent(): boolean;
  appendText(delta: string): void;
  setMeta(meta: ChatStreamMeta): void;
  setSources(sources: readonly ChatSource[]): void;
  setUsage(usage: ChatStreamUsage): void;
  /** The stream completed. Flushes pending text synchronously. */
  finish(): void;
  /** The stream failed. Any partial text is kept. Flushes synchronously. */
  fail(error: ChatStreamError): void;
  /** The user stopped the stream. Any partial text is kept. Flushes synchronously. */
  abort(): void;
}

export interface ChatStreamStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ChatStreamSnapshot;
  /** Starts a new stream. Any previous stream's writer goes stale. */
  begin(turnId?: string | null): ChatStreamWriter;
  /** Back to idle. Any writer goes stale. */
  reset(): void;
  /** Commits pending deltas now instead of on the next frame. */
  flush(): void;
}

export interface ChatStreamStoreOptions {
  /** Frame scheduler. Defaults to `requestAnimationFrame`, or a 16 ms timeout where that doesn't exist. */
  schedule?: (cb: () => void) => unknown;
  cancel?: (handle: unknown) => void;
  now?: () => number;
}

const IDLE: ChatStreamSnapshot = Object.freeze({
  gen: 0,
  turnId: null,
  status: 'idle',
  text: '',
  meta: null,
  sources: Object.freeze([]) as readonly ChatSource[],
  usage: null,
  error: null,
  firstTokenMs: null,
});

interface Pending {
  text: string;
  meta?: ChatStreamMeta;
  sources?: readonly ChatSource[];
  usage?: ChatStreamUsage;
}

function defaultSchedule(cb: () => void): unknown {
  if (typeof requestAnimationFrame === 'function') return { raf: requestAnimationFrame(() => cb()) };
  return { timeout: setTimeout(cb, 16) };
}

function defaultCancel(handle: unknown): void {
  const h = handle as { raf?: number; timeout?: ReturnType<typeof setTimeout> } | null;
  if (!h) return;
  if (h.raf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h.raf);
  if (h.timeout !== undefined) clearTimeout(h.timeout);
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export function createChatStreamStore(options: ChatStreamStoreOptions = {}): ChatStreamStore {
  const schedule = options.schedule ?? defaultSchedule;
  const cancel = options.cancel ?? defaultCancel;
  const now = options.now ?? defaultNow;

  let snapshot: ChatStreamSnapshot = IDLE;
  let gen = 0;
  let startedAt = 0;
  /** When the first delta ARRIVED, not when it was committed a frame later. */
  let firstTokenAt: number | null = null;
  let pending: Pending = { text: '' };
  let hasPending = false;
  let frame: unknown = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    // Copy first: a listener that unsubscribes during the loop must not skip its neighbour.
    for (const l of Array.from(listeners)) l();
  };

  const cancelFrame = () => {
    if (frame !== null) {
      cancel(frame);
      frame = null;
    }
  };

  /** Folds pending deltas into a new snapshot. Returns true if the snapshot changed. */
  const commitPending = (): boolean => {
    if (!hasPending) return false;
    const p = pending;
    pending = { text: '' };
    hasPending = false;
    let next: ChatStreamSnapshot = snapshot;
    if (p.text) {
      next = {
        ...next,
        text: next.text + p.text,
        status: next.status === 'waiting' ? 'streaming' : next.status,
        firstTokenMs: next.firstTokenMs ?? Math.max(0, Math.round((firstTokenAt ?? now()) - startedAt)),
      };
    }
    if (p.meta) next = { ...next, meta: p.meta };
    if (p.sources) next = { ...next, sources: p.sources };
    if (p.usage) next = { ...next, usage: p.usage };
    if (next === snapshot) return false;
    snapshot = next;
    return true;
  };

  const onFrame = () => {
    frame = null;
    if (commitPending()) notify();
  };

  const requestFrame = () => {
    if (frame === null) frame = schedule(onFrame);
  };

  const flush = () => {
    cancelFrame();
    if (commitPending()) notify();
  };

  const settle = (patch: Partial<ChatStreamSnapshot> & { status: ChatStreamStatus }) => {
    cancelFrame();
    commitPending();
    snapshot = { ...snapshot, ...patch };
    notify();
  };

  const begin = (turnId?: string | null): ChatStreamWriter => {
    cancelFrame();
    pending = { text: '' };
    hasPending = false;
    const myGen = ++gen;
    startedAt = now();
    firstTokenAt = null;
    snapshot = { ...IDLE, gen: myGen, turnId: turnId ?? null, status: 'waiting' };
    notify();

    const live = () => gen === myGen && (snapshot.status === 'waiting' || snapshot.status === 'streaming');

    return {
      gen: myGen,
      isCurrent: () => gen === myGen,
      appendText(delta: string) {
        if (!live() || typeof delta !== 'string' || delta.length === 0) return;
        if (firstTokenAt === null) firstTokenAt = now();
        pending.text += delta;
        hasPending = true;
        requestFrame();
      },
      setMeta(meta: ChatStreamMeta) {
        if (!live()) return;
        pending.meta = { ...meta };
        hasPending = true;
        requestFrame();
      },
      setSources(sources: readonly ChatSource[]) {
        if (!live()) return;
        pending.sources = Object.freeze(sources.map((s) => ({ ...s })));
        hasPending = true;
        requestFrame();
      },
      setUsage(usage: ChatStreamUsage) {
        if (!live()) return;
        pending.usage = { ...usage };
        hasPending = true;
        requestFrame();
      },
      finish() {
        if (!live()) return;
        settle({ status: 'done' });
      },
      fail(error: ChatStreamError) {
        if (!live()) return;
        settle({ status: 'error', error });
      },
      abort() {
        if (!live()) return;
        settle({ status: 'aborted' });
      },
    };
  };

  const reset = () => {
    cancelFrame();
    pending = { text: '' };
    hasPending = false;
    gen += 1;
    snapshot = { ...IDLE, gen };
    notify();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    begin,
    reset,
    flush,
  };
}

/** Subscribes a component to the store. Re-renders at most once per committed frame. */
export function useChatStreamSnapshot(store: ChatStreamStore): ChatStreamSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

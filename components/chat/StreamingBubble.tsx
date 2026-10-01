'use client';

/**
 * components/chat/StreamingBubble.tsx — the assistant reply that is still arriving.
 *
 * It is the only component subscribed to the chat stream store, so a chunk re-renders this bubble and
 * nothing else: not the host, not the history above it, not the composer. When the stream ends the host
 * commits the final text into its message list and renders the ordinary bubble in its place. Both go
 * through `MarkdownView`, so the handoff doesn't change a pixel.
 *
 * ⚠️ NO MODEL BADGE ABOVE A REPLY (Gemini parity). The label that says which model answered now lives in the
 * host's action row under the committed reply, so neither the streaming bubble nor the committed one has a
 * line above the text — the two stay identical at the handoff. `formatModelBadge` stays exported because
 * the host stamps its result on the message for that row.
 *
 * ⚠️ NOTHING MAY MOVE WHEN THE FIRST TOKEN ARRIVES. Until then the bubble shows Gemini's quiet thinking mark,
 * a single row set in the reply's own type (16 px, line-height 1.7), so the first line of text takes exactly
 * its place. It is an opacity pulse on one icon, never bouncing dots (DESIGN §6: no bounce).
 *
 * There is no caret: `MarkdownView` fades each new block in while `streaming` is true.
 */

import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { AlertTriangle, RotateCcw, Sparkle } from 'lucide-react';
import { MarkdownView } from '@/components/chat/MarkdownView';
import { SourcesChips } from '@/components/chat/SourcesChips';
import {
  useChatStreamSnapshot,
  type ChatLocale,
  type ChatStreamMeta,
  type ChatStreamSnapshot,
  type ChatStreamStore,
} from '@/components/chat/chatStreamStore';
import { displayNameFor } from '@/lib/chat/chatModes';

// useLayoutEffect warns during server rendering; the commit callback only matters in the browser.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * The name of the model that answered, for the reply's action row ("Gemini 3.8 Flash"). It names the model
 * the stream's meta frame reports, so a rotation to the next Gemini model in the chain (`meta.fallback`) is
 * already told honestly by the name itself and needs no warning. Any other provider is marked as a fallback,
 * so a silently degraded answer is never mistaken for Gemini. Returns null when there is nothing to label (no
 * meta yet, or the budget notice, which is not a model's answer).
 */
export function formatModelBadge(meta: ChatStreamMeta | null | undefined): string | null {
  if (!meta || !meta.model || meta.provider === 'budget' || meta.model === 'none') return null;
  const name = displayNameFor(meta.model);
  if (!name) return null;
  return meta.provider === 'gemini' ? name : `⚠ ${name} (fallback)`;
}

const RETRY_LABEL: Record<ChatLocale, string> = { ka: 'თავიდან ცდა', en: 'Retry', ru: 'Повторить' };
const THINKING_LABEL: Record<ChatLocale, string> = { ka: 'ფიქრობს…', en: 'Thinking…', ru: 'Думает…' };

export interface StreamingBubbleProps {
  store: ChatStreamStore;
  locale?: ChatLocale;
  /**
   * Applied to the streamed text before it renders, e.g. to hide a half-streamed service block. Keep it
   * stable (module-level or memoized): it runs on every committed frame.
   */
  transform?: (text: string) => string;
  /** Called after each committed update, before paint. Use it to keep the thread pinned to the bottom. */
  onCommit?: (snapshot: ChatStreamSnapshot) => void;
  /** Offered on a retryable failure. */
  onRetry?: () => void;
  /** Show grounding sources under the reply. Default true. */
  showSources?: boolean;
  className?: string;
}

/**
 * Gemini's "thinking" mark: the spark in the accent, pulsing in opacity only (static under reduced motion),
 * next to the localized word. The row's line box matches one line of reply text; see the header.
 */
function ThinkingMark({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-[16px] leading-[1.7] text-app-muted" data-thinking="">
      <Sparkle size={18} aria-hidden className="shrink-0 text-app-accent motion-safe:animate-pulse" />
      <span>{label}</span>
    </span>
  );
}

function StreamingBubbleImpl({ store, locale = 'ka', transform, onCommit, onRetry, showSources = true, className }: StreamingBubbleProps) {
  const snap = useChatStreamSnapshot(store);

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  useIsomorphicLayoutEffect(() => {
    onCommitRef.current?.(snap);
  }, [snap]);

  if (snap.status === 'idle') return null;

  const live = snap.status === 'waiting' || snap.status === 'streaming';
  const text = transform ? transform(snap.text) : snap.text;
  // Stopped before a word arrived: there is nothing to show, not even the thinking mark.
  if (snap.status === 'aborted' && !text) return null;
  const error = snap.status === 'error' ? snap.error : null;

  return (
    <div
      className={`min-w-0 flex-1 text-app-text ${className ?? ''}`}
      data-streaming-bubble=""
      data-status={snap.status}
      aria-busy={live}
    >
      {text ? (
        <MarkdownView source={text} streaming={live} locale={locale} />
      ) : live ? (
        <ThinkingMark label={THINKING_LABEL[locale] ?? THINKING_LABEL.ka} />
      ) : null}
      {error && (
        <div role="alert" className="mt-3 flex items-center gap-2 rounded-[16px] bg-app-danger/10 py-1 pl-3 pr-1 text-[16px] leading-[1.6] text-app-text">
          <AlertTriangle size={16} aria-hidden className="shrink-0 text-app-danger" />
          <span className="min-w-0 flex-1 break-words py-1.5">{error.message}</span>
          {onRetry && error.retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-app-accent transition-colors hover:bg-app-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 [@media(pointer:fine)]:h-9"
            >
              <RotateCcw size={14} aria-hidden />
              {RETRY_LABEL[locale] ?? RETRY_LABEL.ka}
            </button>
          )}
        </div>
      )}
      {showSources && snap.sources.length > 0 && <SourcesChips sources={snap.sources} locale={locale} />}
    </div>
  );
}

export const StreamingBubble = memo(StreamingBubbleImpl);

export default StreamingBubble;

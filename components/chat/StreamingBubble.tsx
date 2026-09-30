'use client';

/**
 * components/chat/StreamingBubble.tsx — the assistant reply that is still arriving.
 *
 * It is the only component subscribed to the chat stream store, so a chunk re-renders this bubble and
 * nothing else: not the host, not the history above it, not the composer. When the stream ends the host
 * commits the final text into its message list and renders the ordinary bubble in its place. Both go
 * through `MarkdownView`, so the handoff doesn't change a pixel.
 *
 * ⚠️ NOTHING MAY MOVE WHEN THE FIRST TOKEN ARRIVES. The model badge used to appear together with the first
 * text, which added a line above the reply and shifted everything under it at the moment the user started
 * reading. The badge row is reserved from the start (a non-breaking space until the model is known), so the
 * row exists before the text does.
 *
 * ⚠️ THE CARET IS INLINE. The old caret was a sibling of the markdown's block <div>, so it sat on a line of
 * its own under the text. `MarkdownView` now places it inside the last text node's element, right after
 * the last character.
 */

import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { MarkdownView } from '@/components/chat/MarkdownView';
import { SourcesChips } from '@/components/chat/SourcesChips';
import {
  useChatStreamSnapshot,
  type ChatLocale,
  type ChatStreamMeta,
  type ChatStreamSnapshot,
  type ChatStreamStore,
} from '@/components/chat/chatStreamStore';

// useLayoutEffect warns during server rendering; the commit callback only matters in the browser.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * The engine label shown above a reply. A Gemini answer shows its model id. Any other provider is marked
 * as a fallback, so a silently degraded answer is never mistaken for Gemini. Returns null when there is
 * nothing to label (no meta yet, or the budget notice, which is not a model's answer).
 */
export function formatModelBadge(meta: ChatStreamMeta | null | undefined): string | null {
  if (!meta || !meta.model || meta.provider === 'budget' || meta.model === 'none') return null;
  return meta.provider === 'gemini' ? meta.model : `⚠ ${meta.model} (fallback)`;
}

const RETRY_LABEL: Record<ChatLocale, string> = { ka: 'თავიდან ცდა', en: 'Retry', ru: 'Повторить' };

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

function TypingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-app-muted"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}

const WAITING_LABEL: Record<ChatLocale, string> = { ka: 'პასუხი იწერება…', en: 'Writing a reply…', ru: 'Пишу ответ…' };

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
  // Stopped before a word arrived: there is nothing to show, not even the reserved badge row.
  if (snap.status === 'aborted' && !text) return null;
  const badge = formatModelBadge(snap.meta);
  const error = snap.status === 'error' ? snap.error : null;

  return (
    <div
      className={`min-w-0 flex-1 text-app-text ${className ?? ''}`}
      data-streaming-bubble=""
      data-status={snap.status}
      aria-busy={live}
    >
      {/* Reserved from the first frame; see the header. */}
      <div className="mb-1 text-[10px] font-medium text-app-muted/55" title="answering engine" data-model-badge="" aria-hidden={badge ? undefined : true}>
        {badge ?? ' '}
      </div>
      {text ? (
        <MarkdownView source={text} streaming={live} locale={locale} />
      ) : live ? (
        <TypingDots label={WAITING_LABEL[locale] ?? WAITING_LABEL.ka} />
      ) : null}
      {error && (
        <div role="alert" className="mt-2 flex items-start gap-2 rounded-xl border border-app-danger/25 bg-app-danger/10 px-3 py-2 text-[13.5px] leading-[1.5] text-app-text">
          <AlertTriangle size={15} aria-hidden className="mt-[2px] shrink-0 text-app-danger" />
          <span className="min-w-0 flex-1 break-words">{error.message}</span>
          {onRetry && error.retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-app-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-accent/60"
            >
              <RotateCcw size={12} aria-hidden />
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

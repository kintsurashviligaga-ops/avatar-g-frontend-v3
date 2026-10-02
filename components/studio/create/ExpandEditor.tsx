'use client';

/**
 * ExpandEditor — the [expand] button's full-screen editor for a long lyric or a style brief (ref2's corner icon).
 *
 * A real dialog on top of whatever is open — including the settings sheet the Create screen lives in: the textarea is the
 * FIRST focusable (so useDialogA11y puts the caret in it on open) while `order-first` draws the header above it, Escape
 * and "Done" both close (useDialogA11y owns the keyboard while it is the top-most dialog), and Tab stays inside. Safe-area
 * aware top and bottom; on a wide screen the writing column is capped so lines stay readable. The text is the caller's
 * own state — closing never discards it.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '@/hooks/useDialogA11y';

export function ExpandEditor({
  open, title, value, onChange, onClose, placeholder, maxLength, doneLabel,
}: {
  open: boolean;
  title: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  placeholder: string;
  maxLength?: number;
  doneLabel: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const ref = useDialogA11y<HTMLDivElement>(open, onClose);
  if (!mounted || !open) return null;
  const near = maxLength != null && value.length > maxLength * 0.9;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="music-expand"
      className="fixed inset-0 z-[130] flex flex-col bg-app-bg text-app-text"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <textarea
          data-testid="music-expand-input"
          aria-label={title}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-0 w-full flex-1 resize-none rounded-none border-0 bg-transparent px-4 py-3 text-[17px] leading-relaxed text-app-text outline-none placeholder:text-app-muted/55 focus:shadow-none focus:ring-0"
        />
        <div
          className="order-first flex shrink-0 items-center justify-between gap-3 border-b border-app-border/10 px-4 pb-2"
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
        >
          <h2 className="min-w-0 truncate text-[16px] font-medium">{title}</h2>
          <div className="flex shrink-0 items-center gap-3">
            {maxLength != null && (
              <span aria-live="polite" className={`text-[12px] tabular-nums ${near ? 'text-app-warning' : 'text-app-muted'}`}>{value.length}/{maxLength}</span>
            )}
            <button
              type="button"
              data-testid="music-expand-done"
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-5 text-[14px] font-semibold text-app-bg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-text/80"
            >
              {doneLabel}
            </button>
          </div>
        </div>
        <div aria-hidden="true" className="shrink-0" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>,
    document.body,
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';

/**
 * The studio's one sheet — Gemini grammar (docs/DESIGN.md §8). On a phone it rises from the bottom edge with a
 * drag handle over a dimmed page; from `sm` up it floats as a panel above the composer. Either way it is a real
 * dialog: focus moves in and back out, Tab stays inside, Escape and the backdrop close it (useDialogA11y).
 *
 * It replaces the inline options panel, which grew inside the composer column and — with the feed squeezed
 * above it — let the sheet's text run over the greeting on a phone. A sheet owns its own layer instead.
 */
export function BottomSheet({
  open, onClose, title, showHeader = true, closeLabel, children, testId,
}: {
  open: boolean;
  onClose: () => void;
  /** The sheet's name — always its accessible label; also its visible heading unless `showHeader` is false. */
  title: string;
  showHeader?: boolean;
  closeLabel: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const ref = useDialogA11y<HTMLDivElement>(open, onClose);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:pb-28" onClick={onClose}>
      <div aria-hidden="true" className="sheet-fade absolute inset-0 bg-black/55" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className="sheet-rise relative flex max-h-[86svh] w-full flex-col overflow-hidden rounded-t-[28px] border border-app-border/10 bg-app-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)] sm:max-h-[72svh] sm:max-w-[440px] sm:rounded-[28px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex shrink-0 justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-app-border/25" />
        </div>
        {showHeader ? (
          <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-2 sm:pt-4">
            <h2 className="text-[15px] font-semibold text-app-text">{title}</h2>
            <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel}
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

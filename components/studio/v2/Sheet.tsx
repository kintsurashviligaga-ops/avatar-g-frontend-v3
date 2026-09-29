'use client';

/**
 * A bottom sheet on phones, a centred card from `sm` up — the one picker surface of the studio (model,
 * parameters). Escape is caught in the CAPTURE phase and stopped, so it closes this sheet and not whatever
 * sits underneath it (ChatChrome's own overlays listen for Escape too).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface SheetProps {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, title, closeLabel, onClose, children }: SheetProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label={closeLabel} onClick={onClose} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[85svh] w-full overflow-y-auto rounded-t-[28px] border border-app-border/10 bg-app-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 shadow-2xl outline-none sm:max-w-lg sm:rounded-[28px] sm:pt-4"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-app-border/20 sm:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[16px] font-semibold text-app-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

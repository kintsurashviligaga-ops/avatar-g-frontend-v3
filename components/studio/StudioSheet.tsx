'use client';

/**
 * StudioSheet — the "One Window" in-studio slide-over.
 *
 * The film studio is an immersive workspace; navigating to Library / Privacy /
 * Terms / Help as separate routes used to yank the user OUT of it (a context
 * switch that felt like "redirected away / broken state"). This sheet hosts that
 * content as a right-side overlay ON TOP of the studio, so the workspace is never
 * left — close it (✕ / Esc / backdrop) and you're exactly where you were.
 *
 * Pure presentation: the caller passes the title + content (a native component
 * like the Library grid, or a same-origin iframe of an existing page). Strict
 * studio skin — black · white · electric cyan (#00D2FF).
 */

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface StudioSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** When true the body has no padding (e.g. a full-bleed iframe fills it). */
  flush?: boolean;
}

export function StudioSheet({ open, title, onClose, children, flush }: StudioSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="studio-sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[140] flex bg-black/80 backdrop-blur-md"
        >
          <motion.aside
            key="studio-sheet-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
            className="ml-auto flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-black shadow-[0_0_80px_-10px_rgba(0,210,255,0.25)]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <h2 className="truncate text-sm font-bold tracking-tight text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </header>
            <div className={`min-h-0 flex-1 overflow-y-auto ${flush ? '' : 'p-4'}`}>
              {children}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default StudioSheet;

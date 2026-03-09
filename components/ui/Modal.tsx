"use client";

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-label="Close modal overlay"
      />
      <div
        className={cn(
          'relative z-10 w-full max-w-xl rounded-3xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(7,14,30,0.96),rgba(4,9,22,0.92))] backdrop-blur-2xl shadow-[0_48px_120px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.07)] overflow-hidden animate-scale-in',
          className
        )}
      >
        {/* Top neon edge */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-white/40 hover:bg-white/[0.08] hover:text-white transition-all border border-transparent hover:border-white/[0.10]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
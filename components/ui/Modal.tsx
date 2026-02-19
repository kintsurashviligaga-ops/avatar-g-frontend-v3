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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal overlay"
      />
      <div className={cn('relative z-10 w-full max-w-xl ag-card ag-neon-ring animate-fade-in', className)}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-app-text">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-app-muted hover:bg-white/10 hover:text-app-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
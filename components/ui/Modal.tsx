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
          'relative z-10 w-full max-w-xl rounded-3xl backdrop-blur-2xl overflow-hidden animate-scale-in',
          className
        )}
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          boxShadow: '0 48px 120px rgba(0,0,0,0.25)',
        }}
      >
        {/* Top accent edge */}
        <div className="absolute top-0 inset-x-0 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--color-accent-soft), transparent)' }} />
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{title}</h3>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 transition-all"
              style={{ color: 'var(--color-text-tertiary)', border: '1px solid transparent' }}
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
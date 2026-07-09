'use client';

/**
 * LegalModal — INSTANT, pure-client Privacy Policy / Terms of Service modals.
 *
 * Replaces the old StudioSheet+iframe approach (which loaded a real Next.js page
 * in an iframe → visible delay + content flash). The text is inlined here, so the
 * modal paints in one frame with zero network requests. Portal + backdrop + ✕,
 * closable by ✕ · backdrop · Escape (mirrors CreditsModal / AuthModal).
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, FileText } from 'lucide-react';

export type LegalKind = 'privacy' | 'terms';

const CONTENT: Record<LegalKind, { title: string; updated: string; body: string[]; Icon: typeof Shield }> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: June 2024',
    Icon: Shield,
    body: [
      'MyAvatar collects minimal data necessary to provide AI generation services.',
      'We do not sell your data to third parties.',
      'Content you generate is stored securely and accessible only to you.',
      'For questions: support@myavatar.ge',
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'Last updated: June 2024',
    Icon: FileText,
    body: [
      'By using MyAvatar you agree to use the service lawfully and responsibly.',
      'Generated content must comply with Georgian law.',
      'We reserve the right to terminate accounts that violate these terms.',
      'Contact: support@myavatar.ge',
    ],
  },
};

interface LegalModalProps {
  kind: LegalKind | null;
  onClose: () => void;
}

export function LegalModal({ kind, onClose }: LegalModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [kind, onClose]);

  if (!mounted || typeof document === 'undefined' || !kind) return null;
  const c = CONTENT[kind];
  const Icon = c.Icon;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[112] flex items-center justify-center bg-black/60 p-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        onClick={(e) => e.stopPropagation()}
        className="relative z-[113] w-full max-w-[440px] overflow-hidden rounded-3xl border border-app-border/15 bg-app-surface shadow-[0_30px_90px_-20px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-app-elevated text-app-accent"><Icon size={16} /></span>
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-app-text">{c.title}</h2>
              <p className="text-[11px] text-app-muted">{c.updated}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
            <X size={17} />
          </button>
        </div>
        <div className="space-y-2.5 px-5 pb-6 pt-4 text-[14px] leading-[1.7] text-app-text/90">
          {c.body.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default LegalModal;

'use client';

/**
 * components/studio/ui/DeckViewer.tsx — the full-screen slide viewer.
 *
 * ⚠️ A FINISHED DECK COULD BE DOWNLOADED BUT NOT READ. The in-chat panel showed ~110px thumbnails
 * inside a 52vh scroll box and a ZIP button; tapping a slide did nothing, so the only way to see the
 * deck the user had just paid for was to download it and open it in another app.
 *
 * This is deliberately the SAME overlay the chat already uses for images (OmniStudio's `lightbox`,
 * OmniStudio.tsx:8378) — same backdrop, same close button, same safe-area insets — plus the one thing a
 * deck needs that a single picture does not: paging. It is a separate component rather than a call into
 * that lightbox because `setLightbox` holds ONE url, has no prev/next, and is not reachable from a panel
 * that OmniStudio renders without passing it down.
 *
 * Portaled to document.body for the reason OmniStudio's own Portal documents: the chat shell is
 * `fixed inset-0 z-[2]` and this panel lives inside an `overflow-y-auto overscroll-contain` card, so an
 * in-tree fixed overlay is trapped in the wrong stacking and scroll context.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, { close: string; prev: string; next: string }> = {
  ka: { close: 'დახურვა', prev: 'წინა სლაიდი', next: 'შემდეგი სლაიდი' },
  en: { close: 'Close', prev: 'Previous slide', next: 'Next slide' },
  ru: { close: 'Закрыть', prev: 'Предыдущий слайд', next: 'Следующий слайд' },
};

export function DeckViewer({
  images, index, onIndex, onClose, locale,
}: {
  /** Every page of the deck, cover first — the SAME array the grid renders, so indices cannot disagree. */
  images: string[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  locale: Lang;
}) {
  const t = COPY[locale] ?? COPY.ka;
  // SSR-safe mount flag — same guard as OmniStudio's Portal, no hydration flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const count = images.length;
  const go = useCallback((delta: number) => {
    onIndex(Math.max(0, Math.min(count - 1, index + delta)));
  }, [count, index, onIndex]);

  // Esc closes (matching the chat lightbox) and the arrow keys page (matching SlidesStudio). A deck that
  // cannot be advanced with the arrow keys is not a deck.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const url = images[index];
  // Every hook above runs unconditionally; only the render bails.
  if (!mounted || typeof document === 'undefined' || !url) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={onClose}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t.close}
        className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <X size={20} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${index + 1} / ${count}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] max-w-[96vw] rounded-lg object-contain"
      />
      {/* Paging sits where the chat lightbox puts its actions — thumb height, above the home indicator.
          The counter is between the arrows so the deck's length is never a guess. */}
      <div
        className="absolute inset-x-0 mx-auto flex w-fit items-center gap-2"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button" onClick={() => go(-1)} disabled={index === 0} aria-label={t.prev} title={t.prev}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-90 disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="min-w-[64px] text-center text-[13px] font-semibold tabular-nums text-white/90">{index + 1} / {count}</span>
        <button
          type="button" onClick={() => go(1)} disabled={index >= count - 1} aria-label={t.next} title={t.next}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-90 disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

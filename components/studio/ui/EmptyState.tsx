'use client';

/**
 * components/studio/ui/EmptyState.tsx — what a studio surface shows when it has NOTHING yet, and what it shows while
 * its content is still LOADING. One module, so every list, canvas and workspace answers those two moments the same way:
 *
 *   EmptyState         an icon, one line, and the one thing to do next (usually: write in the composer)
 *   Skeleton           one token-coloured block, sized like the thing it stands in for
 *   SkeletonList       N of them as a polite "loading" status for assistive tech
 *   WorkspaceSkeleton  a full-panel workspace (a header and a body) while its code chunk loads
 *   focusComposer      puts the caret in the studio composer, from anywhere on the page
 *
 * ⚠️ A SKELETON IS THE FINAL SIZE OR IT IS A LAYOUT SHIFT. Callers pass the same height/width classes the real content
 * uses (e.g. the 3D viewer's `h-[min(48vh,240px)] sm:h-[420px]`), so the content replaces the block in place instead of
 * pushing everything under it down when it lands.
 * ⚠️ NO MOTION UNDER prefers-reduced-motion: the pulse is `motion-safe:` only (docs/DESIGN.md §5).
 */
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BTN_PRIMARY } from './tokens';

type Lang = 'ka' | 'en' | 'ru';
const langOf = (locale?: string): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

/** What a screen reader hears while a skeleton is on screen (the blocks themselves are aria-hidden). */
export const LOADING_LABEL: Record<Lang, string> = { ka: 'იტვირთება…', en: 'Loading…', ru: 'Загрузка…' };

/**
 * Focuses the studio composer's text box. It is found through the anchor the composer carries for the first-run tour
 * (`data-tour="composer"`, OmniStudio) — never through a class name, which a restyle would silently break.
 * Returns whether the composer took the focus (false off the studio, or while the box is disabled).
 */
export function focusComposer(): boolean {
  if (typeof document === 'undefined') return false;
  const box = document.querySelector<HTMLTextAreaElement>('[data-tour="composer"] textarea');
  if (!box || box.disabled) return false;
  box.focus();
  return document.activeElement === box;
}

export function EmptyState({
  icon: Icon, line, actionLabel, onAction, compact = false, className = '', testId = 'empty-state',
}: {
  icon: LucideIcon;
  /** ONE line, already localised. */
  line: string;
  /** The one next step — usually "write in the composer" (see focusComposer). Omit both for a statement only. */
  actionLabel?: string;
  onAction?: () => void;
  /** For narrow places (the sidebar): a smaller icon and a text-style action instead of the filled CTA. */
  compact?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className={`flex flex-col items-center text-center ${compact ? 'gap-1.5 px-2 py-3' : 'gap-3 px-4 py-8'} ${className}`}>
      <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-muted ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}>
        <Icon size={compact ? 17 : 22} />
      </span>
      <p className={`max-w-[34ch] text-app-muted ${compact ? 'text-[12.5px] leading-[1.5]' : 'text-[14px] leading-[1.6]'}`}>{line}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={compact
            // The sidebar already carries the view's one filled CTA (sign in / top up) — a second would compete with it.
            ? 'inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-semibold text-app-accent transition-colors hover:bg-app-accent/10 touch-manipulation'
            : `${BTN_PRIMARY} px-5`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** One placeholder block. Pass the real content's size and radius; it is invisible to assistive tech. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" data-skeleton="" className={`block bg-app-elevated motion-safe:animate-pulse ${className}`} style={style} />;
}

/** N placeholder rows, announced once as "loading" (role=status) instead of N empty boxes. */
export function SkeletonList({
  count = 3, rowClassName = 'h-11 w-full rounded-lg', className = '', locale, testId = 'skeleton-list',
}: {
  count?: number;
  rowClassName?: string;
  className?: string;
  locale?: string;
  testId?: string;
}) {
  return (
    <div role="status" data-testid={testId} className={className}>
      <span className="sr-only">{LOADING_LABEL[langOf(locale)]}</span>
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={rowClassName} />)}
    </div>
  );
}

/**
 * A full-panel workspace (photo culling, the montage editor) while its chunk is still on the way: the header strip
 * and the body, in the panel's own proportions — the panel used to be a blank 96 px box that then jumped to full size.
 */
export function WorkspaceSkeleton({ locale }: { locale?: string }) {
  return (
    <div role="status" data-testid="workspace-skeleton" className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <span className="sr-only">{LOADING_LABEL[langOf(locale)]}</span>
      <div aria-hidden="true" className="flex shrink-0 items-center gap-2 border-b border-app-border/10 px-3 pb-3 pt-2 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-36 max-w-full rounded" />
          <Skeleton className="h-3 w-52 max-w-full rounded" />
        </div>
      </div>
      <div aria-hidden="true" className="flex min-h-0 flex-1 items-center justify-center p-4">
        <Skeleton className="h-[240px] w-full max-w-xl rounded-2xl" />
      </div>
    </div>
  );
}

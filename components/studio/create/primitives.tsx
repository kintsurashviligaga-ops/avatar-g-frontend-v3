'use client';

/**
 * components/studio/create/primitives.tsx — the small pieces the Music Create screen (and the Create screens that follow
 * it) are built from: the rounded card with a collapsible header, the 44 px round icon button (which can be honestly
 * LOCKED), the (i) tip, and the dropdown whose Escape does not also close the sheet it sits in.
 *
 * Tokens only (app-*), 44 px floors on everything a finger can press, and nothing here has a fixed width: every row
 * wraps or truncates, because Georgian runs 1.5–2× the length of the English the layouts were drawn with.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Info, Loader2 } from 'lucide-react';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

// ── cards ────────────────────────────────────────────────────────────────────────────────────────────

/** The rounded translucent card of the Create screens. `open === undefined` makes it a plain, non-collapsible card. */
export function PanelCard({
  title, titleExtra, open, onToggle, action, testId, children, className,
}: {
  title: ReactNode;
  /** Muted text after the title ("1/3"). */
  titleExtra?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  /** Top-right: the round wand button. */
  action?: ReactNode;
  testId?: string;
  children: ReactNode;
  className?: string;
}) {
  const collapsible = typeof open === 'boolean' && !!onToggle;
  const shown = open !== false;
  const bodyId = useId();
  return (
    <section data-testid={testId} className={cx('min-w-0 rounded-[26px] bg-app-elevated/45 p-4 ring-1 ring-app-border/10', className)}>
      <div className="flex min-h-[44px] items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="-ml-1 flex min-h-[44px] min-w-0 items-center gap-2 rounded-full px-1 text-left text-[16px] font-medium text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
          >
            <ChevronDown size={16} aria-hidden="true" className={cx('shrink-0 text-app-muted transition-transform', !open && '-rotate-90')} />
            <span className="min-w-0 truncate">{title}</span>
            {titleExtra != null && <span className="shrink-0 text-[12px] font-normal tabular-nums text-app-muted">{titleExtra}</span>}
          </button>
        ) : (
          <h3 className="flex min-w-0 items-center gap-2 text-[16px] font-medium text-app-text">
            <span className="min-w-0 truncate">{title}</span>
            {titleExtra != null && <span className="shrink-0 text-[12px] font-normal tabular-nums text-app-muted">{titleExtra}</span>}
          </h3>
        )}
        {action}
      </div>
      <div id={bodyId} hidden={!shown} className={cx(shown && 'pt-1')}>
        {shown ? children : null}
      </div>
    </section>
  );
}

// ── buttons ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * A 44 px round icon button.
 *
 * A LOCKED button is `aria-disabled`, not `disabled`: it stays focusable, so a keyboard or screen-reader user can find
 * it and hear WHY ("soon"), and it carries no handler at all — pressing it does nothing, by construction.
 */
export function RoundButton({
  icon, label, onClick, tone = 'soft', busy = false, locked = false, lockedNote, disabled = false, testId, pressed, expanded, haspopup,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  tone?: 'soft' | 'solid';
  busy?: boolean;
  locked?: boolean;
  /** Why it is locked, in words ("Inspire from a picture — soon"): the tooltip and the accessible description. */
  lockedNote?: string;
  disabled?: boolean;
  testId?: string;
  pressed?: boolean;
  expanded?: boolean;
  haspopup?: 'dialog' | 'menu' | 'listbox';
}) {
  const inert = locked || disabled || busy;
  return (
    <button
      type="button"
      data-testid={testId}
      data-locked={locked ? 'true' : undefined}
      aria-label={locked && lockedNote ? lockedNote : label}
      title={locked && lockedNote ? lockedNote : label}
      aria-disabled={locked || disabled ? true : undefined}
      aria-busy={busy || undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={haspopup}
      onClick={inert ? undefined : onClick}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-[opacity,transform,color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60',
        tone === 'solid'
          ? 'bg-app-text text-app-bg hover:opacity-90 active:scale-95'
          : 'bg-app-bg/50 text-app-muted ring-1 ring-app-border/10 hover:text-app-text active:scale-95',
        (locked || disabled) && 'cursor-not-allowed opacity-45 hover:opacity-45 active:scale-100',
      )}
    >
      {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : icon}
    </button>
  );
}

/** A pill the width of its words, 44 px tall — the Instrumental toggle and the like. */
export function PillButton({
  children, onClick, pressed, testId, icon, className, locked, lockedNote,
}: {
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  testId?: string;
  icon?: ReactNode;
  className?: string;
  locked?: boolean;
  lockedNote?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-locked={locked ? 'true' : undefined}
      aria-pressed={pressed}
      aria-disabled={locked ? true : undefined}
      title={locked ? lockedNote : undefined}
      onClick={locked ? undefined : onClick}
      className={cx(
        'inline-flex h-11 min-w-0 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full px-3.5 text-[14px] font-medium ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60',
        pressed ? 'bg-app-accent/15 text-app-accent ring-app-accent/40' : 'bg-app-bg/50 text-app-text/85 ring-app-border/15 hover:text-app-text',
        locked && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

// ── (i) ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The (i) beside a label. It toggles a sentence under the row (not a hover tooltip: a phone has no hover) — the caller
 * renders `tip` where it wants it, so the row's own layout is untouched.
 */
export function useInfoTip() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return { open, id, toggle: () => setOpen((v) => !v) };
}

export function InfoButton({ label, open, controls, onClick }: { label: string; open: boolean; controls: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      className="-my-2 inline-flex h-11 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-app-muted transition-colors hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
    >
      <Info size={15} aria-hidden="true" />
    </button>
  );
}

// ── dropdown ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * A positioning root for a trigger and the panel that drops from it. While open: a press outside closes it, and Escape
 * closes IT — in the CAPTURE phase with stopPropagation, so the sheet around it (useDialogA11y listens on `window`,
 * bubble phase) does not also answer the same key and close under the user's finger.
 */
export function Dropdown({ open, onClose, className, children }: { open: boolean; onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return <div ref={ref} className={cx('relative', className)}>{children}</div>;
}

/** The floating panel itself: opaque enough to read over the cards beneath it, never wider than its container. */
export function FloatingPanel({
  children, label, align = 'right', placement = 'bottom', testId, className,
}: {
  children: ReactNode;
  label: string;
  align?: 'left' | 'right' | 'center';
  placement?: 'bottom' | 'top';
  testId?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className={cx(
        'absolute z-30 w-[min(20rem,calc(100vw-2rem))] max-w-full rounded-2xl bg-app-surface p-1.5 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.55)] ring-1 ring-app-border/15',
        placement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
        align === 'right' ? 'right-0' : align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2',
        className,
      )}
    >
      {children}
    </div>
  );
}

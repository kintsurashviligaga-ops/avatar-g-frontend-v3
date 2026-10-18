'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useViewportClamp } from '@/lib/ui/useViewportClamp';

/**
 * The „⋯ მეტი“ of a reply's action row. The owner's PRD (2026-10-18): under a reply only three icons stay on screen —
 * copy, listen and more; rating, regenerate and share live behind this one button.
 *
 * A WAI-ARIA menu button: the menu opens above the row (the last reply's row sits right over the composer), focus moves
 * into it, the arrows walk it, Escape and Tab close it, a tap outside closes it, and a choice closes it and runs.
 * The viewport clamp keeps it on a 320 px screen (lib/ui/useViewportClamp).
 */
export interface ReplyMoreItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** A toggle that is on (a rating already given): drawn in the accent and announced as checked. */
  checked?: boolean;
}

type Lang = 'ka' | 'en' | 'ru';
const MORE: Record<Lang, string> = { ka: 'მეტი', en: 'More', ru: 'Ещё' };

export function ReplyMoreMenu({ locale, items, triggerClassName = '' }: {
  locale: string;
  items: ReplyMoreItem[];
  /** The row's own icon-button look, so the trigger sits in line with copy and listen. */
  triggerClassName?: string;
}) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const [open, setOpen] = useState(false);
  const clamp = useViewportClamp(open);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Capture phase: Escape closes this menu without also closing a sheet under it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) itemsRef.current.find(Boolean)?.focus();
  }, [open]);

  if (!items.length) return null;

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = itemsRef.current.filter((el): el is HTMLButtonElement => !!el);
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => { e.preventDefault(); list[(to + list.length) % list.length]?.focus(); };
    switch (e.key) {
      case 'ArrowDown': move(at + 1); break;
      case 'ArrowUp': move(at < 0 ? list.length - 1 : at - 1); break;
      case 'Home': move(0); break;
      case 'End': move(list.length - 1); break;
      case 'Tab': setOpen(false); break;
      default: break;
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button ref={triggerRef} type="button" onClick={() => setOpen((v) => !v)}
        aria-label={MORE[lang]} title={MORE[lang]} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        data-testid="reply-more" className={`${triggerClassName} ${open ? 'text-app-text' : ''}`}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={MORE[lang]} data-testid="reply-more-menu" onKeyDown={onMenuKeyDown}
          {...clamp.props}
          className="absolute bottom-full left-0 z-50 mb-1 min-w-[12rem] max-w-[calc(100vw-1rem)] rounded-[16px] bg-app-elevated p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-1 ring-app-border/10">
          {items.map((it, i) => {
            const Icon = it.icon;
            const toggle = it.checked !== undefined;
            return (
              <button key={it.id} ref={(el) => { itemsRef.current[i] = el; }} type="button"
                role={toggle ? 'menuitemcheckbox' : 'menuitem'} aria-checked={toggle ? it.checked : undefined}
                onClick={() => { close(true); it.onSelect(); }}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] font-medium transition-colors duration-200 hover:bg-app-border/10 focus-visible:bg-app-border/10 focus-visible:outline-none ${it.checked ? 'text-app-accent' : 'text-app-text'}`}>
                <Icon size={17} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 truncate">{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

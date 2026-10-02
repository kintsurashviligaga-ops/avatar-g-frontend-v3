'use client';

/**
 * The hub's small shared pieces: a section (title + one line + its content), a slot for a card another feature owns, and the
 * status tag. Theme tokens only (`app-*`); the accent appears on the "available" tag alone (docs/DESIGN.md §2 — small badges).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function HubSection({ icon: Icon, title, sub, testId, children }: { icon: LucideIcon; title: string; sub: string; testId: string; children: ReactNode }) {
  const h = useId();
  return (
    <section aria-labelledby={h} data-testid={testId} className="px-2">
      <div className="flex items-start gap-3 px-1">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text/80" aria-hidden="true"><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 id={h} className="text-[14.5px] font-semibold text-app-text">{title}</h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-app-muted">{sub}</p>
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * Renders a card another feature owns (the push opt-in, the WhatsApp link) and says so plainly when that card renders nothing
 * — a section title over an empty space would read as a promise. The card may render late (it fetches first), so the slot is
 * watched, not measured once.
 */
export function CardSlot({ children, fallback, testId }: { children: ReactNode; fallback: ReactNode; testId: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setEmpty(el.childElementCount === 0 && !(el.textContent ?? '').trim());
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);
  return (
    <>
      <div ref={ref} data-testid={testId}>{children}</div>
      {empty && (typeof fallback === 'string'
        ? <p data-testid={`${testId}-empty`} className="px-1 text-[12.5px] text-app-muted">{fallback}</p>
        : <div data-testid={`${testId}-empty`}>{fallback}</div>)}
    </>
  );
}

export function StateTag({ label, accent = false, testId }: { label: string; accent?: boolean; testId?: string }) {
  return (
    <span data-testid={testId} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider ${accent ? 'bg-app-accent/15 text-app-accent' : 'bg-app-elevated text-app-muted'}`}>
      {label}
    </span>
  );
}

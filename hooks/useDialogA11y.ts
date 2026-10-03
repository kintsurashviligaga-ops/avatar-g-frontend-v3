import { useEffect, useRef } from 'react';

/**
 * Accessibility plumbing shared by every overlay (mobile nav drawers, settings /
 * profile modals). Attach the returned ref to the dialog container and pass the
 * open flag + close handler. While `open` is true it:
 *
 *   • moves keyboard/AT focus into the dialog (first focusable, else the container),
 *   • closes on Escape (so external-keyboard / tablet users can back out),
 *   • traps Tab inside the dialog (focus can't wander behind the backdrop),
 *   • restores focus to whatever was focused before it opened (usually the trigger).
 *
 * Pair it with role="dialog" aria-modal="true" + an aria-label on the container.
 * `onClose` is read through a ref so a fresh inline closure each render doesn't
 * re-run the effect (which would re-capture focus mid-interaction).
 */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The open dialogs, oldest first. ⚠️ EVERY OPEN DIALOG USED TO ANSWER THE SAME KEY. Each one adds its own window
 * listener, so with a sheet opened FROM another sheet (the studio's settings → „შეცვლა“ → the tool list) one Escape
 * closed both, and focus fell to <body>. Only the top-most dialog answers Escape and traps Tab now; the one under it
 * takes over again when the top closes, with focus back on the control that opened it.
 */
const openStack: { token: object; node: HTMLElement | null }[] = [];

export function useDialogA11y<T extends HTMLElement = HTMLElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const node = ref.current;
    const token = {};
    // Effects run child-first, so a dialog mounted in the same commit as one NESTED inside it registers second. It
    // still belongs UNDER that child: insert it before the first open dialog it contains; otherwise on top.
    const inner = openStack.findIndex((d) => !!node && !!d.node && d.node !== node && node.contains(d.node));
    if (inner >= 0) openStack.splice(inner, 0, { token, node });
    else openStack.push({ token, node });
    // Remember the trigger so focus can return to it on close.
    restoreRef.current = (document.activeElement as HTMLElement) ?? null;

    // Defer the focus move to the next frame so the (just-mounted / transitioning)
    // dialog is laid out and its children are focusable.
    const raf = requestAnimationFrame(() => {
      if (!node) return;
      // A dialog can name the control a person starts with (`data-autofocus`, e.g. the sign-in sheet's email field);
      // otherwise the first focusable — which in most sheets is the ✕, so the field still had to be tapped first.
      const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1]?.token !== token) return; // a dialog above this one owns the keyboard
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        );
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      const at = openStack.findIndex((d) => d.token === token);
      if (at >= 0) openStack.splice(at, 1);
      const prev = restoreRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    };
  }, [open]);

  return ref;
}

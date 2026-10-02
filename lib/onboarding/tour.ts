/**
 * lib/onboarding/tour.ts — the first-run tour's rules, outside the component so they test without a browser:
 * which steps exist and what each points at, whether the tour was already seen, whether it may start right now, and
 * where its card goes. The card itself is components/onboarding/OnboardingTour.tsx.
 *
 * ⚠️ STEPS POINT AT data-tour="…" ANCHORS, NEVER AT CSS SELECTORS. A class or a DOM path is a restyle away from pointing
 * at nothing (or at the wrong thing); an anchor is a promise the owning component makes in its own source. Today:
 *   composer     OmniStudio — the prompt pill
 *   tool-avatar  ChatChrome — the Avatar row of the sidebar's „სერვისები" (and the collapsed rail's Avatar button)
 *   twin         ChatChrome — the Digital Twin entry (only rendered with NEXT_PUBLIC_TWIN_ENABLED)
 * An anchor that is missing, off-canvas (the phone drawer is translated out of view, not removed) or covered by
 * something on top is NOT SHOWING, and its step is skipped — the card must never point at something you cannot see.
 */

export const TOUR_SEEN_KEY = 'myavatar:tour-seen';
/** ChatChrome's first-login welcome (components/onboarding/WelcomeOnboarding) writes this when it is finished. */
export const WELCOME_SEEN_KEY = 'myavatar:welcomed';
/** How long the studio must sit still — anchor up, nothing on top, nobody typing — before the tour may appear. */
export const TOUR_START_DELAY_MS = 900;

export type TourAnchorId = 'composer' | 'tool-avatar' | 'twin';
export type TourStepId = 'start' | 'avatar';
export type TourSide = 'top' | 'bottom' | 'left' | 'right';

export interface TourStepDef {
  id: TourStepId;
  /** Candidates in order of preference; the first one SHOWING is used, none showing skips the step. */
  anchors: readonly TourAnchorId[];
  /** Where the card goes relative to the anchor, best first. */
  sides: readonly TourSide[];
}

/**
 * The steps. ⚠️ THE TWIN IS BEHIND NEXT_PUBLIC_TWIN_ENABLED (off in production until legal approves the consent copy):
 * with the flag off the twin anchor is not even a candidate, so the step can only ever point at the Avatar tool — the
 * tool a twin is used in. With it on, a SHOWING twin entry wins; today that entry lives inside the Settings dialog,
 * which the tour never opens, so in practice step 2 still falls back to the Avatar tool.
 */
export function tourSteps(twinEnabled: boolean): TourStepDef[] {
  return [
    { id: 'start', anchors: ['composer'], sides: ['top', 'bottom'] },
    { id: 'avatar', anchors: twinEnabled ? ['twin', 'tool-avatar'] : ['tool-avatar'], sides: ['right', 'bottom', 'top'] },
  ];
}

// ── "Seen" — once per device ────────────────────────────────────────────────────────────────────────────────────────

/** In-memory fallback: with storage blocked (private mode, a strict policy) the tour still shows only once per page. */
let seenThisPage = false;

function storageOrNull(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** Every read is wrapped: a throwing localStorage (Safari private mode, blocked cookies) reads as "not seen". */
export function readTourSeen(storage: Storage | null = storageOrNull()): boolean {
  if (seenThisPage) return true;
  try { return storage?.getItem(TOUR_SEEN_KEY) === '1'; } catch { return false; }
}

export function markTourSeen(storage: Storage | null = storageOrNull()): void {
  seenThisPage = true;
  try { storage?.setItem(TOUR_SEEN_KEY, '1'); } catch { /* blocked storage — the in-memory flag holds for this page */ }
}

/** Tests only. */
export function resetTourMemory(): void {
  seenThisPage = false;
}

/**
 * True while ChatChrome's first-login welcome is still due: a signed-in user (`<html data-authed="1">`, published by
 * ChatChrome) who has not finished it on this device. The tour waits for it — the two must never stack.
 * A throwing storage means ChatChrome shows no welcome either (its catch), so it is not pending.
 */
export function welcomePending(root: HTMLElement | null, storage: Storage | null = storageOrNull()): boolean {
  if (root?.dataset.authed !== '1') return false;
  try { return storage?.getItem(WELCOME_SEEN_KEY) !== '1'; } catch { return false; }
}

// ── The DOM checks ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface Box { top: number; left: number; width: number; height: number }
export interface Size { width: number; height: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * On screen and not covered: real size, inside the viewport, and the topmost element at its centre is the anchor
 * itself (or inside it). The last test is what catches every overlay at once — the welcome, the sign-in sheet (which
 * has no role="dialog"), the phone drawer's backdrop, a settings or tool sheet, a lightbox.
 */
export function anchorShowing(el: Element, view: Size = viewportSize()): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  if (r.right <= 0 || r.bottom <= 0 || r.left >= view.width || r.top >= view.height) return false;
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  if (style && (style.visibility === 'hidden' || style.display === 'none')) return false;
  const doc = el.ownerDocument;
  if (typeof doc.elementFromPoint === 'function') {
    const x = clamp(r.left + r.width / 2, 0, view.width - 1);
    const y = clamp(r.top + r.height / 2, 0, view.height - 1);
    const top = doc.elementFromPoint(x, y);
    // The tour's own card never counts as cover (on a cramped screen it may have to overlap its anchor).
    if (top && top !== el && !el.contains(top) && !top.closest('[data-tour-card]')) return false;
  }
  return true;
}

/** The first SHOWING element carrying `data-tour="<id>"` (one anchor may sit on two elements: a row and a rail icon). */
export function findTourAnchor(id: TourAnchorId, doc: Document = document): HTMLElement | null {
  const view = viewportSize(doc.defaultView);
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`))) {
    if (anchorShowing(el, view)) return el;
  }
  return null;
}

/**
 * Any other dialog on screen — a modal, a sheet, and also the non-modal cookie banner: the tour never stacks on any of
 * them. `ignore` is the tour's own card.
 */
export function otherDialogShowing(doc: Document = document, ignore?: Element | null): boolean {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [aria-modal="true"]'))) {
    if (ignore && (el === ignore || ignore.contains(el))) continue;
    if (el.closest('[data-tour-card]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 1 && r.height >= 1) return true;
  }
  return false;
}

export interface ResolvedStep { id: TourStepId; anchor: TourAnchorId; el: HTMLElement; sides: readonly TourSide[] }

/** The steps whose anchor is showing right now, in order. */
export function resolveTourSteps(twinEnabled: boolean, doc: Document = document): ResolvedStep[] {
  const out: ResolvedStep[] = [];
  for (const step of tourSteps(twinEnabled)) {
    for (const anchor of step.anchors) {
      const el = findTourAnchor(anchor, doc);
      if (el) { out.push({ id: step.id, anchor, el, sides: step.sides }); break; }
    }
  }
  return out;
}

export function viewportSize(win: Window | null | undefined = typeof window !== 'undefined' ? window : undefined): Size {
  return { width: win?.innerWidth ?? 0, height: win?.innerHeight ?? 0 };
}

// ── Where the card goes ─────────────────────────────────────────────────────────────────────────────────────────────

export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Placement { side: TourSide; top: number; left: number; /** Where the arrow meets the card's edge, in card px. */ arrow: number }

/**
 * Beside the anchor, never over it: the first preferred side with room for the card, else the roomiest one, then
 * clamped inside the viewport minus the safe-area insets and a margin — at 320 px wide the card still fits whole.
 */
export function placeTourCard(
  anchor: Box,
  card: Size,
  view: Size,
  sides: readonly TourSide[],
  { gap = 12, margin = 12, insets = { top: 0, right: 0, bottom: 0, left: 0 } }: { gap?: number; margin?: number; insets?: Insets } = {},
): Placement {
  const minX = insets.left + margin;
  const maxX = view.width - insets.right - margin;
  const minY = insets.top + margin;
  const maxY = view.height - insets.bottom - margin;
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  const room: Record<TourSide, number> = {
    top: anchor.top - minY - gap,
    bottom: maxY - bottom - gap,
    left: anchor.left - minX - gap,
    right: maxX - right - gap,
  };
  const need = (s: TourSide) => (s === 'top' || s === 'bottom' ? card.height : card.width);
  const order = sides.length ? sides : (['top', 'bottom'] as const);
  const side = order.find((s) => room[s] >= need(s))
    ?? [...order].sort((a, b) => room[b] / need(b) - room[a] / need(a))[0]!;

  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;
  let top: number;
  let left: number;
  if (side === 'top' || side === 'bottom') {
    left = clamp(cx - card.width / 2, minX, maxX - card.width);
    top = side === 'top' ? anchor.top - gap - card.height : bottom + gap;
  } else {
    top = clamp(cy - card.height / 2, minY, maxY - card.height);
    left = side === 'left' ? anchor.left - gap - card.width : right + gap;
  }
  top = clamp(top, minY, maxY - card.height);
  left = clamp(left, minX, maxX - card.width);
  const arrow = side === 'top' || side === 'bottom'
    ? clamp(cx - left, 18, card.width - 18)
    : clamp(cy - top, 18, card.height - 18);
  return { side, top: Math.round(top), left: Math.round(left), arrow: Math.round(arrow) };
}

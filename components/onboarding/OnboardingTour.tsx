'use client';

/**
 * OnboardingTour — a short, skippable first-run tour of the studio (/{lang}/dashboard and the guest home /{lang}, which
 * are the same studio). Step 1 points at the composer: "Start here — describe what you want to create". Step 2 points
 * at the Digital Twin entry when NEXT_PUBLIC_TWIN_ENABLED is on and that entry is on screen, otherwise at the Avatar
 * tool in the sidebar; on a phone the sidebar is a closed drawer, so the step is skipped (lib/onboarding/tour.ts).
 *
 * The rules it keeps:
 *  · ONCE PER DEVICE: "seen" is stored in localStorage (every access in try/catch; an in-memory flag covers blocked
 *    storage). Any dismissal counts — Skip, Escape, Got it, or simply using the page.
 *  · NEVER OVER ANOTHER LAYER: it waits while any dialog is on screen (the cookie banner included), while ChatChrome's
 *    first-login welcome is still due (the tour starts only after it is dismissed — the two never stack), and while
 *    its anchor is covered or off-screen. A layer that opens over a showing tour sends it back to waiting.
 *  · NEVER IN THE WAY: it appears only after the studio has sat still for TOUR_START_DELAY_MS, and someone who starts
 *    using the page before that — a tap, a key, focusing a field — is not interrupted (it simply does not show on this
 *    visit, and is not marked seen). Once shown it is NON-MODAL: nothing behind it is blocked, and a tap or focus
 *    anywhere else dismisses it quietly, without pulling focus back.
 *  · A REAL DIALOG FOR ASSISTIVE TECH: role="dialog" with aria-labelledby / aria-describedby; focus moves to its
 *    primary button when it opens and returns to where it was when Skip / Escape / Got it closes it.
 *  · MOTION: a 200 ms fade and an 8 px rise (docs/DESIGN.md §5); none under prefers-reduced-motion.
 *
 * Mounted once by ServiceHub on the studio surface (`<OnboardingTour locale={lang} />`), through next/dynamic, so it
 * costs the dashboard's first load nothing. Its own ErrorBoundary keeps a tour bug from ever taking the studio down.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import ErrorBoundary from '@/components/ErrorBoundary';
import { isTwinEnabled } from '@/lib/twin/flag';
import { twinCopy } from '@/components/twin/copy';
import { TOOL_META } from '@/lib/studio/tools';
import {
  TOUR_START_DELAY_MS, anchorShowing, findTourAnchor, markTourSeen, otherDialogShowing, placeTourCard, readTourSeen,
  resolveTourSteps, viewportSize, welcomePending, type Insets, type Placement, type ResolvedStep, type TourAnchorId,
} from '@/lib/onboarding/tour';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  skip: string; next: string; done: string; step: (i: number, n: number) => string;
  startTitle: string; startBody: string; avatarBody: string; twinBody: string;
}> = {
  ka: {
    skip: 'გამოტოვება', next: 'შემდეგი', done: 'გასაგებია', step: (i, n) => `ნაბიჯი ${i} / ${n}`,
    startTitle: 'დაიწყე აქ',
    startBody: 'აღწერე, რისი შექმნა გინდა — ტექსტით, ხმით ან ფაილით.',
    avatarBody: 'ავატარში ნებისმიერი პორტრეტი მოლაპარაკე ვიდეოდ იქცევა.',
    twinBody: 'ერთხელ გადაიღე სახე და ხმა — შემდეგ ავატარში გამოიყენე.',
  },
  en: {
    skip: 'Skip', next: 'Next', done: 'Got it', step: (i, n) => `Step ${i} of ${n}`,
    startTitle: 'Start here',
    startBody: 'Describe what you want to create — by text, voice or file.',
    avatarBody: 'In Avatar, any portrait becomes a talking video.',
    twinBody: 'Capture your face and voice once — then use them in Avatar.',
  },
  ru: {
    skip: 'Пропустить', next: 'Далее', done: 'Понятно', step: (i, n) => `Шаг ${i} из ${n}`,
    startTitle: 'Начните здесь',
    startBody: 'Опишите, что хотите создать, — текстом, голосом или файлом.',
    avatarBody: 'В «Аватаре» любой портрет превращается в говорящее видео.',
    twinBody: 'Один раз снимите лицо и голос — затем используйте их в «Аватаре».',
  },
};

/** The words for the anchor a step actually landed on (step 2 says "twin" only when it points at the twin). */
function stepText(anchor: TourAnchorId, lang: Lang): { title: string; body: string } {
  const c = COPY[lang];
  if (anchor === 'composer') return { title: c.startTitle, body: c.startBody };
  if (anchor === 'twin') return { title: twinCopy(lang).menuEntry, body: c.twinBody };
  return { title: TOOL_META.avatar.sub[lang], body: c.avatarBody };
}

const POLL_MS = 250;
const EASE: [number, number, number, number] = [0.2, 0.7, 0.2, 1];

const isEditable = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('textarea, select, [contenteditable=""], [contenteditable="true"], input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])');
};
const inOtherLayer = (t: EventTarget | null): boolean => {
  const el = t as Element | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
};

/** env(safe-area-inset-*) is CSS-only; a throwaway probe turns it into pixels for the card's clamp. */
function safeAreaInsets(): Insets {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof document === 'undefined' || !document.body) return zero;
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
    const out = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
    probe.remove();
    return out;
  } catch {
    return zero;
  }
}

type Phase = 'idle' | 'waiting' | 'showing' | 'off';
interface Geometry { ring: { top: number; left: number; width: number; height: number; radius: number }; place: Placement }

function Tour({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const c = COPY[lang];
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('idle');
  const [steps, setSteps] = useState<ResolvedStep[]>([]);
  const [index, setIndex] = useState(0);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  /** Set the instant the tour leaves the screen, so a check or a focus already queued cannot act on it again. */
  const closedRef = useRef(false);
  const insetsRef = useRef<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const uid = useId();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;
  const countId = `${uid}-count`;
  const step = phase === 'showing' ? steps[index] : undefined;

  useEffect(() => {
    setMounted(true);
    setPhase(readTourSeen() ? 'off' : 'waiting');
  }, []);

  // ── WAITING: start only once the studio has been still for the delay; someone already acting is not interrupted. ──
  useEffect(() => {
    if (phase !== 'waiting') return;
    let stillTicks = 0;
    // ⚠️ A local flag, not just state: a tick already queued must not resurrect the tour after the visitor acted —
    // the state change that ends this effect lands a render later than the event that caused it.
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (readTourSeen()) { stopped = true; setPhase('off'); return; }
      const ready = document.visibilityState !== 'hidden'
        && !otherDialogShowing(document)
        && !welcomePending(document.documentElement)
        && !!findTourAnchor('composer');
      stillTicks = ready ? stillTicks + 1 : 0;
      if (stillTicks * POLL_MS < TOUR_START_DELAY_MS) return;
      const resolved = resolveTourSteps(isTwinEnabled());
      if (resolved[0]?.id !== 'start') { stillTicks = 0; return; }
      const active = document.activeElement;
      restoreRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
      insetsRef.current = safeAreaInsets();
      stopped = true;
      closedRef.current = false;
      setSteps(resolved);
      setIndex(0);
      setGeo(null);
      setPhase('showing');
    };
    // Using the page first (outside another layer: the cookie banner and the welcome do not count) means the visitor
    // has found their way — the tour stays away for this visit, and is NOT marked seen.
    const onActivity = (e: Event) => {
      if (stopped || inOtherLayer(e.target)) return;
      if (e.type === 'focusin' && !isEditable(e.target)) return;
      stopped = true;
      setPhase('off');
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('pointerdown', onActivity, true);
    document.addEventListener('keydown', onActivity, true);
    document.addEventListener('focusin', onActivity, true);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('pointerdown', onActivity, true);
      document.removeEventListener('keydown', onActivity, true);
      document.removeEventListener('focusin', onActivity, true);
    };
  }, [phase]);

  /** Close for good. `restoreFocus` only for the tour's own controls — a tap elsewhere keeps the focus it moved to. */
  const finish = useCallback((restoreFocus: boolean) => {
    if (closedRef.current) return;
    closedRef.current = true;
    markTourSeen();
    setPhase('off');
    if (!restoreFocus) return;
    const prev = restoreRef.current;
    if (prev && prev.isConnected && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    else if (cardRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  /** The next step whose anchor is still showing; none left finishes the tour. */
  const advance = useCallback((from: number, restoreFocus: boolean) => {
    for (let i = from + 1; i < steps.length; i++) {
      if (anchorShowing(steps[i]!.el)) { setGeo(null); setIndex(i); return; }
    }
    finish(restoreFocus);
  }, [steps, finish]);

  // ── SHOWING: the card follows its anchor, a layer on top sends it back to waiting, a lost anchor skips ahead. ────────
  const measure = useCallback(() => {
    const card = cardRef.current;
    if (!step || !card) return;
    const r = step.el.getBoundingClientRect();
    const place = placeTourCard(r, { width: card.offsetWidth, height: card.offsetHeight }, viewportSize(), step.sides, { insets: insetsRef.current });
    const radius = Math.min(parseFloat(getComputedStyle(step.el).borderTopLeftRadius) || 12, (r.height + 8) / 2) + 4;
    const ring = { top: Math.round(r.top - 4), left: Math.round(r.left - 4), width: Math.round(r.width + 8), height: Math.round(r.height + 8), radius };
    setGeo((g) => (g && g.place.top === place.top && g.place.left === place.left && g.place.side === place.side
      && g.ring.top === ring.top && g.ring.left === ring.left && g.ring.width === ring.width && g.ring.height === ring.height ? g : { ring, place }));
  }, [step]);

  /** The card mounts after the previous one has faded out (AnimatePresence mode="wait") — measure it as it attaches. */
  const setCard = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    if (node) measure();
  }, [measure]);

  useEffect(() => {
    if (phase !== 'showing' || !step) return;
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const check = () => {
      if (closedRef.current) return;
      if (otherDialogShowing(document, cardRef.current) || welcomePending(document.documentElement)) {
        // Back to waiting, NOT seen: it returns once the layer on top is gone.
        closedRef.current = true;
        setPhase('waiting');
        return;
      }
      if (!anchorShowing(step.el)) { advance(index, false); return; }
      measure();
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const id = window.setInterval(check, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.clearInterval(id);
    };
  }, [phase, step, index, measure, advance]);

  // Non-modal: a tap or a focus anywhere else ends the tour quietly; Escape ends it from anywhere.
  useEffect(() => {
    if (phase !== 'showing') return;
    const inCard = (t: EventTarget | null) => t instanceof Node && !!cardRef.current?.contains(t);
    const onDown = (e: PointerEvent) => { if (!inCard(e.target)) finish(false); };
    const onFocus = (e: FocusEvent) => { if (!inCard(e.target)) finish(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || closedRef.current) return;
      e.preventDefault();
      finish(true);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [phase, finish]);

  // Focus moves INTO the card once it is placed (and again on each step).
  useEffect(() => {
    if (phase !== 'showing' || !geo) return;
    const raf = requestAnimationFrame(() => {
      if (closedRef.current) return;
      if (primaryRef.current && !cardRef.current?.contains(document.activeElement)) primaryRef.current.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [phase, index, geo]);

  if (!mounted || typeof document === 'undefined') return null;

  const last = index >= steps.length - 1;
  const text = step ? stepText(step.anchor, lang) : null;
  const side = geo?.place.side ?? 'top';
  const rise = reduce ? 0 : side === 'top' ? 8 : side === 'bottom' ? -8 : 0;
  const fade = { duration: reduce ? 0 : 0.2, ease: EASE };
  // The arrow: a small square, turned, sitting on the edge that faces the anchor.
  const arrowStyle: React.CSSProperties = side === 'top' ? { bottom: -6, left: (geo?.place.arrow ?? 0) - 6 }
    : side === 'bottom' ? { top: -6, left: (geo?.place.arrow ?? 0) - 6 }
      : side === 'right' ? { left: -6, top: (geo?.place.arrow ?? 0) - 6 }
        : { right: -6, top: (geo?.place.arrow ?? 0) - 6 };
  const arrowEdges = side === 'top' ? 'border-b border-r' : side === 'bottom' ? 'border-l border-t' : side === 'right' ? 'border-b border-l' : 'border-r border-t';

  return createPortal(
    <AnimatePresence mode="wait">
      {step && text && (
        <motion.div key={index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }} transition={fade}>
          {geo && (
            <div aria-hidden="true" data-tour-ring=""
              className="pointer-events-none fixed z-[89] ring-2 ring-app-accent"
              style={{ top: geo.ring.top, left: geo.ring.left, width: geo.ring.width, height: geo.ring.height, borderRadius: geo.ring.radius }} />
          )}
          <motion.div
            ref={setCard}
            role="dialog"
            aria-labelledby={titleId}
            aria-describedby={`${bodyId} ${countId}`}
            data-tour-card=""
            data-tour-step={step.anchor}
            data-testid="onboarding-tour"
            initial={{ y: rise }}
            animate={{ y: 0 }}
            transition={fade}
            className="fixed z-[90] w-[min(320px,calc(100vw-32px))] rounded-2xl border border-app-border/15 bg-app-elevated p-4 text-app-text shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
            // Hidden until measured, so it never flashes at the corner before it is placed beside its anchor.
            style={{ top: geo?.place.top ?? 0, left: geo?.place.left ?? 0, visibility: geo ? 'visible' : 'hidden' }}
          >
            <span aria-hidden="true" className={`absolute h-3 w-3 rotate-45 border-app-border/15 bg-app-elevated ${arrowEdges}`} style={arrowStyle} />
            <h2 id={titleId} className="text-[15px] font-semibold leading-[1.4] text-app-text">{text.title}</h2>
            <p id={bodyId} className="mt-1 text-[14px] leading-[1.55] text-app-muted">{text.body}</p>
            <div className="mt-3 flex items-center gap-2">
              {steps.length > 1 ? (
                <p id={countId} className="min-w-0 flex-1 text-[12px] tabular-nums text-app-muted">
                  <span aria-hidden="true">{index + 1} / {steps.length}</span>
                  <span className="sr-only">{c.step(index + 1, steps.length)}</span>
                </p>
              ) : <span id={countId} className="flex-1" />}
              {/* Skip stays on every step — on a phone the tour is a single step, and it must still say how to leave. */}
              <button type="button" onClick={() => finish(true)}
                className="inline-flex min-h-[44px] items-center rounded-full px-3 text-[13.5px] font-medium text-app-muted transition-colors hover:bg-app-border/10 hover:text-app-text touch-manipulation">
                {c.skip}
              </button>
              <button ref={primaryRef} type="button" onClick={() => (last ? finish(true) : advance(index, true))}
                className="inline-flex min-h-[44px] items-center rounded-full bg-app-accent px-4 text-[13.5px] font-semibold text-app-bg transition-opacity hover:opacity-90 touch-manipulation">
                {last ? c.done : c.next}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default function OnboardingTour({ locale = 'ka' }: { locale?: string }) {
  return (
    <ErrorBoundary fallback={null}>
      <Tour locale={locale} />
    </ErrorBoundary>
  );
}

'use client';

/**
 * LiveCallChrome — the pieces of the full-screen call that every voice engine shares, so a user sees ONE call screen
 * whichever engine answers: the Gemini Live call (LiveModeOverlay) and the ElevenLabs fallback (VoiceConversation,
 * used when Gemini Live is unavailable for that user).
 *
 * ⚠️ THE FALLBACK USED TO LOOK LIKE ANOTHER PRODUCT (the owner, 2026-10-03: "the rocket logo on the Live chat, as here,
 * for users too"). VoiceConversation drew a canvas metaball orb that went crimson → violet while speaking — the banned
 * "AI purple" and glow soup (docs/DESIGN.md §6) — with no rocket, no „Live call“ label and a bare ✕. It now renders
 * these pieces around the same LiveOrb, so the two screens can only drift apart on purpose.
 *
 *   LiveCallFrame   the dark full-screen dialog (pinned dark, above every toast and tray; the host portals it)
 *   LiveBottomScrim the scrim under the control row
 *   LiveTopBar      the live dot + „ცოცხალი ზარი“ on the left, round 44 px buttons on the right
 *   LiveTopToggle   one of those round buttons, as a toggle (captions)
 *   LiveStatusLine  the compact waveform beside the quiet status line
 *   LiveErrorPanel  icon · headline · the reason · a hint · the browser's error name · actions
 *   LiveControlRow  the bottom row of LiveControls (round 56 px glass buttons, each with its word)
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { LiveWaveform, type LiveOrbState } from './LiveOrb';
import type { LiveLevels } from './useGeminiLiveSession';

type Locale = 'ka' | 'en' | 'ru';

/** The product's toggle grammar: a control inverts while on. */
export const LIVE_TOGGLE_ON = 'bg-app-text text-app-bg';

/** Georgian's tall script keeps the 16 px floor; Latin and Cyrillic secondary copy stays a step quieter. */
export function liveQuietText(locale: Locale): string {
  return locale === 'ka' ? 'text-[16px]' : 'text-[15px]';
}

/** The one solid button on the call screen (Retry, "tap to turn on sound", "tap to start"): text-colour fill, ink text. */
export function livePrimaryButtonClass(locale: Locale): string {
  return `inline-flex h-11 touch-manipulation items-center gap-2 rounded-full bg-app-text px-5 ${liveQuietText(locale)} font-semibold text-app-bg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60`;
}

export interface LiveCallFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label'> {
  /** The dialog's accessible name. */
  ariaLabel: string;
  /** Room kept free at the bottom for the control row (and the action strip above it), in CSS px, plus the safe area. */
  padBottom?: number;
  children: ReactNode;
}

/**
 * The call's frame: a full-screen dark dialog. Content is centred between the top bar (64 px) and the control row;
 * the padding reserves both, so on a short landscape phone the status line is never laid out under the controls.
 * `data-theme="dark"` pins the dark tokens on this subtree (they are declared on [data-theme='dark'] in
 * app/globals.css), so the call stays dark in the light theme, as Gemini Live does. z-[130]: above the body-level job
 * tray (z-60), the lightbox (z-100) and the toasts (z-110/111) — the host renders it through a portal on <body>.
 */
export const LiveCallFrame = forwardRef<HTMLDivElement, LiveCallFrameProps>(function LiveCallFrame(
  { ariaLabel, padBottom = 124, className = '', style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      data-theme="dark"
      {...rest}
      className={`ag-no-drag fixed inset-0 z-[130] flex flex-col items-center justify-center overflow-hidden bg-app-bg text-app-text outline-none ${className}`}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)',
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${padBottom}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
});

/** Under the control row: a scrim so the words stay legible over the camera or the rocket behind the orb. */
export function LiveBottomScrim() {
  return <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-56 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />;
}

export interface LiveTopBarProps {
  /** „ცოცხალი ზარი“ / "Live call" / «Живой звонок». */
  label: string;
  /** The dot pulses while the call is live (never under reduced motion); it stays still on an error. */
  live?: boolean;
  /** The round buttons on the right (flip camera, "show the screen", captions). */
  children?: ReactNode;
}

/** The top bar: names the call quietly — the user knows where they are — and holds the view toggles. */
export function LiveTopBar({ label, live = true, children }: LiveTopBarProps) {
  return (
    <div
      className="absolute inset-x-0 z-20 flex h-16 items-center justify-between px-3"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <span data-testid="live-call-label" className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap pl-2 text-[16px] font-medium text-app-text">
        <span aria-hidden className="relative flex h-2 w-2">
          {live && <span className="absolute inline-flex h-full w-full rounded-full bg-app-accent opacity-60 motion-safe:animate-ping" />}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-app-accent" />
        </span>
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">{children}</span>
    </div>
  );
}

export interface LiveTopToggleProps {
  label: string;
  pressed: boolean;
  onClick: () => void;
  icon: ReactNode;
}

/** A 44 px round toggle for the top bar (aria-pressed; inverts while on). */
export function LiveTopToggle({ label, pressed, onClick, icon }: LiveTopToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${pressed ? LIVE_TOGGLE_ON : 'bg-white/[0.08] text-app-text hover:bg-white/[0.14]'}`}
    >
      {icon}
    </button>
  );
}

export interface LiveStatusLineProps {
  /** The orb's state; the waveform follows it (still while muted). */
  state: LiveOrbState;
  muted?: boolean;
  getLevels?: () => LiveLevels;
  /** The localized status („უკავშირდება…“, "Listening"…), announced politely. */
  label: string;
  locale: Locale;
  className?: string;
}

/** Quiet on purpose: the orb carries the state; the line names it, and the waveform says who is talking. */
export function LiveStatusLine({ state, muted = false, getLevels, label, locale, className = '' }: LiveStatusLineProps) {
  return (
    <div className={`relative z-10 flex items-center gap-2.5 ${className}`}>
      <span data-testid="live-waveform" className="flex items-center">
        <LiveWaveform compact state={muted ? 'idle' : state} getLevels={getLevels} />
      </span>
      <span data-testid="live-status" aria-live="polite" className={`${liveQuietText(locale)} font-medium leading-[1.6] text-app-muted`}>
        {label}
      </span>
    </div>
  );
}

export interface LiveErrorPanelProps {
  icon: ReactNode;
  headline: string;
  /** The specific reason, read out as an alert. */
  reason?: string;
  /** What to do, where the reason alone does not say it. */
  hint?: string;
  /** The browser's own name for the failure: meaningless to most users, decisive in a support screenshot. */
  detailName?: string;
  locale: Locale;
  /** Retry and the other ways out. */
  children?: ReactNode;
}

/** The error screen's body: replaces the orb, the status and the captions. */
export function LiveErrorPanel({ icon, headline, reason, hint, detailName, locale, children }: LiveErrorPanelProps) {
  return (
    <div className="relative z-10 flex w-full max-w-sm flex-col items-center px-6 text-center">
      <span aria-hidden className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.08] text-app-text">
        {icon}
      </span>
      <h2 className="text-[20px] font-semibold leading-[1.4] text-app-text">{headline}</h2>
      {reason && <p role="alert" className="mt-2 text-[16px] leading-[1.6] text-app-text/90">{reason}</p>}
      {hint && <p className={`mt-2 ${liveQuietText(locale)} leading-[1.6] text-app-muted`}>{hint}</p>}
      {detailName && (
        <p data-testid="live-error-name" className="mt-3 font-mono text-[12px] leading-5 text-app-muted/80">{detailName}</p>
      )}
      {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

export interface LiveControlProps {
  /** The word under the circle. */
  label: string;
  /** The accessible name; it must CONTAIN `label` (WCAG 2.5.3). Defaults to `label`. */
  ariaLabel?: string;
  icon: ReactNode;
  onClick: () => void;
  /** A toggle: exposes aria-pressed, and the circle inverts while on. */
  pressed?: boolean;
  /** `danger` is End: a solid red circle. */
  tone?: 'glass' | 'danger';
  locale?: Locale;
  title?: string;
  testId?: string;
}

/**
 * One control of the call's bottom row: a 56 px round glass button with its word under it (from 360 px). The whole
 * column is the button, so the word is part of the target. Exported for the host's extras (the voice switch).
 * ⚠️ The words are 12 px, under the 16 px Georgian floor on purpose: they are captions of the icons (the accessible
 * name carries the full phrase), like a phone's tab bar — five Georgian words at 13 px overflow a 360 px phone.
 */
export function LiveControl({ label, ariaLabel, icon, onClick, pressed, tone = 'glass', locale = 'ka', title, testId }: LiveControlProps) {
  const circle = tone === 'danger'
    ? 'bg-app-danger text-white ring-1 ring-white/10 group-hover:bg-app-danger/90'
    : pressed
      ? `${LIVE_TOGGLE_ON} ring-1 ring-transparent`
      : 'bg-white/[0.09] text-app-text ring-1 ring-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] group-hover:bg-white/[0.15]';
  const word = tone === 'danger' ? 'text-red-300' : pressed ? 'text-app-text' : 'text-app-text/80';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      title={title}
      data-testid={testId}
      data-control
      className="group flex min-h-[56px] min-w-[56px] shrink-0 touch-manipulation flex-col items-center gap-1.5 rounded-[22px] focus-visible:outline-none"
    >
      <span
        data-circle
        className={`flex h-[56px] w-[56px] items-center justify-center rounded-full backdrop-blur-xl transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-app-accent/70 ${circle}`}
      >
        {icon}
      </span>
      {/* 12 px in every language (see above): five Georgian words this size fit 360 px with the agent speaking. */}
      <span lang={locale} className={`hidden whitespace-nowrap text-[12px] font-medium leading-4 min-[360px]:block ${word}`}>
        {label}
      </span>
    </button>
  );
}

/** The bottom row of LiveControls. Pixel sizes, not rem (the app's root is 17 px): five 56 px circles + four 4 px gaps
 *  fill a 320 px phone; the gaps open up as the words appear and the screen widens. */
export function LiveControlRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 min-[400px]:px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
    >
      <div data-testid="live-controls" className="flex max-w-full items-start justify-center gap-[4px] min-[360px]:gap-[6px] min-[390px]:gap-[10px] sm:gap-4">
        {children}
      </div>
    </div>
  );
}

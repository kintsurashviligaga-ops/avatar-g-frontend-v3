'use client';

/**
 * LiveCallChrome — the pieces of the full-screen call that every voice engine shares, so a user sees ONE call screen
 * whichever engine answers: the Gemini Live call (LiveModeOverlay) and the ElevenLabs fallback (VoiceConversation,
 * used when Gemini Live is unavailable for that user).
 *
 * ⚠️ THE FALLBACK USED TO LOOK LIKE ANOTHER PRODUCT, and then like the 2026-10-03 rocket call. Since the owner's P0
 * correction task (2026-10-24) both screens draw the owner's approved Gemini Live design from these pieces, so they can
 * only drift apart on purpose:
 *
 *   LiveAmbientGlow      the one soft blue glow rising from the bottom of the black screen
 *   LiveVoicePill        the glowing blue pill with the white waveform (who is talking)
 *   liveRoundButtonClass the 48 px round glass buttons of the bottom row (camera, mic, end)
 *   LiveErrorPanel       icon · headline · the reason · a hint · the browser's error name · actions
 *   LiveControl          a round glass button with its word (the host's extras: the voice switch)
 */
import type { ReactNode } from 'react';

import { LiveWaveform, type LiveOrbState } from './LiveOrb';
import type { LiveLevels } from './useGeminiLiveSession';

type Locale = 'ka' | 'en' | 'ru';

/** The product's toggle grammar: a control inverts while on. */
const LIVE_TOGGLE_ON = 'bg-app-text text-app-bg';

/** Georgian's tall script keeps the 16 px floor; Latin and Cyrillic secondary copy stays a step quieter. */
export function liveQuietText(locale: Locale): string {
  return locale === 'ka' ? 'text-[16px]' : 'text-[15px]';
}

/** The one solid button on the call screen (Retry, "tap to turn on sound", "tap to start"): text-colour fill, ink text. */
export function livePrimaryButtonClass(locale: Locale): string {
  return `inline-flex h-11 touch-manipulation items-center gap-2 rounded-full bg-app-text px-5 ${liveQuietText(locale)} font-semibold text-app-bg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60`;
}

/**
 * THE APPROVED CALL SCREEN (the owner's Gemini Live design of 2026-10-20, commit 088cfaba, and the owner's screenshot of
 * it): true black, ONE soft blue glow rising from the bottom, the agent's words large at the top left, and one row at the
 * bottom with the glowing blue voice pill in the middle. No rocket, no orb, no picture behind the call (the owner,
 * 2026-10-24: the rocket backdrop is retired from every Live state). These three pieces draw it for every engine.
 */

/** The bottom glow (the "ambient nebula"): one hue, static, behind everything. */
export function LiveAmbientGlow() {
  return (
    <div
      aria-hidden
      data-testid="live-ambient"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[65vh] opacity-90 transition-opacity duration-700"
      style={{
        background:
          'radial-gradient(ellipse 95% 60% at 50% 100%, rgba(26, 115, 232, 0.42) 0%, rgba(13, 37, 89, 0.22) 45%, rgba(0, 0, 0, 0) 80%)',
      }}
    />
  );
}

/** The voice pill's look: the approved blue gradient with its one glow. */
const LIVE_PILL_CLASS = 'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-300/40 shadow-[0_0_42px_rgba(37,99,235,0.65),inset_0_1px_2px_rgba(255,255,255,0.35)]';
const LIVE_PILL_STYLE = { background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #38bdf8 100%)' } as const;
/** The full-size pill's box (the call's bottom row). */
const LIVE_PILL_SIZE = 'h-14 w-24 min-[360px]:w-28 min-[390px]:w-36 sm:w-40';

export interface LiveVoicePillProps {
  state: LiveOrbState;
  getLevels?: () => LiveLevels;
  /** The pill's box; the full row size by default, the dock passes a small one. */
  sizeClass?: string;
  compact?: boolean;
  className?: string;
}

/** The glowing blue pill with the white waveform: the call's one picture of who is talking. Decorative. */
export function LiveVoicePill({ state, getLevels, sizeClass = LIVE_PILL_SIZE, compact = false, className = '' }: LiveVoicePillProps) {
  return (
    <span data-testid="live-voice-pill" aria-hidden="true" className={`${LIVE_PILL_CLASS} ${sizeClass} ${className}`} style={LIVE_PILL_STYLE}>
      <LiveWaveform compact={compact} state={state} getLevels={getLevels} className="[&_span]:bg-white" />
    </span>
  );
}

/** A 48 px round glass button of the approved bottom row (camera, mic, end). */
export function liveRoundButtonClass(tone: 'glass' | 'on' | 'muted' | 'end' = 'glass'): string {
  const base = 'flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full border border-white/10 shadow-md backdrop-blur-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70';
  switch (tone) {
    case 'on': return `${base} bg-white text-black`;
    case 'muted': return `${base} border-rose-500/30 bg-rose-500/20 text-rose-300`;
    case 'end': return `${base} bg-white/10 text-white hover:border-rose-500/40 hover:bg-rose-500/25 hover:text-rose-300`;
    default: return `${base} bg-white/10 text-white hover:bg-white/15`;
  }
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

'use client';

/**
 * LiveDock — the call minimized to a floating capsule at the top of the screen, so the user SEES the app while they
 * talk to it.
 *
 * ⚠️ WHY IT EXISTS. The Live call was only ever a full-screen modal dialog: everything the agent did on screen — a studio
 * switched, a prompt filled, a chat answer written, a panel opened — happened behind it, and the user saw it only after
 * hanging up. Voice could "control the screen" without the user ever seeing the screen. Docked, the call keeps talking,
 * listening and acting, and the app is right there under it.
 *
 * ⚠️ IT MUST READ AS "A CALL WITH THE AGENT, AND IT IS WORKING" (the owner's iPhone screenshot, 2026-10-03). The old dock
 * was a full-width black bar with the user's avatar photo, a status, a mic, an expand icon and a big RED FILLED CIRCLE
 * WITH AN ✕ — alarming, cheap, and easy to mistake for "close this panel". Now: a glass capsule with a soft blue ring,
 * the rocket orb (the agent), „ცოცხალი ზარი · Agent G" with a live dot, the status beside a compact waveform, and one
 * line that says what is happening — the step the agent is on (a spinner, then a check), else the last caption. End is
 * a calm dark-red pill with a phone-down icon and its word („დასრულება", from 360 px), never a red ✕.
 *
 * Layout: two rows on a phone (identity + mute/expand · the line + stop/End), one row from `sm` up (the same elements
 * re-ordered with `order-*`, so every control exists once). A link the agent put on screen (open_url) and a confirmed
 * generation's countdown sit under the capsule, INSIDE the dock.
 *
 * Not a dialog: no focus trap, Escape does not hang up, the page stays fully usable. The dock reserves its own height:
 * it sets `<html data-live-docked>` and writes its MEASURED height (safe area, capsule, link, countdown — all of it) to
 * `--live-dock-h`, which app/globals.css moves the studio shell down by — so nothing is covered and no band is left
 * between the dock and the app's header. Always dark (data-theme), like the full call. Controls are 44 px (in px — the
 * app's root font is 17 px, so rem sizes run large) with ka/en/ru names. Georgian is 16 px on the line; under that floor
 * on purpose are captions, not text to read: the two small lines beside the orb (a 13 px label and a one-word status at
 * 15 px beside its waveform — 16 px would not fit two lines in a 44 px row) and End's word (14 px, the icon's caption;
 * its accessible name is the full phrase), which keeps the line beside it readable on a 360 px phone.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Globe, Maximize2, Mic, MicOff, PhoneOff, Square, Volume2, X } from 'lucide-react';

import { LIVE_START_COUNTDOWN_MS, liveUrlHost } from '@/lib/voice/liveTools';

import { LiveStepMark, type LiveStep } from './LiveActivityFeed';
import LiveOrb, { LiveWaveform, orbStateFor } from './LiveOrb';
import { openLiveUrl, type LivePendingRun } from './liveActions';
import type { LiveCaption, LiveLevels, LiveStatus } from './useGeminiLiveSession';

type Locale = 'ka' | 'en' | 'ru';

interface DockStrings {
  region: string;
  /** The capsule's name: what this is, in a word or two, and who is on the other end. */
  callLabel: string;
  expand: string;
  stopSpeaking: string;
  mute: string;
  end: string;
  /** The End pill's visible word (contained in `end`, WCAG 2.5.3). */
  endShort: string;
  /** The line before anything was said or done. */
  hint: string;
  runIn: (secs: number) => string;
  credits: (n: number) => string;
  cancel: string;
  started: string;
  cancelled: string;
  failed: string;
  /** The link chip (open_url). */
  link: string;
  open: string;
  /** Accessible name of the link's Open — contains `open`. */
  openLinkLabel: (host: string) => string;
  dismissLink: string;
}

export const LIVE_DOCK_STRINGS: Record<Locale, DockStrings> = {
  ka: {
    region: 'ცოცხალი საუბარი',
    callLabel: 'ცოცხალი ზარი',
    expand: 'ზარის სრულ ეკრანზე გაშლა',
    stopSpeaking: 'ლაპარაკის შეწყვეტა',
    mute: 'მიკროფონის დადუმება',
    end: 'ზარის დასრულება',
    endShort: 'დასრულება',
    hint: 'მითხარი, რა გავაკეთო ეკრანზე',
    runIn: (s) => `გენერაცია დაიწყება ${s} წამში`,
    credits: (n) => `${n} კრედიტი`,
    cancel: 'გაუქმება',
    started: 'გენერაცია დაიწყო',
    cancelled: 'გაუქმდა — არაფერი დაიხარჯა',
    failed: 'ვერ დაიწყო — დეტალები ეკრანზეა',
    link: 'ბმული',
    open: 'გახსნა',
    openLinkLabel: (host) => `გახსნა ახალ ჩანართში: ${host}`,
    dismissLink: 'ბმულის დამალვა',
  },
  en: {
    region: 'Live conversation',
    callLabel: 'Live call',
    expand: 'Expand the call to full screen',
    stopSpeaking: 'Stop speaking',
    mute: 'Mute microphone',
    end: 'End call',
    endShort: 'End',
    hint: 'Tell me what to do on the screen',
    runIn: (s) => `Starts in ${s} s`,
    credits: (n) => `${n} credit${n === 1 ? '' : 's'}`,
    cancel: 'Cancel',
    started: 'Generation started',
    cancelled: 'Cancelled — nothing was spent',
    failed: 'Could not start — see the screen',
    link: 'Link',
    open: 'Open',
    openLinkLabel: (host) => `Open ${host} in a new tab`,
    dismissLink: 'Hide the link',
  },
  ru: {
    region: 'Живой разговор',
    callLabel: 'Живой звонок',
    expand: 'Развернуть звонок на весь экран',
    stopSpeaking: 'Остановить речь',
    mute: 'Выключить микрофон',
    end: 'Завершить звонок',
    endShort: 'Завершить',
    hint: 'Скажите, что сделать на экране',
    runIn: (s) => `Запуск через ${s} с`,
    credits: (n) => `${n} кредит.`,
    cancel: 'Отмена',
    started: 'Генерация запущена',
    cancelled: 'Отменено — ничего не списано',
    failed: 'Не запустилось — подробности на экране',
    link: 'Ссылка',
    open: 'Открыть',
    openLinkLabel: (host) => `Открыть ${host} в новой вкладке`,
    dismissLink: 'Скрыть ссылку',
  },
};

/** The agent's name on the call (the product's assistant). */
const AGENT_NAME = 'Agent G';

const BTN =
  'flex h-[44px] w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors duration-200 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60';
const GLASS = 'bg-white/[0.07] text-app-text hover:bg-white/[0.14]';

/** The countdown banner for a confirmed start_generation — shared by the dock and the full call screen. */
export function LiveRunBanner({ run, locale = 'ka', onCancel, className = '' }: {
  run: LivePendingRun; locale?: Locale; onCancel: () => void; className?: string;
}) {
  const t = LIVE_DOCK_STRINGS[locale] ?? LIVE_DOCK_STRINGS.ka;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (run.state !== 'counting') return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [run.state]);
  const left = Math.max(0, run.runsAt - now);
  const secs = Math.ceil(left / 1000);
  const text = run.state === 'counting' ? t.runIn(secs)
    : run.state === 'started' ? t.started : run.state === 'cancelled' ? t.cancelled : t.failed;
  const quiet = locale === 'ka' ? 'text-[16px] leading-[1.5]' : 'text-[15px] leading-6';
  // What is left of the countdown, as a bar that drains to the moment it runs (stepped every 200 ms; the width eases
  // between steps, and simply steps under reduced motion).
  const remaining = run.state === 'counting' ? Math.min(1, left / LIVE_START_COUNTDOWN_MS) : 0;
  return (
    <div
      data-testid="live-run-banner"
      data-state={run.state}
      role="status"
      aria-live="assertive"
      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl bg-app-surface/95 py-2 pl-4 pr-2 text-app-text shadow-lg ring-1 ring-white/10 backdrop-blur-md ${className}`}
    >
      {run.state !== 'counting' && <LiveStepMark state={run.state === 'started' ? 'done' : run.state === 'cancelled' ? 'cancelled' : 'failed'} />}
      <span className={`min-w-0 flex-1 truncate font-semibold ${quiet}`}>
        {text}
        {run.state === 'counting' && typeof run.priceCredits === 'number' && run.priceCredits > 0 && (
          <span className="font-normal text-app-muted"> · {t.credits(run.priceCredits)}</span>
        )}
      </span>
      {run.state === 'counting' && (
        <button
          type="button"
          onClick={onCancel}
          data-testid="live-run-cancel"
          className={`inline-flex h-11 shrink-0 touch-manipulation items-center rounded-full bg-app-text px-5 font-semibold text-app-bg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${quiet}`}
        >
          {t.cancel}
        </button>
      )}
      {run.state === 'counting' && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <span
            data-testid="live-run-progress"
            className="block h-full rounded-r-full bg-app-accent transition-[width] duration-200 ease-linear motion-reduce:transition-none"
            style={{ width: `${(remaining * 100).toFixed(1)}%` }}
          />
        </span>
      )}
    </div>
  );
}

/** A link the agent put on screen (open_url), as the dock shows it. */
export interface LiveDockLink {
  id: string;
  url: string;
  title?: string;
}

export interface LiveDockProps {
  locale?: Locale;
  status: LiveStatus;
  statusLabel: string;
  captions: readonly LiveCaption[];
  /** The agent's step now (liveCurrentStep): a spinner while it runs, a check once it is done. */
  step?: LiveStep | null;
  muted: boolean;
  getLevels?: () => LiveLevels;
  onToggleMute: () => void;
  onEnd: () => void;
  onExpand: () => void;
  /** Cut the answer off (the session's local barge-in). Shown only while the agent speaks. */
  onStopSpeaking?: () => void;
  pendingRun?: LivePendingRun | null;
  onCancelRun?: () => void;
  /** The newest link the agent put on screen: a chip with Open (the user's tap opens the tab). */
  link?: LiveDockLink | null;
  /** Hide the chip (also called once the link was opened). */
  onDismissLink?: (id: string) => void;
}

/** How long a finished step stays on the line before the captions take it back. */
const STEP_FRESH_MS = 5000;

/** True for `ms` after `key` changes to a non-empty value (a finished step stays on the line for a moment). */
function useFresh(key: string, ms: number): boolean {
  const [fresh, setFresh] = useState(key);
  useEffect(() => {
    if (!key) return undefined;
    setFresh(key);
    const id = setTimeout(() => setFresh(''), ms);
    return () => clearTimeout(id);
  }, [key, ms]);
  return !!key && fresh === key;
}

// Measure before paint (the shell must never be laid out under the dock for a frame); a plain effect on the server.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Line =
  | { kind: 'step'; step: LiveStep }
  | { kind: 'caption'; role: LiveCaption['role']; text: string }
  | { kind: 'hint' };

export default function LiveDock({
  locale = 'ka', status, statusLabel, captions, step = null, muted, getLevels, onToggleMute, onEnd, onExpand,
  onStopSpeaking, pendingRun, onCancelRun, link = null, onDismissLink,
}: LiveDockProps) {
  const t = LIVE_DOCK_STRINGS[locale] ?? LIVE_DOCK_STRINGS.ka;
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Reserve the dock's height for as long as it is up: the studio shell moves down by exactly this much instead of being
  // covered — measured, so the safe area, the two rows, a link chip or a countdown are all counted, and nothing else
  // has to guess (the CSS fallback in globals.css is only for the first frame of an engine with no ResizeObserver).
  useIsoLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.liveDocked = '1';
    const node = rootRef.current;
    const write = () => {
      const h = node ? Math.ceil(node.getBoundingClientRect().height) : 0;
      if (h > 0) html.style.setProperty('--live-dock-h', `${h}px`);
    };
    write();
    const ro = node && typeof ResizeObserver === 'function' ? new ResizeObserver(write) : null;
    if (ro && node) ro.observe(node);
    return () => {
      ro?.disconnect();
      delete html.dataset.liveDocked;
      html.style.removeProperty('--live-dock-h');
    };
  }, []);

  const orbState = orbStateFor(status);
  const speaking = status === 'speaking';
  const live = status === 'listening' || status === 'thinking' || status === 'speaking';
  const last = captions[captions.length - 1];
  const caption = last?.text?.trim() ? { role: last.role, text: last.text.trim() } : null;
  const stepFresh = useFresh(step ? `${step.id}:${step.state}` : '', STEP_FRESH_MS);

  // What the one line says: the step while it runs (the agent is working — and the model is waiting on it), the
  // agent's own words while it speaks, a step that just finished (its check) for a moment, then the last caption.
  let line: Line = { kind: 'hint' };
  if (step && step.state === 'running') line = { kind: 'step', step };
  else if (speaking && caption?.role === 'assistant') line = { kind: 'caption', ...caption };
  else if (step && stepFresh) line = { kind: 'step', step };
  else if (caption) line = { kind: 'caption', ...caption };

  const lineText = locale === 'ka' ? 'text-[16px] leading-6' : 'text-[15px] leading-6';
  const lineIcon = line.kind === 'step'
    ? <LiveStepMark state={line.step.state} size={18} />
    : line.kind === 'caption' && line.role === 'assistant'
      ? <Volume2 size={18} aria-hidden className="shrink-0 text-app-accent" />
      : <Mic size={18} aria-hidden className="shrink-0 text-app-muted" />;
  const lineCopy = line.kind === 'step' ? line.step.text : line.kind === 'caption' ? line.text : t.hint;

  const linkHost = link ? liveUrlHost(link.url) : '';

  return (
    <div
      ref={rootRef}
      data-theme="dark"
      data-testid="live-dock"
      data-live-status={status}
      role="region"
      aria-label={t.region}
      className="ag-no-drag fixed inset-x-0 top-0 z-[130] bg-app-bg px-2 pb-1.5 text-app-text"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
    >
      <div className="mx-auto w-full max-w-3xl">
        {/* The capsule: glass, one soft blue shadow and a hairline ring of the accent — the call's one lit surface. */}
        <div
          data-testid="live-dock-capsule"
          className="rounded-[26px] bg-[rgb(11_17_28/0.96)] p-1 shadow-[0_10px_28px_-14px_rgb(var(--app-accent-deep)/0.8)] ring-1 ring-app-accent/30 backdrop-blur-xl"
        >
          <div className="flex flex-wrap items-center gap-x-1">
            <LiveOrb state={orbState} getLevels={getLevels} size={36} label={statusLabel} className="order-1 ml-[4px]" />

            <div className="order-2 min-w-0 flex-1 pl-1.5 sm:max-w-[16rem] sm:flex-none">
              <p className={`flex min-w-0 items-center gap-1.5 font-semibold text-app-accent ${locale === 'ka' ? 'text-[13px] leading-4' : 'text-[12px] leading-4'}`}>
                <span aria-hidden className="relative flex h-2 w-2 shrink-0">
                  {live && <span className="absolute inline-flex h-full w-full rounded-full bg-app-accent opacity-60 motion-safe:animate-ping" />}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-app-accent' : 'bg-app-muted'}`} />
                </span>
                <span className="truncate">
                  {t.callLabel}
                  <span className="hidden min-[360px]:inline"> · {AGENT_NAME}</span>
                </span>
              </p>
              <p className="mt-0.5 flex min-w-0 items-center gap-2">
                <span aria-live="polite" className={`truncate font-medium text-app-text/90 ${locale === 'ka' ? 'text-[15px] leading-5' : 'text-[14px] leading-5'}`}>
                  {statusLabel}
                </span>
                <LiveWaveform compact state={muted ? 'idle' : orbState} getLevels={getLevels} className="shrink-0" />
              </p>
            </div>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={t.mute}
              aria-pressed={muted}
              className={`${BTN} order-3 sm:order-6 ${muted ? 'bg-app-text text-app-bg' : GLASS}`}
            >
              {muted ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
            </button>
            <button type="button" onClick={onExpand} aria-label={t.expand} data-testid="live-dock-expand" className={`${BTN} order-4 sm:order-7 ${GLASS}`}>
              <Maximize2 size={18} aria-hidden />
            </button>

            {/* A phone breaks the capsule into two rows here; from `sm` up it is one row. */}
            <span aria-hidden className="order-5 basis-full sm:hidden" />

            <p
              data-testid="live-dock-line"
              data-kind={line.kind}
              data-state={line.kind === 'step' ? line.step.state : undefined}
              className="order-6 flex h-[44px] min-w-0 flex-1 items-center gap-2 sm:order-3 sm:pl-1"
            >
              {/* Under the orb on a phone, so the line starts where the capsule's content does. */}
              <span className="flex w-[44px] shrink-0 justify-center sm:w-auto">{lineIcon}</span>
              <span className={`truncate ${lineText} ${line.kind === 'caption' && line.role === 'user' ? 'text-app-muted' : line.kind === 'hint' ? 'text-app-muted' : 'text-app-text'}`}>
                {lineCopy}
              </span>
            </p>

            {speaking && onStopSpeaking && (
              <button
                type="button"
                onClick={onStopSpeaking}
                aria-label={t.stopSpeaking}
                data-testid="live-stop-speaking"
                className={`${BTN} order-7 sm:order-4 ${GLASS}`}
              >
                <Square size={15} aria-hidden className="fill-current" />
              </button>
            )}

            {/* End: a calm dark-red pill with its word — never the old big red ✕. */}
            <button
              type="button"
              onClick={onEnd}
              aria-label={t.end}
              data-testid="live-dock-end"
              className={`order-8 inline-flex h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center gap-[5px] rounded-full bg-app-danger/[0.16] px-[13px] font-semibold text-red-300 ring-1 ring-inset ring-app-danger/40 transition-colors duration-200 hover:bg-app-danger/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 min-[360px]:pl-[12px] min-[360px]:pr-[14px] ${locale === 'ka' ? 'text-[14px]' : 'text-[13px]'}`}
            >
              <PhoneOff size={17} aria-hidden data-icon="phone-off" className="shrink-0" />
              <span className="hidden whitespace-nowrap min-[360px]:inline">{t.endShort}</span>
            </button>
          </div>
        </div>

        {link && (
          <div
            data-testid="live-dock-link"
            className="mt-1.5 flex items-center gap-2 rounded-[22px] bg-app-surface/95 py-1 pl-3 pr-1 ring-1 ring-white/10"
          >
            <Globe size={18} aria-hidden className="shrink-0 text-app-accent" />
            <div className="min-w-0 flex-1">
              <p className={`truncate font-semibold text-app-text ${locale === 'ka' ? 'text-[16px] leading-5' : 'text-[15px] leading-5'}`}>
                {link.title || linkHost}
              </p>
              {/* The host under a title: a caption (13 px) — it says where the link goes, it is not text to read. */}
              {link.title && <p className="truncate text-[13px] leading-4 text-app-muted">{linkHost}</p>}
            </div>
            <button
              type="button"
              onClick={() => { if (openLiveUrl(link.url)) onDismissLink?.(link.id); }}
              aria-label={t.openLinkLabel(linkHost)}
              data-testid="live-dock-link-open"
              className={`inline-flex h-[44px] shrink-0 touch-manipulation items-center gap-1.5 rounded-full bg-app-accent px-[14px] font-semibold text-app-bg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 min-[360px]:px-[18px] ${locale === 'ka' ? 'text-[16px]' : 'text-[15px]'}`}
            >
              {t.open}
              <ArrowUpRight size={16} aria-hidden />
            </button>
            {onDismissLink && (
              <button type="button" onClick={() => onDismissLink(link.id)} aria-label={t.dismissLink} className={`${BTN} text-app-muted hover:bg-white/10 hover:text-app-text`}>
                <X size={16} aria-hidden />
              </button>
            )}
          </div>
        )}

        {pendingRun && onCancelRun && (
          <LiveRunBanner run={pendingRun} locale={locale} onCancel={onCancelRun} className="mt-1.5" />
        )}
      </div>
    </div>
  );
}

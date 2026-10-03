'use client';

/**
 * LiveDock — the call as a slim bar at the top of the screen, so the user SEES the app while they talk to it.
 *
 * ⚠️ WHY IT EXISTS. The Live call was only ever a full-screen modal dialog: everything the agent did on screen — a studio
 * switched, a prompt filled, a chat answer written, a panel opened — happened behind it, and the user saw it only after
 * hanging up. Voice could "control the screen" without the user ever seeing the screen. Docked, the call keeps talking,
 * listening and acting, and the app is right there under it.
 *
 * Not a dialog: no focus trap, Escape does not hang up, the page stays fully usable. The bar reserves its own height —
 * `<html data-live-docked>` moves the studio shell down by `--live-dock-h` (app/globals.css) — so nothing is covered.
 * Always dark (data-theme), like the full call. Controls are ≥ 44 px with ka/en/ru names; Georgian never below 16 px
 * except the one-line caption (14–15 px, it is a running transcript, not body copy).
 */
import { useEffect, useState } from 'react';
import { Maximize2, Mic, MicOff, Square, X } from 'lucide-react';

import LiveOrb, { orbStateFor } from './LiveOrb';
import type { LivePendingRun } from './liveActions';
import type { LiveCaption, LiveLevels, LiveStatus } from './useGeminiLiveSession';

type Locale = 'ka' | 'en' | 'ru';

interface DockStrings {
  region: string;
  expand: string;
  stopSpeaking: string;
  mute: string;
  end: string;
  runIn: (secs: number) => string;
  credits: (n: number) => string;
  cancel: string;
  started: string;
  cancelled: string;
  failed: string;
}

export const LIVE_DOCK_STRINGS: Record<Locale, DockStrings> = {
  ka: {
    region: 'ცოცხალი საუბარი',
    expand: 'ზარის სრულ ეკრანზე გაშლა',
    stopSpeaking: 'ლაპარაკის შეწყვეტა',
    mute: 'მიკროფონის დადუმება',
    end: 'ზარის დასრულება',
    runIn: (s) => `გენერაცია დაიწყება ${s} წამში`,
    credits: (n) => `${n} კრედიტი`,
    cancel: 'გაუქმება',
    started: 'გენერაცია დაიწყო',
    cancelled: 'გაუქმდა — არაფერი დაიხარჯა',
    failed: 'ვერ დაიწყო — დეტალები ეკრანზეა',
  },
  en: {
    region: 'Live conversation',
    expand: 'Expand the call to full screen',
    stopSpeaking: 'Stop speaking',
    mute: 'Mute microphone',
    end: 'End call',
    runIn: (s) => `Starts in ${s} s`,
    credits: (n) => `${n} credit${n === 1 ? '' : 's'}`,
    cancel: 'Cancel',
    started: 'Generation started',
    cancelled: 'Cancelled — nothing was spent',
    failed: 'Could not start — see the screen',
  },
  ru: {
    region: 'Живой разговор',
    expand: 'Развернуть звонок на весь экран',
    stopSpeaking: 'Остановить речь',
    mute: 'Выключить микрофон',
    end: 'Завершить звонок',
    runIn: (s) => `Запуск через ${s} с`,
    credits: (n) => `${n} кредит.`,
    cancel: 'Отмена',
    started: 'Генерация запущена',
    cancelled: 'Отменено — ничего не списано',
    failed: 'Не запустилось — подробности на экране',
  },
};

const BTN =
  'flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors duration-200 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60';

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
  const secs = Math.max(0, Math.ceil((run.runsAt - now) / 1000));
  const text = run.state === 'counting' ? t.runIn(secs)
    : run.state === 'started' ? t.started : run.state === 'cancelled' ? t.cancelled : t.failed;
  const quiet = locale === 'ka' ? 'text-[16px] leading-[1.5]' : 'text-[15px] leading-6';
  return (
    <div
      data-testid="live-run-banner"
      data-state={run.state}
      role="status"
      aria-live="assertive"
      className={`flex items-center gap-3 rounded-2xl bg-app-surface/95 py-2 pl-4 pr-2 text-app-text shadow-lg ring-1 ring-white/10 backdrop-blur-md ${className}`}
    >
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
    </div>
  );
}

export interface LiveDockProps {
  locale?: Locale;
  status: LiveStatus;
  statusLabel: string;
  captions: readonly LiveCaption[];
  /** The step the agent is on right now (a search, a tool), if any — shown when nobody is speaking. */
  activityLine?: string | null;
  muted: boolean;
  getLevels?: () => LiveLevels;
  avatarUrl?: string | null;
  onToggleMute: () => void;
  onEnd: () => void;
  onExpand: () => void;
  /** Cut the answer off (the session's local barge-in). Shown only while the agent speaks. */
  onStopSpeaking?: () => void;
  pendingRun?: LivePendingRun | null;
  onCancelRun?: () => void;
}

export default function LiveDock({
  locale = 'ka', status, statusLabel, captions, activityLine, muted, getLevels, avatarUrl, onToggleMute, onEnd, onExpand,
  onStopSpeaking, pendingRun, onCancelRun,
}: LiveDockProps) {
  const t = LIVE_DOCK_STRINGS[locale] ?? LIVE_DOCK_STRINGS.ka;
  // Reserve the bar's height for as long as the dock is up: the studio shell moves down instead of being covered.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.liveDocked = '1';
    return () => { delete el.dataset.liveDocked; };
  }, []);

  const last = captions[captions.length - 1];
  const line = last?.text?.trim() ? last.text.trim() : activityLine || '';
  const speaking = status === 'speaking';

  return (
    <div
      data-theme="dark"
      data-testid="live-dock"
      data-live-status={status}
      role="region"
      aria-label={t.region}
      className="ag-no-drag fixed inset-x-0 top-0 z-[130] bg-app-bg/95 text-app-text shadow-[0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2 sm:px-3">
        <LiveOrb state={orbStateFor(status)} getLevels={getLevels} size={36} imageUrl={avatarUrl} label={statusLabel} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p aria-live="polite" className="truncate text-[12px] font-medium leading-4 text-app-muted">{statusLabel}</p>
          <p data-testid="live-dock-line" className={`truncate leading-5 ${last?.role === 'user' ? 'text-app-muted' : 'text-app-text'} ${locale === 'ka' ? 'text-[15px]' : 'text-[14px]'}`}>
            {line || ' '}
          </p>
        </div>
        {speaking && onStopSpeaking && (
          <button type="button" onClick={onStopSpeaking} aria-label={t.stopSpeaking} data-testid="live-stop-speaking" className={`${BTN} text-app-text hover:bg-white/10`}>
            <Square size={16} aria-hidden className="fill-current" />
          </button>
        )}
        <button type="button" onClick={onToggleMute} aria-label={t.mute} aria-pressed={muted} className={`${BTN} ${muted ? 'bg-app-text text-app-bg' : 'text-app-text hover:bg-white/10'}`}>
          {muted ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
        </button>
        <button type="button" onClick={onExpand} aria-label={t.expand} data-testid="live-dock-expand" className={`${BTN} text-app-text hover:bg-white/10`}>
          <Maximize2 size={18} aria-hidden />
        </button>
        <button type="button" onClick={onEnd} aria-label={t.end} data-testid="live-dock-end" className={`${BTN} bg-app-danger text-white hover:bg-app-danger/90 focus-visible:ring-white/70`}>
          <X size={18} aria-hidden />
        </button>
      </div>
      {pendingRun && onCancelRun && (
        <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center px-3 pt-2">
          <LiveRunBanner run={pendingRun} locale={locale} onCancel={onCancelRun} className="pointer-events-auto w-full max-w-md" />
        </div>
      )}
    </div>
  );
}

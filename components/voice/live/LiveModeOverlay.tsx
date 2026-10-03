'use client';

/**
 * LiveModeOverlay — the full-screen Live call in the Gemini Live frame: a dark screen with "Live" and a captions
 * toggle on top, the orb and one quiet status line in the middle, captions under it, and a floating pill of controls
 * at the bottom (camera · flip · waveform · mute · host extras · End). Pure presentation: every action is a prop, all
 * state comes from useGeminiLiveSession / useLiveCamera in the host (components/voice/GeminiLiveConversation.tsx),
 * except the captions toggle and the copy-link feedback, which are view state.
 *
 * ⚠️ RENDERED THROUGH A PORTAL ON <body>, ALWAYS DARK. It used to render inside ChatChrome's shell at z-[60] — the
 * body-level JobTray (z-60), the toasts (z-110/111) and the lightbox (z-100) all painted over the call. It now sits
 * at z-[130] directly on <body>, and `data-theme="dark"` pins the dark tokens on this subtree (they are declared on
 * [data-theme='dark'] in app/globals.css), so Live stays dark in the light theme, as Gemini Live does.
 *
 * ⚠️ A MIC FAILURE WAS HEADLINED „კავშირი შეწყდა“ ("connection dropped") — which is how a device problem got reported
 * as a network one. Mic codes now get a microphone screen (MicOff, "Microphone unavailable", the specific reason, a
 * hint, the browser's error name in small mono type for support screenshots, Retry, and for in-app browsers a way
 * out to a real browser). „კავშირი შეწყდა“ is kept only for connection_lost / setup_failed.
 *
 * Controls are ≥ 44 px touch targets with ka/en/ru accessible names; toggles expose aria-pressed and invert when on
 * (bg-app-text / text-app-bg — the product's toggle grammar). The dialog takes focus on open, traps Tab and ends the
 * call on Escape (hooks/useDialogA11y). Georgian copy never goes below 16 px / 1.6.
 *
 * VOICE-TO-ACTION: with `onOpenAction`, a strip of LiveActionCards sits above the pill — what the agent just did
 * (prepared a prompt, opened a studio, put code on screen), newest first, at most three. While it holds cards the
 * centred content is lifted (and the orb shrinks a step) so the strip never covers the captions.
 *
 * LIVE ACTIVITY (LiveActivityFeed): what the agent is doing WHILE it does it — a web search with its queries and then
 * the pages it used, each tool step running → done, and generations still rendering — under the status line. A search
 * or a tool call used to be seconds of silence with nothing on screen.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, Check, Copy, ExternalLink, Mic, MicOff, Minimize2, RotateCcw, Square, Subtitles, SwitchCamera, Video, VideoOff,
  Volume2, WifiOff, X,
} from 'lucide-react';

import { useDialogA11y } from '@/hooks/useDialogA11y';

import LiveActionCards from './LiveActionCards';
import LiveActivityFeed, { liveActivityLine, type LiveJobLine } from './LiveActivityFeed';
import LiveDock, { LIVE_DOCK_STRINGS, LiveRunBanner } from './LiveDock';
import type { LiveActivityItem } from './liveActivity';
import LiveCaptions from './LiveCaptions';
import LiveOrb, { LiveWaveform, orbStateFor } from './LiveOrb';
import type { LiveActionCard, LivePendingRun } from './liveActions';
import {
  isMicErrorCode,
  type LiveCaption,
  type LiveErrorCode,
  type LiveErrorDetail,
  type LiveLevels,
  type LiveStatus,
} from './useGeminiLiveSession';

type Locale = 'ka' | 'en' | 'ru';

interface Strings {
  title: string;
  /** The top-bar label (Gemini's "Live"). */
  live: string;
  status: Record<LiveStatus, string>;
  errors: Record<LiveErrorCode, string>;
  /** Extra "what to do" lines where the reason alone does not say it. */
  hints: Partial<Record<LiveErrorCode, string>>;
  micHeadline: string;
  /** Headline for failures that are neither the mic nor the connection (sign-in, limits, unsupported…). */
  startFailed: string;
  mute: string;
  camera: string;
  flip: string;
  frontCamera: string;
  backCamera: string;
  /** Accessible name of End (contains the visible `endShort`, WCAG 2.5.3). */
  end: string;
  endShort: string;
  retry: string;
  captions: string;
  copyLink: string;
  copied: string;
  openInBrowser: string;
  tapToStart: string;
  /** Docks the call into a slim bar so the app is visible (the call goes on). */
  showScreen: string;
}

export const LIVE_OVERLAY_STRINGS: Record<Locale, Strings> = {
  ka: {
    title: 'ცოცხალი საუბარი',
    live: 'Live',
    status: {
      idle: 'მზად არის',
      connecting: 'დაკავშირება…',
      listening: 'გისმენ',
      thinking: 'ვფიქრობ…',
      speaking: 'ვსაუბრობ…',
      reconnecting: 'კავშირის აღდგენა…',
      error: 'კავშირი შეწყდა',
      closed: 'ზარი დასრულდა',
    },
    errors: {
      mic_denied: 'მიკროფონზე წვდომა არ არის დაშვებული.',
      mic_system_denied: 'მიკროფონი სისტემის პარამეტრებშია დაბლოკილი — ჩართე ამ ბრაუზერისთვის (Settings → Privacy → Microphone).',
      mic_not_found: 'მიკროფონი ვერ მოიძებნა — შეაერთე მიკროფონი ან ყურსასმენი და სცადე თავიდან.',
      mic_busy: 'მიკროფონს სხვა პროგრამა იყენებს — დახურე ზარი ან ჩამწერი (Zoom, Teams, Discord) და სცადე თავიდან.',
      mic_in_app: 'ამ აპის ბრაუზერში მიკროფონი არ მუშაობს — გახსენი myavatar.ge Safari-ში ან Chrome-ში.',
      mic_insecure: 'მიკროფონი მხოლოდ დაცულ (https) კავშირზე მუშაობს.',
      mic_lost: 'მიკროფონი გაითიშა საუბრის დროს.',
      mic_unavailable: 'მიკროფონი ვერ ჩაირთო.',
      auth: 'ცოცხალი საუბრისთვის შედი ანგარიშზე.',
      rate_limited: 'ძალიან ბევრი მცდელობა — სცადე ცოტა ხანში.',
      unavailable: 'ცოცხალი ხმა ახლა მიუწვდომელია.',
      mint_failed: 'საუბრის დაწყება ვერ მოხერხდა.',
      setup_failed: 'Gemini-სთან კავშირი ვერ დამყარდა.',
      connection_lost: 'კავშირი გაწყდა.',
      unsupported: 'ეს ბრაუზერი ცოცხალ ხმას ვერ უჭერს მხარს.',
    },
    hints: {
      mic_denied: 'მისამართის ზოლში დააჭირე ბოქლომის ხატულას → მიკროფონი → დაშვება და სცადე თავიდან.',
      mic_unavailable: 'მიკროფონი სხვა აპს ან ჩანართს ხომ არ უკავია? დახურე და სცადე თავიდან.',
      mic_lost: 'შეამოწმე ყურსასმენის ან Bluetooth-ის კავშირი და სცადე თავიდან.',
    },
    micHeadline: 'მიკროფონი მიუწვდომელია',
    startFailed: 'Live ვერ დაიწყო',
    mute: 'მიკროფონის დადუმება',
    camera: 'კამერა',
    flip: 'კამერის შებრუნება',
    frontCamera: 'წინა კამერა',
    backCamera: 'უკანა კამერა',
    end: 'ზარის დასრულება',
    endShort: 'დასრულება',
    retry: 'თავიდან ცდა',
    captions: 'სუბტიტრები',
    copyLink: 'ბმულის კოპირება',
    copied: 'დაკოპირდა',
    openInBrowser: 'ბრაუზერში გახსნა',
    tapToStart: 'შეეხე ხმის ჩასართავად',
    showScreen: 'ეკრანის ნახვა',
  },
  en: {
    title: 'Live Conversation',
    live: 'Live',
    status: {
      idle: 'Ready',
      connecting: 'Connecting…',
      listening: 'Listening',
      thinking: 'Thinking…',
      speaking: 'Speaking…',
      reconnecting: 'Reconnecting…',
      error: 'Connection problem',
      closed: 'Call ended',
    },
    errors: {
      mic_denied: "Microphone access isn't allowed.",
      mic_system_denied: 'The microphone is blocked in your system settings — allow it for this browser (Settings → Privacy → Microphone).',
      mic_not_found: 'No microphone found — connect a microphone or headset and try again.',
      mic_busy: 'Another app is using the microphone — close calls or recorders (Zoom, Teams, Discord) and try again.',
      mic_in_app: "The microphone doesn't work in this in-app browser — open myavatar.ge in Safari or Chrome.",
      mic_insecure: 'The microphone only works over a secure (https) connection.',
      mic_lost: 'The microphone disconnected during the call.',
      mic_unavailable: 'The microphone could not be started.',
      auth: 'Sign in to start a live conversation.',
      rate_limited: 'Too many attempts — try again in a moment.',
      unavailable: 'Live voice is unavailable right now.',
      mint_failed: 'The conversation could not be started.',
      setup_failed: 'Could not connect to Gemini.',
      connection_lost: 'The connection was lost.',
      unsupported: 'This browser does not support live voice.',
    },
    hints: {
      mic_denied: 'Tap the lock icon in the address bar → Microphone → Allow, then try again.',
      mic_unavailable: 'Is another app or tab using the microphone? Close it and try again.',
      mic_lost: 'Check your headset or Bluetooth connection and try again.',
    },
    micHeadline: 'Microphone unavailable',
    startFailed: "Live couldn't start",
    mute: 'Mute microphone',
    camera: 'Camera',
    flip: 'Flip camera',
    frontCamera: 'Front camera',
    backCamera: 'Back camera',
    end: 'End call',
    endShort: 'End',
    retry: 'Try again',
    captions: 'Captions',
    copyLink: 'Copy link',
    copied: 'Copied',
    openInBrowser: 'Open in browser',
    tapToStart: 'Tap to turn on sound',
    showScreen: 'Show the screen',
  },
  ru: {
    title: 'Живой разговор',
    live: 'Live',
    status: {
      idle: 'Готово',
      connecting: 'Подключение…',
      listening: 'Слушаю',
      thinking: 'Думаю…',
      speaking: 'Говорю…',
      reconnecting: 'Восстанавливаю связь…',
      error: 'Проблема со связью',
      closed: 'Звонок завершён',
    },
    errors: {
      mic_denied: 'Доступ к микрофону не разрешён.',
      mic_system_denied: 'Микрофон заблокирован в настройках системы — разрешите его для браузера (Настройки → Конфиденциальность → Микрофон).',
      mic_not_found: 'Микрофон не найден — подключите микрофон или гарнитуру и повторите.',
      mic_busy: 'Микрофон занят другим приложением — закройте звонок или запись (Zoom, Teams, Discord) и повторите.',
      mic_in_app: 'Во встроенном браузере микрофон не работает — откройте myavatar.ge в Safari или Chrome.',
      mic_insecure: 'Микрофон работает только по защищённому (https) соединению.',
      mic_lost: 'Микрофон отключился во время звонка.',
      mic_unavailable: 'Не удалось включить микрофон.',
      auth: 'Войдите в аккаунт, чтобы начать живой разговор.',
      rate_limited: 'Слишком много попыток — попробуйте чуть позже.',
      unavailable: 'Живой голос сейчас недоступен.',
      mint_failed: 'Не удалось начать разговор.',
      setup_failed: 'Не удалось подключиться к Gemini.',
      connection_lost: 'Соединение потеряно.',
      unsupported: 'Этот браузер не поддерживает живой голос.',
    },
    hints: {
      mic_denied: 'Нажмите на значок замка в адресной строке → Микрофон → Разрешить и повторите.',
      mic_unavailable: 'Микрофон не занят другим приложением или вкладкой? Закройте его и повторите.',
      mic_lost: 'Проверьте подключение гарнитуры или Bluetooth и повторите.',
    },
    micHeadline: 'Микрофон недоступен',
    startFailed: 'Не удалось запустить Live',
    mute: 'Выключить микрофон',
    camera: 'Камера',
    flip: 'Перевернуть камеру',
    frontCamera: 'Фронтальная камера',
    backCamera: 'Основная камера',
    end: 'Завершить звонок',
    endShort: 'Завершить',
    retry: 'Повторить',
    captions: 'Субтитры',
    copyLink: 'Скопировать ссылку',
    copied: 'Скопировано',
    openInBrowser: 'Открыть в браузере',
    tapToStart: 'Нажмите, чтобы включить звук',
    showScreen: 'Показать экран',
  },
};

/** The screen's headline for an error: the MICROPHONE for mic codes, the connection only for connection codes. */
export function liveErrorHeadline(error: LiveErrorCode, locale: Locale = 'ka'): string {
  const t = LIVE_OVERLAY_STRINGS[locale] ?? LIVE_OVERLAY_STRINGS.ka;
  if (isMicErrorCode(error)) return t.micHeadline;
  if (error === 'connection_lost' || error === 'setup_failed') return t.status.error;
  return t.startFailed;
}

/** This page as a link that re-opens Live (ChatChrome's `?voice=1`), for leaving an in-app browser. */
function liveLink(): string {
  try {
    const u = new URL(window.location.href);
    u.hash = '';
    u.searchParams.set('voice', '1');
    return u.toString();
  } catch {
    return '';
  }
}

/** Android can hand a URL to Chrome from inside a WebView; iOS in-app browsers have no such door (copy link only). */
function androidIntentFor(link: string): string | null {
  if (typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent || '') || !link) return null;
  try {
    const u = new URL(link);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return null;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* in-app WebViews often refuse the async clipboard — fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export interface LiveModeOverlayProps {
  locale?: Locale;
  status: LiveStatus;
  error?: LiveErrorCode | null;
  /** The browser's error (name shown small on the error screen). */
  errorDetail?: LiveErrorDetail | null;
  captions: readonly LiveCaption[];
  muted: boolean;
  cameraOn: boolean;
  cameraFacing?: 'user' | 'environment';
  getLevels?: () => LiveLevels;
  /** The camera preview element (useLiveCamera().videoRef). */
  videoRef?: Ref<HTMLVideoElement>;
  /** The user's enrolled avatar: shown inside the orb and as a soft backdrop while the camera is off. */
  avatarUrl?: string | null;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onFlipCamera?: () => void;
  onEnd: () => void;
  /** Shown on the error screen. Runs inside the tap (the session creates its audio context there). */
  onRetry?: () => void;
  /** The call's audio could not start without a gesture: show "tap to turn on sound". */
  audioBlocked?: boolean;
  onResumeAudio?: () => void;
  /** Host controls placed before the End button (e.g. the voice switch). */
  extraControls?: ReactNode;
  /** Captions exist for this call (false on the degraded legacy wire). The on/off toggle is view state. */
  showCaptions?: boolean;
  /** What the agent just did (components/voice/live/liveActions.ts), newest first. Shown only with onOpenAction. */
  actions?: readonly LiveActionCard[];
  /** A card's Open: the host ends the call and brings the prepared studio / the code canvas to the front. */
  onOpenAction?: (card: LiveActionCard) => void;
  /** What the agent is doing now (useGeminiLiveSession().activity), oldest first. */
  activity?: readonly LiveActivityItem[];
  /** Generations still rendering (the job tray the call covers). */
  jobs?: readonly LiveJobLine[];
  /**
   * The call docked into a slim bar at the top so the user sees the app (components/voice/live/LiveDock.tsx). Never while
   * an error is up — the error screen needs the room. With `onToggleDock` the full screen offers „ეკრანის ნახვა“.
   */
  docked?: boolean;
  onToggleDock?: () => void;
  /** Cut the agent's answer off (shown while it speaks). */
  onStopSpeaking?: () => void;
  /** A confirmed generation counting down, with its Cancel. */
  pendingRun?: LivePendingRun | null;
  onCancelRun?: () => void;
}

const ROUND_BTN =
  'flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors duration-200 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60';
const IDLE = 'text-app-text hover:bg-white/10';
const ON = 'bg-app-text text-app-bg';
const SECONDARY_BTN =
  'inline-flex h-11 touch-manipulation items-center gap-2 rounded-full bg-white/[0.08] px-5 font-semibold text-app-text '
  + 'ring-1 ring-white/10 transition-colors duration-200 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 '
  + 'focus-visible:ring-app-accent/60';
const NO_ACTIONS: readonly LiveActionCard[] = [];
const NO_ACTIVITY: readonly LiveActivityItem[] = [];
const NO_JOBS: readonly LiveJobLine[] = [];
/** The pill: 24 px off the bottom + 64 px tall; the action strip floats 12 px above it. */
const STRIP_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 100px)';

export default function LiveModeOverlay({
  locale = 'ka',
  status,
  error,
  errorDetail,
  captions,
  muted,
  cameraOn,
  cameraFacing = 'environment',
  getLevels,
  videoRef,
  avatarUrl,
  onToggleMute,
  onToggleCamera,
  onFlipCamera,
  onEnd,
  onRetry,
  audioBlocked = false,
  onResumeAudio,
  extraControls,
  showCaptions = true,
  actions = NO_ACTIONS,
  onOpenAction,
  activity = NO_ACTIVITY,
  jobs = NO_JOBS,
  docked = false,
  onToggleDock,
  onStopSpeaking,
  pendingRun = null,
  onCancelRun,
}: LiveModeOverlayProps) {
  const t = LIVE_OVERLAY_STRINGS[locale] ?? LIVE_OVERLAY_STRINGS.ka;
  const isDocked = docked && !(status === 'error' && !!error);
  // The dialog behaviour (focus trap, Escape hangs up) belongs to the FULL screen only: docked, the page is the user's.
  const dialogRef = useDialogA11y<HTMLDivElement>(!isDocked, onEnd);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const isError = status === 'error' && !!error;
  const orbState = orbStateFor(status);
  const statusLabel = t.status[status];
  const showBackdrop = !!avatarUrl && !cameraOn;
  // Georgian's tall script needs the 16 px floor; Latin/Cyrillic secondary copy stays a step quieter.
  const quiet = locale === 'ka' ? 'text-[16px]' : 'text-[15px]';
  // The strip is mounted for the whole call (its live region must exist before the first card); it takes room only
  // once it holds a card — then the centred content moves up by the strip's height (~84 px).
  const showActions = !isError && !!onOpenAction;
  const actionsShown = showActions && actions.length > 0;
  const activityShown = !isError && (activity.length > 0 || jobs.length > 0);

  const onCopyLink = useCallback(() => {
    void copyText(liveLink()).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  if (isDocked) {
    const dock = (
      <LiveDock
        locale={locale}
        status={status}
        statusLabel={statusLabel}
        captions={showCaptions ? captions : []}
        activityLine={liveActivityLine(activity, locale)}
        muted={muted}
        getLevels={getLevels}
        avatarUrl={avatarUrl}
        onToggleMute={onToggleMute}
        onEnd={onEnd}
        onExpand={onToggleDock ?? (() => {})}
        {...(onStopSpeaking ? { onStopSpeaking } : {})}
        pendingRun={pendingRun}
        {...(onCancelRun ? { onCancelRun } : {})}
      />
    );
    return typeof document === 'undefined' ? dock : createPortal(dock, document.body);
  }

  let errorPanel: ReactNode = null;
  if (isError && error) {
    const mic = isMicErrorCode(error);
    const Icon = mic ? MicOff : error === 'connection_lost' || error === 'setup_failed' ? WifiOff : AlertCircle;
    const hint = t.hints[error];
    const intent = error === 'mic_in_app' && typeof window !== 'undefined' ? androidIntentFor(liveLink()) : null;
    errorPanel = (
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center px-6 text-center">
        <span aria-hidden className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.08] text-app-text">
          <Icon size={26} />
        </span>
        <h2 className="text-[20px] font-semibold leading-[1.4] text-app-text">{liveErrorHeadline(error, locale)}</h2>
        <p role="alert" className="mt-2 text-[16px] leading-[1.6] text-app-text/90">{t.errors[error]}</p>
        {hint && <p className={`mt-2 ${quiet} leading-[1.6] text-app-muted`}>{hint}</p>}
        {/* The browser's own name for the failure: meaningless to most users, decisive in a support screenshot. */}
        {errorDetail?.name && (
          <p data-testid="live-error-name" className="mt-3 font-mono text-[12px] leading-5 text-app-muted/80">{errorDetail.name}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`inline-flex h-11 touch-manipulation items-center gap-2 rounded-full bg-app-text px-5 ${quiet} font-semibold text-app-bg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60`}
            >
              <RotateCcw size={16} aria-hidden />
              {t.retry}
            </button>
          )}
          {intent && (
            <a href={intent} className={`${SECONDARY_BTN} ${quiet}`}>
              <ExternalLink size={16} aria-hidden />
              {t.openInBrowser}
            </a>
          )}
          {error === 'mic_in_app' && (
            <button type="button" onClick={onCopyLink} className={`${SECONDARY_BTN} ${quiet}`}>
              {copied ? <Check size={16} aria-hidden className="text-app-accent" /> : <Copy size={16} aria-hidden />}
              <span aria-live="polite">{copied ? t.copied : t.copyLink}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const overlay = (
    // Content is centred between the top bar (64 px) and the control pill (~64 px + 24 px + the safe area): the
    // padding reserves both, so on a short landscape phone the status line is never laid out under the pill.
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      tabIndex={-1}
      data-theme="dark"
      data-live-status={status}
      className="ag-no-drag fixed inset-0 z-[130] flex flex-col items-center justify-center overflow-hidden bg-app-bg text-app-text outline-none"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)',
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${actionsShown ? 196 : 112}px)`,
      }}
    >
      {/* Full-screen camera (as in the Gemini app), with a scrim so the text stays readable. */}
      <video ref={videoRef} playsInline muted className={cameraOn && !isError ? 'absolute inset-0 z-0 h-full w-full object-cover' : 'hidden'} />
      {cameraOn && !isError && <div aria-hidden className="absolute inset-0 z-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />}

      {showBackdrop && !isError && (
        <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl!} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/85" />
        </div>
      )}

      {/* Top bar: names the mode (quietly — the user knows where they are) and holds the captions toggle. */}
      <div
        className="absolute inset-x-0 z-20 flex h-16 items-center justify-between px-3"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <span className="inline-flex items-center gap-2 pl-2 text-[16px] font-medium text-app-text">
          <span aria-hidden className="h-2 w-2 rounded-full bg-app-accent" />
          {t.live}
        </span>
        <span className="flex items-center gap-1.5">
        {onToggleDock && !isError && (
          <button
            type="button"
            onClick={onToggleDock}
            data-testid="live-show-screen"
            className={`inline-flex h-11 shrink-0 touch-manipulation items-center gap-2 rounded-full bg-white/[0.08] px-4 ${quiet} font-medium text-app-text transition-colors duration-200 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60`}
          >
            <Minimize2 size={18} aria-hidden />
            <span className="hidden min-[380px]:inline">{t.showScreen}</span>
            <span className="sr-only min-[380px]:hidden">{t.showScreen}</span>
          </button>
        )}
        {showCaptions && !isError && (
          <button
            type="button"
            onClick={() => setCaptionsOn((v) => !v)}
            aria-label={t.captions}
            aria-pressed={captionsOn}
            className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${captionsOn ? ON : 'bg-white/[0.08] text-app-text hover:bg-white/[0.14]'}`}
          >
            <Subtitles size={20} aria-hidden />
          </button>
        )}
        </span>
      </div>

      {isError ? errorPanel : (
        <>
          <LiveOrb
            state={orbState}
            getLevels={getLevels}
            size={cameraOn ? 88 : actionsShown || activityShown ? 168 : 208}
            imageUrl={avatarUrl}
            label={statusLabel}
            className="relative z-10 mb-6"
          />

          {/* Quiet on purpose: the orb carries the state; the line only names it. */}
          <span aria-live="polite" className={`relative z-10 ${quiet} font-medium leading-[1.6] text-app-muted`}>
            {statusLabel}
          </span>

          {audioBlocked && onResumeAudio && (
            <button
              type="button"
              onClick={onResumeAudio}
              className={`relative z-10 mt-4 inline-flex h-11 touch-manipulation items-center gap-2 rounded-full bg-app-text px-5 ${quiet} font-semibold text-app-bg transition-opacity duration-200 hover:opacity-90`}
            >
              <Volume2 size={18} aria-hidden />
              {t.tapToStart}
            </button>
          )}

          {activityShown && (
            <LiveActivityFeed activity={activity} jobs={jobs} locale={locale} className="relative z-10 mt-4" />
          )}

          {showCaptions && captionsOn && (
            <LiveCaptions captions={captions} locale={locale} className={`relative z-10 min-h-[5.5rem] ${activityShown ? 'mt-4' : 'mt-6'}`} />
          )}
        </>
      )}

      {showActions && onOpenAction && (
        <div className="absolute inset-x-0 z-20" style={{ bottom: STRIP_BOTTOM }}>
          {pendingRun && onCancelRun && (
            <div className="mb-2 flex justify-center px-4">
              <LiveRunBanner run={pendingRun} locale={locale} onCancel={onCancelRun} className="w-full max-w-md" />
            </div>
          )}
          <LiveActionCards cards={actions} locale={locale} onOpen={onOpenAction} />
        </div>
      )}

      {/* Controls: one floating pill (Gemini Live, 2026). Only End stays on the error screen — the rest would act on
          a call that no longer exists. Labels collapse to icons below `sm` so five controls fit a 320 px phone. */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        <div className="flex max-w-full items-center gap-1.5 rounded-full bg-white/[0.08] p-2 ring-1 ring-white/10 backdrop-blur-md sm:gap-2">
          {!isError && (
            <>
              <button
                type="button"
                onClick={onToggleCamera}
                aria-label={t.camera}
                aria-pressed={cameraOn}
                className={`${ROUND_BTN} ${cameraOn ? ON : IDLE}`}
              >
                {cameraOn ? <Video size={20} aria-hidden /> : <VideoOff size={20} aria-hidden />}
              </button>
              {cameraOn && onFlipCamera && (
                <button
                  type="button"
                  onClick={onFlipCamera}
                  aria-label={t.flip}
                  title={cameraFacing === 'user' ? t.frontCamera : t.backCamera}
                  className={`${ROUND_BTN} ${IDLE}`}
                >
                  <SwitchCamera size={20} aria-hidden />
                </button>
              )}
              <div data-testid="live-waveform" className="hidden h-12 w-10 items-center justify-center min-[360px]:flex sm:w-16">
                <LiveWaveform state={muted ? 'idle' : orbState} getLevels={getLevels} />
              </div>
              {status === 'speaking' && onStopSpeaking && (
                <button
                  type="button"
                  onClick={onStopSpeaking}
                  aria-label={LIVE_DOCK_STRINGS[locale]?.stopSpeaking ?? LIVE_DOCK_STRINGS.ka.stopSpeaking}
                  data-testid="live-stop-speaking"
                  className={`${ROUND_BTN} ${IDLE}`}
                >
                  <Square size={18} aria-hidden className="fill-current" />
                </button>
              )}
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={t.mute}
                aria-pressed={muted}
                className={`${ROUND_BTN} ${muted ? ON : IDLE}`}
              >
                {muted ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
              </button>
              {extraControls}
            </>
          )}
          <button
            type="button"
            onClick={onEnd}
            aria-label={t.end}
            className={`inline-flex h-12 min-w-[48px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full bg-app-danger px-3 ${quiet} font-semibold text-white transition-colors duration-200 hover:bg-app-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:px-5`}
          >
            <X size={18} aria-hidden />
            <span className="hidden sm:inline">{t.endShort}</span>
          </button>
        </div>
      </div>
    </div>
  );

  // ChatChrome loads this screen with ssr:false, so document exists; the guard keeps a server render harmless.
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

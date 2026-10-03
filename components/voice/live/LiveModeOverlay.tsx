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
 * CONTROLS (the owner's brief, 2026-10-03): one row of round glass buttons, 56 px, each with its word under it — camera ·
 * stop-speaking (while the agent speaks) · mute · the host's extras (the voice) · End, a solid red circle with a
 * phone-down icon. Toggles expose aria-pressed and invert when on (bg-app-text / text-app-bg — the product's toggle
 * grammar). Four controls, five while the agent speaks, fit a 320 px phone (the words appear from 360 px); flip-camera
 * moved to the top bar beside the camera preview, and the waveform to the status line, where it says who is talking.
 * ⚠️ The words under the buttons are 12 px, under the 16 px Georgian floor on purpose: they are captions of the icons
 * (the accessible name carries the full phrase), like a phone's tab bar. Measured: „დასრულება“ is 84 px wide at 13 px,
 * and five Georgian words at 13 px overflow a 360 px phone while the agent speaks; at 12 px they fit with room between.
 * The dialog takes focus on open, traps Tab and ends the call on Escape (hooks/useDialogA11y). Georgian copy elsewhere
 * never goes below 16 px / 1.6.
 *
 * THE AGENT IS THE ROCKET: the orb carries the brand mark, and with the camera off the same rocket stands large and faint
 * behind it (LiveOrb `backdrop`). The user's enrolled avatar poster is no longer shown here.
 *
 * VOICE-TO-ACTION: with `onOpenAction`, a strip of LiveActionCards sits above the controls — what the agent just did
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
  AlertCircle, Check, Copy, ExternalLink, Mic, MicOff, Minimize2, PhoneOff, RotateCcw, Square, Subtitles, SwitchCamera, Video,
  VideoOff, Volume2, WifiOff,
} from 'lucide-react';

import { useDialogA11y } from '@/hooks/useDialogA11y';

import LiveActionCards from './LiveActionCards';
import LiveActivityFeed, { liveCurrentStep, type LiveJobLine } from './LiveActivityFeed';
import {
  LiveBottomScrim,
  LiveCallFrame,
  LiveControl,
  LiveControlRow,
  LiveErrorPanel,
  LiveStatusLine,
  LiveTopBar,
  LiveTopToggle,
  liveQuietText,
  livePrimaryButtonClass,
} from './LiveCallChrome';
import LiveDock, { LIVE_DOCK_STRINGS, LiveRunBanner, type LiveDockLink } from './LiveDock';
import type { LiveActivityItem } from './liveActivity';
import LiveCaptions from './LiveCaptions';
import LiveOrb, { orbStateFor } from './LiveOrb';
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
  /** The word under the mute button (contained in `mute`). */
  muteShort: string;
  camera: string;
  /** The word under stop-speaking (contained in LIVE_DOCK_STRINGS.stopSpeaking). */
  stopShort: string;
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
    live: 'ცოცხალი ზარი',
    status: {
      idle: 'მზად არის',
      connecting: 'უკავშირდება…',
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
    muteShort: 'დადუმება',
    camera: 'კამერა',
    stopShort: 'შეწყვეტა',
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
    live: 'Live call',
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
    muteShort: 'Mute',
    camera: 'Camera',
    stopShort: 'Stop',
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
    live: 'Живой звонок',
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
    muteShort: 'Микрофон',
    camera: 'Камера',
    stopShort: 'Остановить',
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

const SECONDARY_BTN =
  'inline-flex h-11 touch-manipulation items-center gap-2 rounded-full bg-white/[0.08] px-5 font-semibold text-app-text '
  + 'ring-1 ring-white/10 transition-colors duration-200 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 '
  + 'focus-visible:ring-app-accent/60';
const NO_ACTIONS: readonly LiveActionCard[] = [];
const NO_ACTIVITY: readonly LiveActivityItem[] = [];
const NO_JOBS: readonly LiveJobLine[] = [];
/** The control row: 20 px off the bottom + a 56 px circle and its word (~80 px); the action strip floats above it. */
const STRIP_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 112px)';

// The bottom row's control lives with the rest of the shared call chrome (the ElevenLabs fallback draws the same row).
export { LiveControl, type LiveControlProps } from './LiveCallChrome';

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
  // Links the user hid (or already opened) from the dock; the full screen keeps its cards.
  const [dismissedLinks, setDismissedLinks] = useState<ReadonlySet<string>>(() => new Set());
  const dismissLink = useCallback((id: string) => setDismissedLinks((prev) => new Set(prev).add(id)), []);
  // Georgian's tall script needs the 16 px floor; Latin/Cyrillic secondary copy stays a step quieter.
  const quiet = liveQuietText(locale);
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
    const linkCard = actions.find((c) => c.action.type === 'open_url' && !dismissedLinks.has(c.id));
    const link: LiveDockLink | null = linkCard && linkCard.action.type === 'open_url'
      ? { id: linkCard.id, url: linkCard.action.url, ...(linkCard.action.title ? { title: linkCard.action.title } : {}) }
      : null;
    const dock = (
      <LiveDock
        locale={locale}
        status={status}
        statusLabel={statusLabel}
        captions={showCaptions ? captions : []}
        step={liveCurrentStep(activity, locale)}
        muted={muted}
        getLevels={getLevels}
        onToggleMute={onToggleMute}
        onEnd={onEnd}
        onExpand={onToggleDock ?? (() => {})}
        {...(onStopSpeaking ? { onStopSpeaking } : {})}
        pendingRun={pendingRun}
        {...(onCancelRun ? { onCancelRun } : {})}
        link={link}
        onDismissLink={dismissLink}
      />
    );
    return typeof document === 'undefined' ? dock : createPortal(dock, document.body);
  }

  let errorPanel: ReactNode = null;
  if (isError && error) {
    const mic = isMicErrorCode(error);
    const Icon = mic ? MicOff : error === 'connection_lost' || error === 'setup_failed' ? WifiOff : AlertCircle;
    const intent = error === 'mic_in_app' && typeof window !== 'undefined' ? androidIntentFor(liveLink()) : null;
    errorPanel = (
      <LiveErrorPanel
        icon={<Icon size={26} />}
        headline={liveErrorHeadline(error, locale)}
        reason={t.errors[error]}
        hint={t.hints[error]}
        detailName={errorDetail?.name}
        locale={locale}
      >
        {onRetry && (
          <button type="button" onClick={onRetry} className={livePrimaryButtonClass(locale)}>
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
      </LiveErrorPanel>
    );
  }

  const overlay = (
    <LiveCallFrame ref={dialogRef} ariaLabel={t.title} data-live-status={status} padBottom={actionsShown ? 204 : 124}>
      {/* Full-screen camera (as in the Gemini app), with a scrim so the text stays readable. */}
      <video ref={videoRef} playsInline muted className={cameraOn && !isError ? 'absolute inset-0 z-0 h-full w-full object-cover' : 'hidden'} />
      {cameraOn && !isError && <div aria-hidden className="absolute inset-0 z-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />}

      {!isError && <LiveBottomScrim />}

      {/* Top bar: names the mode (quietly — the user knows where they are) and holds the captions toggle. */}
      <LiveTopBar label={t.live} live={!isError}>
        {cameraOn && onFlipCamera && !isError && (
          // Beside the camera preview (as in Gemini Live), so the bottom row keeps room on a 320 px phone.
          <button
            type="button"
            onClick={onFlipCamera}
            aria-label={t.flip}
            title={cameraFacing === 'user' ? t.frontCamera : t.backCamera}
            className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/[0.08] text-app-text transition-colors duration-200 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
          >
            <SwitchCamera size={20} aria-hidden />
          </button>
        )}
        {onToggleDock && !isError && (
          <button
            type="button"
            onClick={onToggleDock}
            data-testid="live-show-screen"
            className={`inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full bg-white/[0.08] min-[430px]:w-auto min-[430px]:px-4 ${quiet} font-medium text-app-text transition-colors duration-200 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60`}
          >
            <Minimize2 size={18} aria-hidden />
            {/* The words only where they fit beside „ცოცხალი ზარი" and the captions toggle (~413 px in Georgian, plus room to breathe): at
                390–414 they pushed the toggle 14 px off the screen and broke the label in two (2026-10-03). */}
            <span className="hidden whitespace-nowrap min-[430px]:inline">{t.showScreen}</span>
            <span className="sr-only min-[430px]:hidden">{t.showScreen}</span>
          </button>
        )}
        {showCaptions && !isError && (
          <LiveTopToggle label={t.captions} pressed={captionsOn} onClick={() => setCaptionsOn((v) => !v)} icon={<Subtitles size={20} aria-hidden />} />
        )}
      </LiveTopBar>

      {isError ? errorPanel : (
        <>
          <LiveOrb
            state={orbState}
            getLevels={getLevels}
            // A step smaller per strip on screen (the cards, the agent's steps), so the captions keep their room.
            size={cameraOn ? 88 : actionsShown && activityShown ? 136 : actionsShown || activityShown ? 168 : 208}
            label={statusLabel}
            backdrop={!cameraOn}
            className="relative z-10 mb-6"
          />

          <LiveStatusLine state={orbState} muted={muted} getLevels={getLevels} label={statusLabel} locale={locale} />

          {audioBlocked && onResumeAudio && (
            <button type="button" onClick={onResumeAudio} className={`relative z-10 mt-4 ${livePrimaryButtonClass(locale)}`}>
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

      {/* Controls: one row of round glass buttons, each with its word (see the header). Only End stays on the error
          screen — the rest would act on a call that no longer exists. */}
      <LiveControlRow>
        {!isError && (
          <>
            <LiveControl
              label={t.camera}
              icon={cameraOn ? <Video size={22} aria-hidden /> : <VideoOff size={22} aria-hidden />}
              onClick={onToggleCamera}
              pressed={cameraOn}
              locale={locale}
            />
            {status === 'speaking' && onStopSpeaking && (
              <LiveControl
                label={t.stopShort}
                ariaLabel={LIVE_DOCK_STRINGS[locale]?.stopSpeaking ?? LIVE_DOCK_STRINGS.ka.stopSpeaking}
                icon={<Square size={18} aria-hidden className="fill-current" />}
                onClick={onStopSpeaking}
                locale={locale}
                testId="live-stop-speaking"
              />
            )}
            <LiveControl
              label={t.muteShort}
              ariaLabel={t.mute}
              icon={muted ? <MicOff size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
              onClick={onToggleMute}
              pressed={muted}
              locale={locale}
            />
            {extraControls}
          </>
        )}
        <LiveControl
          label={t.endShort}
          ariaLabel={t.end}
          icon={<PhoneOff size={22} aria-hidden />}
          onClick={onEnd}
          tone="danger"
          locale={locale}
          testId="live-end"
        />
      </LiveControlRow>
    </LiveCallFrame>
  );

  // ChatChrome loads this screen with ssr:false, so document exists; the guard keeps a server render harmless.
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

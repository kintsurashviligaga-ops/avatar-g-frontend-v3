'use client';

/**
 * LiveModeOverlay — the full-screen Live call: orb, status line, rolling captions and the control bar
 * (mute · camera · flip · host extras · end). Pure presentation: every action is a prop, all state comes from
 * useGeminiLiveSession / useLiveCamera in the host (components/voice/GeminiLiveConversation.tsx).
 *
 * Controls are ≥ 44 px touch targets with ka/en/ru accessible names; toggles expose aria-pressed. The dialog takes
 * focus on open, traps Tab and ends the call on Escape (hooks/useDialogA11y).
 */
import type { ReactNode, Ref } from 'react';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, RotateCcw, SwitchCamera } from 'lucide-react';

import { useDialogA11y } from '@/hooks/useDialogA11y';

import LiveCaptions from './LiveCaptions';
import LiveOrb, { orbStateFor } from './LiveOrb';
import type { LiveCaption, LiveErrorCode, LiveLevels, LiveStatus } from './useGeminiLiveSession';

type Locale = 'ka' | 'en' | 'ru';

interface Strings {
  title: string;
  status: Record<LiveStatus, string>;
  errors: Record<LiveErrorCode, string>;
  mute: string;
  camera: string;
  flip: string;
  frontCamera: string;
  backCamera: string;
  end: string;
  retry: string;
}

export const LIVE_OVERLAY_STRINGS: Record<Locale, Strings> = {
  ka: {
    title: 'ცოცხალი საუბარი',
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
      mic_denied: 'მიკროფონზე წვდომა დაბლოკილია — დაუშვი ბრაუზერის პარამეტრებში.',
      mic_unavailable: 'მიკროფონი ვერ ჩაირთო.',
      auth: 'ცოცხალი საუბრისთვის შედი ანგარიშზე.',
      rate_limited: 'ძალიან ბევრი მცდელობა — სცადე ცოტა ხანში.',
      unavailable: 'ცოცხალი ხმა ახლა მიუწვდომელია.',
      mint_failed: 'საუბრის დაწყება ვერ მოხერხდა.',
      setup_failed: 'Gemini-სთან კავშირი ვერ დამყარდა.',
      connection_lost: 'კავშირი გაწყდა.',
      unsupported: 'ეს ბრაუზერი ცოცხალ ხმას ვერ უჭერს მხარს.',
    },
    mute: 'მიკროფონის დადუმება',
    camera: 'კამერა',
    flip: 'კამერის შებრუნება',
    frontCamera: 'წინა კამერა',
    backCamera: 'უკანა კამერა',
    end: 'ზარის დასრულება',
    retry: 'თავიდან ცდა',
  },
  en: {
    title: 'Live Conversation',
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
      mic_denied: 'Microphone access is blocked — allow it in your browser settings.',
      mic_unavailable: 'The microphone could not be started.',
      auth: 'Sign in to start a live conversation.',
      rate_limited: 'Too many attempts — try again in a moment.',
      unavailable: 'Live voice is unavailable right now.',
      mint_failed: 'The conversation could not be started.',
      setup_failed: 'Could not connect to Gemini.',
      connection_lost: 'The connection was lost.',
      unsupported: 'This browser does not support live voice.',
    },
    mute: 'Mute microphone',
    camera: 'Camera',
    flip: 'Flip camera',
    frontCamera: 'Front camera',
    backCamera: 'Back camera',
    end: 'End call',
    retry: 'Try again',
  },
  ru: {
    title: 'Живой разговор',
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
      mic_denied: 'Доступ к микрофону заблокирован — разрешите его в настройках браузера.',
      mic_unavailable: 'Не удалось включить микрофон.',
      auth: 'Войдите в аккаунт, чтобы начать живой разговор.',
      rate_limited: 'Слишком много попыток — попробуйте чуть позже.',
      unavailable: 'Живой голос сейчас недоступен.',
      mint_failed: 'Не удалось начать разговор.',
      setup_failed: 'Не удалось подключиться к Gemini.',
      connection_lost: 'Соединение потеряно.',
      unsupported: 'Этот браузер не поддерживает живой голос.',
    },
    mute: 'Выключить микрофон',
    camera: 'Камера',
    flip: 'Перевернуть камеру',
    frontCamera: 'Фронтальная камера',
    backCamera: 'Основная камера',
    end: 'Завершить звонок',
    retry: 'Повторить',
  },
};

export interface LiveModeOverlayProps {
  locale?: Locale;
  status: LiveStatus;
  error?: LiveErrorCode | null;
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
  /** Shown on the error screen. */
  onRetry?: () => void;
  /** Host controls placed before the End button (e.g. the voice switch). */
  extraControls?: ReactNode;
  showCaptions?: boolean;
}

const ROUND_BTN = 'flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full transition';
const NEUTRAL = 'bg-white/[0.08] text-app-text hover:bg-white/[0.14]';

export default function LiveModeOverlay({
  locale = 'ka',
  status,
  error,
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
  extraControls,
  showCaptions = true,
}: LiveModeOverlayProps) {
  const t = LIVE_OVERLAY_STRINGS[locale] ?? LIVE_OVERLAY_STRINGS.ka;
  const dialogRef = useDialogA11y<HTMLDivElement>(true, onEnd);
  const statusLabel = t.status[status];
  const errorText = status === 'error' && error ? t.errors[error] : null;
  const showBackdrop = !!avatarUrl && !cameraOn;

  return (
    // ⚠️ CONTENT WAS CENTRED IN THE FULL VIEWPORT WHILE THE CONTROL BAR IS `fixed bottom-0`. The bar is roughly
    // 90px tall with its safe-area padding, and nothing reserved that space — so on a short screen (a landscape
    // phone, a small device with the browser chrome showing) the status line and the error were laid out under
    // it. Reserving the bar's height makes the centring honest.
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      tabIndex={-1}
      className="ag-no-drag fixed inset-0 z-[60] flex flex-col items-center justify-center bg-app-bg/95 backdrop-blur-md outline-none"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
    >
      {/* Full-screen camera (as in the Gemini app), with a scrim so the text stays readable. */}
      <video ref={videoRef} playsInline muted className={cameraOn ? 'absolute inset-0 z-0 h-full w-full object-cover' : 'hidden'} />
      {cameraOn && <div aria-hidden className="absolute inset-0 z-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />}

      {showBackdrop && (
        <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl!} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/85" />
        </div>
      )}

      {/* Eyebrow: quiet on purpose — it names the screen, which the user already knows. */}
      <span className="relative z-10 mb-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted/70">{t.title}</span>

      <LiveOrb
        state={orbStateFor(status)}
        getLevels={getLevels}
        size={cameraOn ? 88 : 184}
        imageUrl={avatarUrl}
        label={statusLabel}
        className="relative z-10 mb-6"
      />

      {/* The hero line: the only thing on this screen that changes, so it reads as the primary signal. */}
      <span aria-live="polite" className="relative z-10 mb-1.5 text-[17px] font-semibold tracking-tight text-app-text">
        {statusLabel}
      </span>

      {errorText && (
        <span role="alert" className="relative z-10 mb-2 max-w-xs px-6 text-center text-[12.5px] leading-snug text-app-danger">
          {errorText}
        </span>
      )}
      {status === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="relative z-10 mt-1 flex h-11 min-w-[44px] touch-manipulation items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] font-semibold text-app-text transition hover:bg-white/[0.14]"
        >
          <RotateCcw size={16} aria-hidden />
          {t.retry}
        </button>
      )}

      {showCaptions && status !== 'error' && (
        <LiveCaptions captions={captions} locale={locale} className="relative z-10 mt-5 min-h-[4.5rem]" />
      )}

      {/* Control bar. Wraps with a tight gap: five controls appear at once with the camera on, and a longer label in
          another language must never push one off the edge. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2 border-t border-white/10 bg-black/40 px-4 py-4 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={t.mute}
          aria-pressed={muted}
          className={`${ROUND_BTN} ${muted ? 'bg-app-danger/20 text-app-danger' : NEUTRAL}`}
        >
          {muted ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onToggleCamera}
          aria-label={t.camera}
          aria-pressed={cameraOn}
          className={`${ROUND_BTN} ${cameraOn ? 'bg-app-accent/20 text-app-accent' : NEUTRAL}`}
        >
          {cameraOn ? <Camera size={20} aria-hidden /> : <CameraOff size={20} aria-hidden />}
        </button>
        {cameraOn && onFlipCamera && (
          <button
            type="button"
            onClick={onFlipCamera}
            aria-label={t.flip}
            title={cameraFacing === 'user' ? t.frontCamera : t.backCamera}
            className={`${ROUND_BTN} ${NEUTRAL}`}
          >
            <SwitchCamera size={20} aria-hidden />
          </button>
        )}
        {extraControls}
        <button
          type="button"
          onClick={onEnd}
          aria-label={t.end}
          className="flex h-14 w-14 shrink-0 touch-manipulation items-center justify-center rounded-full bg-app-danger text-white shadow-lg transition hover:brightness-110"
        >
          <PhoneOff size={22} aria-hidden />
        </button>
      </div>
    </div>
  );
}

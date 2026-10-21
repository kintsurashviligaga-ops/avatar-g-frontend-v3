'use client';

import React, { useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import {
  Menu,
  Subtitles,
  Video,
  VideoOff,
  SwitchCamera,
  Mic,
  MicOff,
  X,
  Plus,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Copy,
  WifiOff,
  Volume2,
} from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { LIVE_OVERLAY_STRINGS, liveErrorHeadline } from './liveOverlayCopy';
import { LiveErrorPanel } from './LiveCallChrome';
import type {
  LiveCaption,
  LiveErrorCode,
  LiveErrorDetail,
  LiveLevels,
  LiveStatus,
} from './useGeminiLiveSession';
import { isMicErrorCode } from "./useGeminiLiveSession";
import LiveDock from "./LiveDock";
import { liveCurrentStep, type LiveJobLine } from "./LiveActivityFeed";
import type { LiveActivityItem } from './liveActivity';
import type { LiveActionCard, LivePendingRun } from './liveActions';
import LiveActionCards from './LiveActionCards';

type Locale = 'ka' | 'en' | 'ru';

export { LIVE_OVERLAY_STRINGS, liveErrorHeadline } from './liveOverlayCopy';

export interface LiveModeOverlayProps {
  locale?: Locale;
  status: LiveStatus;
  error?: LiveErrorCode | null;
  errorDetail?: LiveErrorDetail | null;
  captions: readonly LiveCaption[];
  muted: boolean;
  cameraOn: boolean;
  cameraFacing?: 'user' | 'environment';
  getLevels?: () => LiveLevels;
  videoRef?: Ref<HTMLVideoElement>;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onFlipCamera?: () => void;
  onEnd: () => void;
  onRetry?: () => void;
  audioBlocked?: boolean;
  onResumeAudio?: () => void;
  extraControls?: ReactNode;
  showCaptions?: boolean;
  actions?: readonly LiveActionCard[];
  onOpenAction?: (action: LiveActionCard) => void;
  onStopSpeaking?: () => void;
  pendingRun?: LivePendingRun | null;
  onCancelRun?: () => void;
  isDocked?: boolean;
  docked?: boolean;
  [key: string]: unknown;
  onToggleDock?: () => void;
  activity?: readonly LiveActivityItem[];
  jobs?: readonly LiveJobLine[];
}

export function LiveModeOverlay({
  locale = 'ka',
  status,
  error,
  errorDetail,
  captions,
  muted,
  cameraOn,
  getLevels,
  videoRef,
  onToggleMute,
  onToggleCamera,
  onFlipCamera,
  cameraFacing,
  onEnd,
  onRetry,
  onStopSpeaking,
  docked,
  isDocked,
  onToggleDock,
  pendingRun,
  onCancelRun,
  activity,
  audioBlocked,
  onResumeAudio,
  actions = [],
  onOpenAction,
  extraControls,
  showCaptions = true,
}: LiveModeOverlayProps) {
  const [copied, setCopied] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [dismissedLinks, setDismissedLinks] = useState<ReadonlySet<string>>(() => new Set());
  const t = LIVE_OVERLAY_STRINGS[locale];
  const dialogRef = useDialogA11y<HTMLDivElement>(!(docked || isDocked), onEnd);

  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';

  // ბოლო ნათქვამი ფრაზა (თქვენს რეფერენსში: "გამარჯობა! რით შემიძლია დაგეხმაროთ?")
  const lastAgentLine = [...captions].reverse().find((c) => c.role === 'assistant');
  const lastUserLine = [...captions].reverse().find((c) => c.role === 'user');
  const lastAgentCaption = lastAgentLine?.text || '';

  const levels = getLevels ? getLevels() : { input: 0, output: 0 };
  const activeLevel = isSpeaking ? levels.output : isListening ? levels.input : 0;

  const copyTranscript = () => {
    if (lastAgentCaption && typeof navigator !== 'undefined') {
      void navigator.clipboard.writeText(lastAgentCaption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

    if (docked || isDocked) {
    const linkCard = actions.find((card) => card.action.type === 'open_url' && !dismissedLinks.has(card.id));
    const link = linkCard?.action.type === 'open_url'
      ? { id: linkCard.id, url: linkCard.action.url, title: linkCard.action.title }
      : null;
    const dock = (
      <LiveDock
        locale={locale}
        status={status}
        statusLabel={t.status[status]}
        captions={showCaptions && captionsOn ? captions : []}
        step={liveCurrentStep(activity || [], locale)}
        muted={muted}
        getLevels={getLevels}
        onToggleMute={onToggleMute}
        onEnd={onEnd}
        onExpand={onToggleDock ?? (() => {})}
        {...(onStopSpeaking ? { onStopSpeaking } : {})}
        pendingRun={pendingRun}
        {...(onCancelRun ? { onCancelRun } : {})}
        link={link}
        onDismissLink={(id) => setDismissedLinks((previous) => new Set(previous).add(id))}
      />
    );
    return typeof document === "undefined" ? dock : createPortal(dock, document.body);
  }

  const overlay = (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.title} tabIndex={-1} data-theme="dark"
      className="fixed inset-0 z-[130] flex select-none flex-col justify-between overflow-hidden bg-black text-white">
      {/* 1. კამერის ფონი (თუ კამერა ჩართულია) */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={cameraOn && !error ? 'absolute inset-0 z-0 h-full w-full object-cover' : 'hidden'}
      />

      {/* 2. ქვემოდან ამომავალი რბილი ცისფერი ნათება (Gemini Live Ambient Nebula) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[65vh] opacity-90 transition-opacity duration-700"
        style={{
          background:
            'radial-gradient(ellipse 95% 60% at 50% 100%, rgba(26, 115, 232, 0.42) 0%, rgba(13, 37, 89, 0.22) 45%, rgba(0, 0, 0, 0) 80%)',
        }}
      />

      {/* 3. ზედა ზოლი (Top Bar): მენიუ მარცხნივ, კამერა და პარამეტრები მარჯვნივ */}
      {!error && <div className="relative z-20 flex items-center justify-between px-5 pb-4 pt-12">
        {/* მარცხენა მენიუ */}
        <button
          type="button"
          onClick={onEnd}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-all hover:bg-white/15 active:scale-95"
          aria-label="Menu"
        >
          <Menu size={22} />
        </button>

        {/* მარჯვენა მართვა: კამერა და მეტი */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleCamera}
            className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95 ${
              cameraOn ? 'bg-white text-black' : 'bg-white/10 text-white/90 hover:bg-white/15'
            }`}
            aria-label="Camera"
          >
            {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          {cameraOn && onFlipCamera && (
            <button
              type="button"
              onClick={onFlipCamera}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-all hover:bg-white/25 active:scale-95"
              aria-label="Flip camera"
              title={cameraFacing === "user" ? "უკანა კამერა" : "სელფის კამერა"}
            >
              <SwitchCamera size={20} />
            </button>
          )}
          {showCaptions && <button
            type="button"
            onClick={() => setCaptionsOn((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md transition-all hover:bg-white/15 active:scale-95"
            aria-label={t.captions}
            aria-pressed={captionsOn}
          >
            <Subtitles size={20} />
          </button>}
        </div>
      </div>}

      {/* 4. ცენტრალური სუბტიტრები (მოტივტივე რეალურ დროში) */}
      <div data-testid="live-content" className="relative z-10 mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col justify-start overflow-y-auto overscroll-contain px-6 pb-3 pt-10">
        {error ? (
          <LiveErrorPanel
            icon={isMicErrorCode(error) ? <MicOff size={32} /> : <WifiOff size={32} />}
            headline={liveErrorHeadline(error, locale)}
            reason={t.errors[error]}
            hint={t.hints[error]}
            detailName={errorDetail?.name}
            locale={locale}
          >
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-95"
              >
                <RotateCcw size={16} /> {t.retry}
              </button>
            )}
          </LiveErrorPanel>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <p data-testid="live-status" aria-live="polite" className="text-[16px] leading-relaxed text-white/70">{t.status[status]}</p>
            {audioBlocked && onResumeAudio && (
              <button type="button" onClick={onResumeAudio}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[16px] font-semibold text-black">
                <Volume2 size={18} aria-hidden="true" /> {t.tapToStart}
              </button>
            )}
            {/* დიდი რეალურ დროში გამომავალი ქართული ტექსტი */}
            {showCaptions && captionsOn && <div role="log" aria-live="polite" aria-relevant="additions" aria-label={t.captions} className="space-y-3">
              {lastUserLine && <p aria-hidden={lastUserLine.final ? undefined : true} className="text-[16px] leading-relaxed text-white/60">{lastUserLine.text}</p>}
              {lastAgentLine && <p aria-hidden={lastAgentLine.final ? undefined : true} className="text-[26px] font-semibold leading-relaxed tracking-tight text-white drop-shadow-md sm:text-[32px]">
                {lastAgentCaption}
              </p>}
            </div>}

            {/* AI მინიშნება და მოქმედებების ღილაკები */}
            {showCaptions && captionsOn && lastAgentCaption && (
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center gap-4 text-xs text-white/50">
                  <button type="button" className="transition-colors hover:text-white">
                    <ThumbsUp size={15} />
                  </button>
                  <button type="button" className="transition-colors hover:text-white">
                    <ThumbsDown size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={copyTranscript}
                    aria-label={copied ? t.copied : locale === 'ka' ? 'ტექსტის კოპირება' : locale === 'ru' ? 'Скопировать текст' : 'Copy text'}
                    className="transition-colors hover:text-white"
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <span className="text-[11px] font-normal tracking-wide text-white/35">
                  Agent G is AI and can make mistakes.
                </span>
              </div>
            )}
            {onOpenAction && <LiveActionCards cards={actions} locale={locale} onOpen={onOpenAction} className="-mx-6" />}
          </div>
        )}
      </div>

      {/* 5. ქვედა სამართავი პანელი (Gemini Live Controls) */}
      <div data-testid="live-controls" className="relative z-20 flex w-full shrink-0 flex-col items-center justify-center px-4 pb-10 pt-4">
        {/* "Tap to interrupt" ღილაკი, როდესაც აგენტი საუბრობს */}
        {!error && isSpeaking && onStopSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="mb-4 animate-pulse rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/90 shadow-lg backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
          >
            Tap to interrupt
          </button>
        )}
        {!error && extraControls && <div className="mb-3 flex max-w-full flex-wrap items-center justify-center gap-3">{extraControls}</div>}

        {/* 5 ჰორიზონტალური ღილაკი ზუსტად რეფერენსის მიხედვით */}
        <div className="flex w-full max-w-sm items-center justify-center gap-3.5 sm:gap-5">
          {!error && <>
          {/* 1. "+" ღილაკი */}
          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-md backdrop-blur-xl transition-all hover:bg-white/15 active:scale-95"
            aria-label="Add"
          >
            <Plus size={22} />
          </button>

          {/* 2. ვიდეო კამერის და სელფის შემოტრიალების ღილაკი */}
          {cameraOn && onFlipCamera && (
            <button
              type="button"
              onClick={onFlipCamera}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/15 text-white shadow-md backdrop-blur-xl transition-all hover:bg-white/25 active:scale-95"
              aria-label="Flip camera"
            >
              <SwitchCamera size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCamera}
            className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/10 shadow-md backdrop-blur-xl transition-all active:scale-95 ${
              cameraOn ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/15'
            }`}
            aria-label="Toggle camera"
          >
            {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          {/* 3. ცენტრალური მანათობელი ცისფერი აუდიო-კაფსულა (Live Glowing Audio Pill) */}
          <div
            onClick={isSpeaking && onStopSpeaking ? onStopSpeaking : undefined}
            className="relative flex h-12 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-blue-400/50 shadow-[0_0_35px_rgba(59,130,246,0.6)] transition-all active:scale-95 sm:w-32"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #38bdf8 100%)',
            }}
          >
            {/* მოძრავი ხმის ტალღები კაფსულის შიგნით */}
            <div className="flex items-center gap-1">
              {[0.4, 0.8, 1, 0.7, 0.3].map((h, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-white transition-all duration-150"
                  style={{
                    height:
                      isSpeaking || isListening
                        ? `${Math.max(6, 24 * h * (1 + activeLevel * 2))}px`
                        : '6px',
                    opacity: isSpeaking || isListening ? 1 : 0.6,
                  }}
                />
              ))}
            </div>
          </div>

          {/* 4. მიკროფონის ღილაკი */}
          <button
            type="button"
            onClick={onToggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/10 shadow-md backdrop-blur-xl transition-all active:scale-95 ${
              muted
                ? 'border-rose-500/30 bg-rose-500/20 text-rose-300'
                : 'bg-white/10 text-white hover:bg-white/15'
            }`}
            aria-label="Mute"
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* 5. ზარის დასრულების ღილაკი (✕) */}
          </>}
          <button
            type="button"
            onClick={onEnd}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-md backdrop-blur-xl transition-all hover:border-rose-500/40 hover:bg-rose-500/25 hover:text-rose-300 active:scale-95"
            aria-label={t.end}
          >
            <X size={22} />
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

export default LiveModeOverlay;

export { LiveControl } from './LiveCallChrome';
